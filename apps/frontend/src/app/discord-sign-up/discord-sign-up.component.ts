import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { MarketingAnalyticsService } from '../services/marketing-analytics.service';
import { SignupService } from '../services/signup.service';
import { extractHttpErrorMessage } from '../utils/http-error-message';
import { MenuBarComponent } from '../menu-bar/menu-bar.component';

@Component({
  selector: 'app-discord-sign-up',
  standalone: true,
  imports: [MenuBarComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './discord-sign-up.component.html',
  styleUrl: '../form-sign-up/form-sign-up.component.scss',
})
export class DiscordSignUpComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly analytics = inject(MarketingAnalyticsService);
  private readonly signupService = inject(SignupService);

  readonly discordEmail = signal('');
  readonly signupToken = signal('');
  readonly setupMessage = signal('');
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly confirmationLink = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  readonly form = this.formBuilder.nonNullable.group(
    {
      pseudo: ['', [Validators.required, Validators.maxLength(16)]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
      confirmPassword: ['', [Validators.required]],
      acceptTerms: [false, [Validators.requiredTrue]],
    },
    {
      validators: (group) => {
        const password = group.get('password')?.value;
        const confirmPassword = group.get('confirmPassword')?.value;
        return password === confirmPassword ? null : { passwordNotMatch: true };
      },
    },
  );

  ngOnInit(): void {
    const data = this.authService.readDiscordSignup();
    if (!data) {
      this.errorMessage.set("Session d'inscription Discord expirée. Relance la connexion Discord.");
      return;
    }

    this.discordEmail.set(data.email);
    this.signupToken.set(data.signupToken);
    this.setupMessage.set(data.message);
    this.form.patchValue({ pseudo: data.suggestedPseudo });
  }

  togglePasswordVisibility(field: 'password' | 'confirmPassword'): void {
    if (field === 'password') {
      this.showPassword.update((value) => !value);
      return;
    }

    this.showConfirmPassword.update((value) => !value);
  }

  createAccount(): void {
    if (!this.signupToken() || this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.confirmationLink.set(null);
    this.analytics.trackEvent('sign_up_start', {
      route: '/register/discord',
      method: 'discord',
    });

    const { pseudo, password } = this.form.getRawValue();
    this.signupService.createDiscordAccount({
      signupToken: this.signupToken(),
      pseudo,
      password,
    }).subscribe({
      next: (response) => {
        this.authService.clearDiscordSignup();
        this.form.reset();
        this.isSubmitting.set(false);
        this.analytics.trackEvent('sign_up_complete', {
          route: '/register/discord',
          method: 'discord',
        });
        this.successMessage.set(
          `Compte ${response.account.pseudo} créé. Confirme ton adresse mail avant de te connecter.`,
        );
        this.confirmationLink.set(response.confirmationLink);
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(extractHttpErrorMessage(
          error,
          'Impossible de finaliser le compte Discord.',
          'Erreur réseau pendant la finalisation Discord.',
        ));
      },
    });
  }
}
