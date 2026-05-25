import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { MarketingAnalyticsService } from '../services/marketing-analytics.service';
import { extractHttpErrorMessage } from '../utils/http-error-message';

@Component({
  selector: 'app-discord-auth-callback',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './discord-auth-callback.component.html',
  styleUrl: './discord-auth-callback.component.scss',
})
export class DiscordAuthCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly analytics = inject(MarketingAnalyticsService);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  ngOnInit(): void {
    const error = this.route.snapshot.queryParamMap.get('error');
    if (error) {
      this.fail("La connexion Discord a été annulée.");
      return;
    }

    const code = this.route.snapshot.queryParamMap.get('code');
    const state = this.route.snapshot.queryParamMap.get('state');
    if (!code) {
      this.fail('Code Discord manquant.');
      return;
    }

    if (!this.authService.consumeDiscordOAuthState(state)) {
      this.fail('Session Discord invalide. Relance la connexion depuis AnimeClub.');
      return;
    }

    this.authService.loginWithDiscord({
      code,
      redirectUri: this.authService.discordRedirectUri(),
    }).subscribe({
      next: (response) => {
        if (response.mode === 'signupRequired') {
          this.authService.storeDiscordSignup({
            signupToken: response.signupToken ?? '',
            email: response.email ?? '',
            suggestedPseudo: response.suggestedPseudo ?? '',
            expiresAt: response.expiresAt ?? '',
            message: response.message ?? 'Definis un mot de passe pour finaliser ton compte AnimeClub.',
          });
          void this.router.navigate(['/register/discord'], { replaceUrl: true });
          return;
        }

        this.analytics.trackEvent('login', {
          route: '/auth/discord/callback',
          method: 'discord',
        });
        void this.router.navigate(['/animes'], { replaceUrl: true });
      },
      error: (response: unknown) => {
        this.fail(extractHttpErrorMessage(
          response,
          'Connexion Discord impossible.',
          'Erreur réseau pendant la connexion Discord.',
        ));
      },
    });
  }

  private fail(message: string): void {
    this.errorMessage.set(message);
    this.isLoading.set(false);
  }
}
