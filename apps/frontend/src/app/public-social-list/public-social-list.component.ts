import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { combineLatest } from 'rxjs';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { PublicProfile } from '../models/public-profile.model';
import { ProfileService } from '../services/profile.service';

type SocialListMode = 'followers' | 'following';

@Component({
  selector: 'app-public-social-list',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MenuBarComponent],
  templateUrl: './public-social-list.component.html',
  styleUrl: './public-social-list.component.scss',
})
export class PublicSocialListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly profileService = inject(ProfileService);

  readonly owner = signal<PublicProfile | null>(null);
  readonly profiles = signal<PublicProfile[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly mode = signal<SocialListMode>('followers');

  readonly title = computed(() => {
    const owner = this.owner();
    const name = owner?.displayName || owner?.pseudo || 'Profil';
    return this.mode() === 'followers' ? `Abonnés de ${name}` : `Suivis de ${name}`;
  });
  readonly countLabel = computed(() => {
    const label = this.mode() === 'followers' ? 'abonné' : 'profil suivi';
    return `${this.profiles().length} ${label}${this.profiles().length > 1 ? 's' : ''}`;
  });
  readonly emptyMessage = computed(() =>
    this.mode() === 'followers' ? 'Aucun abonné visible.' : 'Aucun suivi visible.',
  );

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.url]).subscribe(([params]) => {
      this.mode.set(this.routeMode());
      this.load(params.get('pseudo'));
    });
  }

  profilePicture(profile: PublicProfile): string | null {
    return this.profileService.assetUrl(profile.profilePictureUrl);
  }

  initials(profile: PublicProfile): string {
    return (profile.displayName || profile.pseudo || 'A').slice(0, 1).toUpperCase();
  }

  private load(rawPseudo: string | null): void {
    const pseudo = rawPseudo?.trim();
    if (!pseudo) {
      this.showError('Profil introuvable.');
      return;
    }

    this.owner.set(null);
    this.loading.set(true);
    this.errorMessage.set('');
    this.profiles.set([]);

    this.profileService.getPublicProfile(pseudo).subscribe({
      next: (profile) => {
        this.owner.set(profile);
        this.loadProfiles(profile.pseudo);
      },
      error: () => this.showError('Profil introuvable.'),
    });
  }

  private loadProfiles(pseudo: string): void {
    const owner = this.owner();
    if (this.mode() === 'followers' && owner?.showFollowers === false) {
      this.showError('Les abonnés de ce profil sont privés.');
      return;
    }

    if (this.mode() === 'following' && owner?.showFollowing === false) {
      this.showError('Les suivis de ce profil sont privés.');
      return;
    }

    const request = this.mode() === 'followers'
      ? this.profileService.publicFollowers(pseudo)
      : this.profileService.publicFollowing(pseudo);

    request.subscribe({
      next: (profiles) => {
        this.profiles.set(profiles);
        this.loading.set(false);
      },
      error: () => this.showError(this.mode() === 'followers'
        ? 'Les abonnés de ce profil sont privés.'
        : 'Les suivis de ce profil sont privés.'),
    });
  }

  private routeMode(): SocialListMode {
    return this.route.snapshot.routeConfig?.path?.includes('following') ? 'following' : 'followers';
  }

  private showError(message: string): void {
    this.profiles.set([]);
    this.errorMessage.set(message);
    this.loading.set(false);
  }
}
