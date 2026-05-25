import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { MarketingAnalyticsService } from '../services/marketing-analytics.service';
import { extractHttpErrorMessage } from '../utils/http-error-message';

@Component({
  selector: 'app-form-sign-in',
  standalone: true,
  imports: [MenuBarComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './form-sign-in.component.html',
  styleUrl: './form-sign-in.component.scss',
})
export class FormSignInComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly languageService = inject(LanguageService);
  private readonly analytics = inject(MarketingAnalyticsService);

  readonly errorMessage = signal('');
  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);
  readonly isDiscordRedirecting = signal(false);

  readonly formSignIn = this.formBuilder.nonNullable.group({
    pseudo: ['', [Validators.required]],
    password: ['', [Validators.required]],
    rememberSession: [true],
  });

  togglePasswordVisibility(): void {
    this.showPassword.update((value) => !value);
  }

  continueWithDiscord(): void {
    this.errorMessage.set('');
    this.isDiscordRedirecting.set(true);
    this.analytics.trackEvent('discord_cta_click', {
      route: '/login',
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

  handleLogin(): void {
    if (this.formSignIn.invalid || this.isSubmitting()) {
      this.formSignIn.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.isSubmitting.set(true);

    const { rememberSession, ...credentials } = this.formSignIn.getRawValue();

    this.authService.login(credentials, rememberSession).subscribe({
      next: ({ account }) => {
        const targetRoute = account.usernameChangeRequired ? '/account' : '/animes';
        this.analytics.trackEvent('login', {
          route: '/login',
          method: 'email',
        });
        void this.router.navigate([targetRoute], { replaceUrl: true });
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.extractMessage(error));
        this.isSubmitting.set(false);
      },
    });
  }

  private extractMessage(error: unknown): string {
    return extractHttpErrorMessage(
      error,
      this.languageService.t('auth.loginError'),
      this.languageService.t('auth.networkError'),
    );
  }
}
