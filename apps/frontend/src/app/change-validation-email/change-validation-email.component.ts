import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { SignupService } from '../services/signup.service';
import { extractHttpErrorMessage } from '../utils/http-error-message';

@Component({
  selector: 'app-change-validation-email',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MenuBarComponent,
  ],
  templateUrl: './change-validation-email.component.html',
  styleUrl: '../forgot-password/forgot-password.component.scss',
})
export class ChangeValidationEmailComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly signupService = inject(SignupService);

  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly confirmationLink = signal<string | null>(null);
  readonly isSubmitting = signal(false);

  readonly form = this.formBuilder.nonNullable.group({
    identifier: ['', [Validators.required, Validators.maxLength(255)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    mail: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
  });

  changeEmail(): void {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    this.confirmationLink.set(null);
    this.isSubmitting.set(true);

    this.signupService.changePendingEmail(this.form.getRawValue()).subscribe({
      next: (response) => {
        this.successMessage.set(response.message);
        this.confirmationLink.set(response.confirmationLink);
        this.form.reset();
        this.isSubmitting.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(extractHttpErrorMessage(
          error,
          "Impossible de changer l'adresse de validation.",
          "Erreur reseau pendant le changement d'adresse.",
        ));
        this.isSubmitting.set(false);
      },
    });
  }
}
