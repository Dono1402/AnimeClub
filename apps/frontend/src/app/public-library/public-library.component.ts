import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { combineLatest } from 'rxjs';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { AnimethequeEntry, WatchStatus } from '../models/animetheque.model';
import { MangaLibraryEntry } from '../models/manga.model';
import { PublicProfile } from '../models/public-profile.model';
import { AnimethequeService } from '../services/animetheque.service';
import { AuthService } from '../services/auth.service';
import { MangaLibraryService } from '../services/manga-library.service';
import { ProfileService } from '../services/profile.service';
import { SeoService } from '../services/seo.service';
import { isMovieEntry } from '../utils/anime-format.util';

type PublicLibraryMode = 'anime' | 'manga';

@Component({
  selector: 'app-public-library',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MenuBarComponent],
  templateUrl: './public-library.component.html',
  styleUrl: './public-library.component.scss',
})
export class PublicLibraryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly profileService = inject(ProfileService);
  private readonly animethequeService = inject(AnimethequeService);
  private readonly mangaLibraryService = inject(MangaLibraryService);
  private readonly authService = inject(AuthService);
  private readonly seoService = inject(SeoService);

  readonly mode = signal<PublicLibraryMode>('anime');
  readonly account = toSignal(this.authService.account$, {
    initialValue: this.authService.currentAccount(),
  });
  readonly profile = signal<PublicProfile | null>(null);
  readonly animeEntries = signal<AnimethequeEntry[]>([]);
  readonly mangaEntries = signal<MangaLibraryEntry[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal('');

  readonly displayName = computed(() => this.profile()?.displayName || this.profile()?.pseudo || 'Profil');
  readonly initials = computed(() => this.displayName().slice(0, 1).toUpperCase() || 'A');
  readonly profilePictureUrl = computed(() => this.profileService.assetUrl(this.profile()?.profilePictureUrl));
  readonly titleLabel = computed(() => (this.mode() === 'anime' ? 'Animethèque' : 'Mangathèque'));
  readonly entryCount = computed(() => (this.mode() === 'anime' ? this.animeEntries().length : this.mangaEntries().length));

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.data]).subscribe(([params, data]) => {
      const pseudo = params.get('pseudo')?.trim();
      const mode = data['libraryMode'] === 'manga' ? 'manga' : 'anime';

      if (!pseudo) {
        this.showNotFound();
        return;
      }

      this.load(pseudo, mode);
    });
  }

  animeRoute(entry: AnimethequeEntry): string[] {
    if (entry.trackingMode === 'SEASON' && entry.parentAnimeSlug && entry.seasonSlug) {
      return ['/animes', entry.parentAnimeSlug, 'seasons', entry.seasonSlug];
    }

    return ['/animes', entry.parentAnimeSlug || entry.animeSlug];
  }

  mangaRoute(entry: MangaLibraryEntry): string[] {
    return entry.mangaSlug ? ['/manga', entry.mangaSlug] : ['/manga'];
  }

  statusLabel(status: WatchStatus): string {
    switch (status) {
      case 'WATCHING':
        return 'En cours';
      case 'COMPLETED':
        return 'Terminé';
      case 'PAUSED':
        return 'En pause';
      case 'DROPPED':
        return 'Abandonné';
      case 'PLANNED':
      default:
        return 'À lire';
    }
  }

  animeProgressLabel(entry: AnimethequeEntry): string {
    if (isMovieEntry(entry)) {
      return entry.status === 'COMPLETED' || entry.watchedEpisodes > 0 ? 'Film terminé' : 'Film non terminé';
    }

    const total = entry.totalEpisodes > 0 ? entry.totalEpisodes : '?';
    return `${entry.watchedEpisodes}/${total} épisodes`;
  }

  mangaProgressLabel(entry: MangaLibraryEntry): string {
    const total = entry.totalVolumes > 0 ? entry.totalVolumes : '?';
    return `${entry.readVolumes}/${total} tomes`;
  }

  animeProgressPercent(entry: AnimethequeEntry): number {
    if (isMovieEntry(entry)) {
      return entry.status === 'COMPLETED' || entry.watchedEpisodes > 0 ? 100 : 0;
    }

    return this.progressPercent(entry.watchedEpisodes, entry.totalEpisodes);
  }

  mangaProgressPercent(entry: MangaLibraryEntry): number {
    return this.progressPercent(entry.readVolumes, entry.totalVolumes);
  }

  updatedAtLabel(value: string | undefined): string {
    if (!value) {
      return '';
    }

    return new Intl.DateTimeFormat('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(value));
  }

  private load(pseudo: string, mode: PublicLibraryMode): void {
    this.mode.set(mode);
    this.profile.set(null);
    this.animeEntries.set([]);
    this.mangaEntries.set([]);
    this.errorMessage.set('');
    this.loading.set(true);

    this.profileService.getPublicProfile(pseudo).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.updateSeo(profile, mode);
        this.loadEntries(profile.id, mode);
      },
      error: () => this.showNotFound(),
    });
  }

  private loadEntries(accountId: number, mode: PublicLibraryMode): void {
    const ownProfile = this.account()?.id === accountId;
    const profile = this.profile();

    if (!ownProfile && mode === 'anime' && profile?.showAnimeLibrary === false) {
      this.errorMessage.set('Cette Animethèque est privée.');
      this.loading.set(false);
      return;
    }

    if (!ownProfile && mode === 'manga' && profile?.showMangaLibrary === false) {
      this.errorMessage.set('Cette Mangathèque est privée.');
      this.loading.set(false);
      return;
    }

    if (mode === 'manga') {
      const request = ownProfile
        ? this.mangaLibraryService.list(accountId)
        : this.mangaLibraryService.publicList(accountId);

      request.subscribe({
        next: (entries) => {
          this.mangaEntries.set(this.sortByUpdate(entries));
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Impossible de charger cette liste pour le moment.');
          this.loading.set(false);
        },
      });
      return;
    }

    const request = ownProfile
      ? this.animethequeService.list(accountId)
      : this.animethequeService.publicList(accountId);

    request.subscribe({
      next: (entries) => {
        this.animeEntries.set(this.sortByUpdate(entries));
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Impossible de charger cette liste pour le moment.');
        this.loading.set(false);
      },
    });
  }

  private progressPercent(current: number, total: number): number {
    if (total <= 0) {
      return 0;
    }

    return Math.min(100, Math.max(0, (current / total) * 100));
  }

  private updateSeo(profile: PublicProfile, mode: PublicLibraryMode): void {
    const libraryLabel = mode === 'anime' ? 'Animethèque' : 'Mangathèque';
    this.seoService.setPageMeta({
      title: `${libraryLabel} de ${profile.displayName || profile.pseudo} - AnimeClub`,
      description: `${libraryLabel} publique de ${profile.displayName || profile.pseudo} sur AnimeClub.`,
      image: this.profileService.assetUrl(profile.profilePictureUrl || profile.backgroundUrl) || undefined,
      type: 'profile',
    });
  }

  private sortByUpdate<T extends { updatedAt?: string }>(entries: T[]): T[] {
    return [...entries].sort((left, right) => {
      const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
      const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }

  private showNotFound(): void {
    this.profile.set(null);
    this.animeEntries.set([]);
    this.mangaEntries.set([]);
    this.errorMessage.set('Profil introuvable.');
    this.loading.set(false);
  }
}
