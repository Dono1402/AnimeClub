import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { TranslatePipe } from '../pipes/translate.pipe';
import { LanguageService } from '../services/language.service';
import { SignupService } from '../services/signup.service';

@Component({
  selector: 'app-forgot-password',
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
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly languageService = inject(LanguageService);
  private readonly signupService = inject(SignupService);

  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly resetLink = signal<string | null>(null);
  readonly isSubmitting = signal(false);

  readonly form = this.formBuilder.nonNullable.group({
    mail: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
  });

  requestReset(): void {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    this.resetLink.set(null);
    this.isSubmitting.set(true);

    this.signupService.requestPasswordReset(this.form.getRawValue()).subscribe({
      next: (response) => {
        this.successMessage.set(response.message);
        this.resetLink.set(response.resetLink);
        this.form.reset();
        this.isSubmitting.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.extractMessage(error));
        this.isSubmitting.set(false);
      },
    });
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
