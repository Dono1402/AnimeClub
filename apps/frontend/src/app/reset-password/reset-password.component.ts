import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { TranslatePipe } from '../pipes/translate.pipe';
import { LanguageService } from '../services/language.service';
import { SignupService } from '../services/signup.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MenuBarComponent,
    TranslatePipe,
  ],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly languageService = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly signupService = inject(SignupService);
  private token = '';

  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly isSubmitting = signal(false);
  readonly isSuccess = signal(false);
  readonly hasToken = signal(true);

  readonly form = this.formBuilder.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: this.passwordMatchValidator },
  );

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.hasToken.set(false);
      this.errorMessage.set(this.languageService.t('auth.resetPasswordInvalidLink'));
      return;
    }

    this.token = token;
  }

  resetPassword(): void {
    if (!this.hasToken()) {
      return;
    }

    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    this.isSubmitting.set(true);

    const { password } = this.form.getRawValue();
    this.signupService.resetPassword({ token: this.token, password }).subscribe({
      next: (response) => {
        this.successMessage.set(response.message);
        this.isSuccess.set(true);
        this.form.reset();
        this.isSubmitting.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.extractMessage(error));
        this.isSubmitting.set(false);
      },
    });
  }

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { passwordNotMatch: true };
  }

  private extractMessage(error: unknown): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'message' in error.error &&
      typeof error.error.message === 'string'
    ) {
      return error.error.message;
    }

    return this.languageService.t('auth.passwordResetError');
  }
}
