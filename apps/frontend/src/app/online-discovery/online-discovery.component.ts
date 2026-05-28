import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { Subscription, catchError, finalize, of } from 'rxjs';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { PublicProfile } from '../models/public-profile.model';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';

const DISCOVERY_REFRESH_INTERVAL_MS = 15000;

@Component({
  selector: 'app-online-discovery',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MenuBarComponent],
  templateUrl: './online-discovery.component.html',
  styleUrl: './online-discovery.component.scss',
})
export class OnlineDiscoveryComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);

  readonly profiles = signal<PublicProfile[]>([]);
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly feedback = signal('');
  readonly profileSearch = signal('');
  readonly followPendingIds = signal<Set<number>>(new Set());

  private readonly subscriptions = new Subscription();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly filteredProfiles = computed(() => {
    const query = this.normalizeSearch(this.profileSearch());
    const profiles = this.profiles();

    if (!query) {
      return profiles;
    }

    return profiles.filter((profile) => this.profileMatchesSearch(profile, query));
  });

  readonly countLabel = computed(() => {
    const total = this.profiles().length;
    const filtered = this.filteredProfiles().length;

    if (this.profileSearch().trim()) {
      return `${filtered}/${total} profils`;
    }

    return `${total} ${total > 1 ? 'profils' : 'profil'}`;
  });

  readonly emptyMessage = computed(() => {
    if (this.profileSearch().trim()) {
      return 'Aucun profil à découvrir ne correspond à cette recherche.';
    }

    return 'Aucun profil à découvrir pour le moment.';
  });

  ngOnInit(): void {
    this.load();
    this.refreshTimer = setInterval(() => this.refreshSilently(), DISCOVERY_REFRESH_INTERVAL_MS);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.subscriptions.unsubscribe();
  }

  load(): void {
    this.fetchProfiles(false);
  }

  refresh(): void {
    this.fetchProfiles(true);
  }

  setProfileSearch(event: Event): void {
    this.profileSearch.set((event.target as HTMLInputElement).value);
  }

  clearProfileSearch(): void {
    this.profileSearch.set('');
  }

  follow(profile: PublicProfile): void {
    const account = this.authService.currentAccount();
    if (!account || this.isFollowPending(profile.id)) {
      return;
    }

    this.feedback.set('');
    this.followPendingIds.update((ids) => new Set(ids).add(profile.id));

    this.subscriptions.add(
      this.profileService
        .follow(account.id, profile.id)
        .pipe(
          catchError(() => {
            this.feedback.set('Impossible de suivre ce profil pour le moment.');
            return of(null);
          }),
          finalize(() => this.followPendingIds.update((ids) => {
            const next = new Set(ids);
            next.delete(profile.id);
            return next;
          })),
        )
        .subscribe((state) => {
          if (!state) {
            return;
          }

          this.profiles.update((profiles) => profiles.filter((candidate) => candidate.id !== profile.id));
          this.feedback.set(`${this.displayName(profile)} est maintenant dans tes suivis.`);
        }),
    );
  }

  isFollowPending(profileId: number): boolean {
    return this.followPendingIds().has(profileId);
  }

  profilePicture(profile: PublicProfile): string | null {
    return this.profileService.assetUrl(profile.profilePictureUrl);
  }

  initials(profile: PublicProfile): string {
    return (profile.displayName || profile.pseudo || 'A').slice(0, 1).toUpperCase();
  }

  displayName(profile: PublicProfile): string {
    return profile.displayName || profile.pseudo;
  }

  profileStatusLine(profile: PublicProfile): string {
    if (profile.profileStatus?.trim()) {
      return profile.profileStatus.trim();
    }

    if (profile.favoriteAnime?.trim()) {
      return `Favori : ${profile.favoriteAnime.trim()}`;
    }

    return profile.online ? 'Disponible maintenant' : 'Hors ligne, mais disponible à suivre';
  }

  profileSocialLine(profile: PublicProfile): string {
    return this.countLabelFor(profile.followersCount, 'abonné', 'abonnés');
  }

  private refreshSilently(): void {
    if (document.hidden) {
      return;
    }

    this.fetchProfiles(true, true);
  }

  private fetchProfiles(isRefresh: boolean, silent = false): void {
    const account = this.authService.currentAccount();
    if (!account) {
      this.loading.set(false);
      this.refreshing.set(false);
      this.feedback.set('Connecte-toi pour découvrir les profils.');
      return;
    }

    const hasProfiles = this.profiles().length > 0;
    this.loading.set(!isRefresh && !hasProfiles);
    this.refreshing.set(isRefresh && !silent);
    if (!silent) {
      this.feedback.set('');
    }

    this.subscriptions.add(
      this.profileService
        .onlineDiscoveryProfiles(account.id)
        .pipe(
          catchError(() => {
            if (!silent) {
              this.feedback.set('Impossible de charger les profils à découvrir.');
            }
            return of([] as PublicProfile[]);
          }),
          finalize(() => {
            this.loading.set(false);
            this.refreshing.set(false);
          }),
        )
        .subscribe((profiles) => {
          this.profiles.set(profiles);
        }),
    );
  }

  private profileMatchesSearch(profile: PublicProfile, query: string): boolean {
    return this.normalizeSearch([
      profile.displayName,
      profile.pseudo,
      profile.profileStatus,
      profile.favoriteAnime,
      profile.bio,
    ]
      .filter(Boolean)
      .join(' ')).includes(query);
  }

  private normalizeSearch(value: string | null | undefined): string {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private countLabelFor(count: number, singular: string, plural: string): string {
    const safeCount = Math.max(0, Number(count || 0));
    return `${safeCount} ${safeCount > 1 ? plural : singular}`;
  }
}
