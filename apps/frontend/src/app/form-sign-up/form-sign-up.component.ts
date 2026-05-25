import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map, of, switchMap } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { MarketingAnalyticsService } from '../services/marketing-analytics.service';
import { SignupService } from '../services/signup.service';
import { extractHttpErrorMessage } from '../utils/http-error-message';
import { MenuBarComponent } from '../menu-bar/menu-bar.component';

@Component({
  selector: 'app-form-sign-up',
  standalone: true,
  imports: [MenuBarComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './form-sign-up.component.html',
  styleUrl: './form-sign-up.component.scss',
})
export class FormSignUpComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly signupService = inject(SignupService);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly analytics = inject(MarketingAnalyticsService);
  private readonly router = inject(Router);

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly confirmationLink = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly isDiscordRedirecting = signal(false);

  readonly formSignUp = this.formBuilder.nonNullable.group(
    {
      pseudo: ['', [Validators.required, Validators.maxLength(16)]],
      mail: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
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

  togglePasswordVisibility(field: 'password' | 'confirmPassword'): void {
    if (field === 'password') {
      this.showPassword.update((value) => !value);
      return;
    }

    this.showConfirmPassword.update((value) => !value);
  }

  continueWithDiscord(): void {
    this.successMessage.set('');
    this.confirmationLink.set(null);
    this.errorMessage.set('');
    this.isDiscordRedirecting.set(true);
    this.analytics.trackEvent('discord_cta_click', {
      route: '/register',
      target: 'discord_oauth',
      cta: 'continue_with_discord',
    });

    const state = this.authService.createDiscordOAuthState();
    const redirectUri = this.authService.discordRedirectUri();
    this.authService.discordAuthorizeUrl(redirectUri, state).subscribe({
      next: ({ authorizationUrl }) => {
        window.location.assign(authorizationUrl);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.extractMessage(error));
        this.isDiscordRedirecting.set(false);
      },
    });
  }

  createAccount(): void {
    if (this.formSignUp.invalid || this.isSubmitting()) {
      this.formSignUp.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.confirmationLink.set(null);
    this.analytics.trackEvent('sign_up_start', {
      route: '/register',
      method: 'email',
    });

    const { pseudo, mail, password } = this.formSignUp.getRawValue();
    this.signupService
      .createAccount({ pseudo, mail, password })
      .pipe(
        switchMap((response) => {
          const confirmationToken = this.confirmationToken(response.confirmationLink);
          if (!confirmationToken) {
            return of({ response, loggedIn: false });
          }

          return this.signupService.confirmEmail(confirmationToken).pipe(
            switchMap(() => this.authService.login({ pseudo, password }, true)),
            map(() => ({ response, loggedIn: true })),
          );
        }),
      )
      .subscribe({
        next: ({ response, loggedIn }) => {
          this.formSignUp.reset();
          this.isSubmitting.set(false);
          this.analytics.trackEvent('sign_up_complete', {
            route: '/register',
            method: 'email',
            user_logged_in: loggedIn,
          });

          if (loggedIn) {
            void this.router.navigate(['/animes'], { replaceUrl: true });
            return;
          }

          this.successMessage.set(this.languageService.t('auth.createSuccess', { pseudo: response.account.pseudo }));
          this.confirmationLink.set(response.confirmationLink);
        },
        error: (error: unknown) => {
          this.errorMessage.set(this.extractMessage(error));
          this.isSubmitting.set(false);
        },
      });
  }

  private confirmationToken(confirmationLink: string | null): string | null {
    if (!confirmationLink) {
      return null;
    }

    try {
      return new URL(confirmationLink, window.location.origin).searchParams.get('token');
    } catch {
      return null;
    }
  }

  private extractMessage(error: unknown): string {
    return extractHttpErrorMessage(
      error,
      this.languageService.t('auth.createError'),
      this.languageService.t('auth.networkError'),
    );
  }
}
