import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { catchError, forkJoin, of } from 'rxjs';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { Account } from '../models/account.model';
import { AnimethequeEntry, WatchStatus } from '../models/animetheque.model';
import { MangaLibraryEntry } from '../models/manga.model';
import { PublicProfile } from '../models/public-profile.model';
import { FollowState } from '../models/social.model';
import { AnimethequeService } from '../services/animetheque.service';
import { AuthService } from '../services/auth.service';
import { MarketingAnalyticsService } from '../services/marketing-analytics.service';
import { MangaLibraryService } from '../services/manga-library.service';
import { ProfileService } from '../services/profile.service';
import { SeoService } from '../services/seo.service';
import {
  AnimeAchievementProgress,
  animeLevelHue,
  animeLevelNextHue,
  buildAnimeAchievementSummary,
} from '../utils/anime-achievements.util';
import { isMovieEntry } from '../utils/anime-format.util';

type LibraryKind = 'anime' | 'manga';
type CropTarget = 'profilePicture' | 'background';

interface CropState {
  target: CropTarget;
  sourceUrl: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
  aspectRatio: number;
  sourceAspectRatio: number;
}

interface MediaPanelPosition {
  left: number;
  top: number;
}

interface ProfileFavoriteItem {
  id: string;
  kind: LibraryKind;
  title: string;
  subtitle: string;
  coverUrl: string;
  route: string | string[];
  queryParams: Record<string, string> | null;
  updatedAt: string;
}

interface ProfileActivityItem {
  id: string;
  kind: LibraryKind;
  icon: string;
  title: string;
  subtitle: string;
  timeLabel: string;
  route: string | string[];
  queryParams: Record<string, string> | null;
  updatedAt: string;
}

interface ProfileGenreChip {
  name: string;
  kind: LibraryKind | 'mixed';
  count: number;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const SOURCE_MAX_BYTES = 24 * 1024 * 1024;
const CROP_SETTINGS: Record<CropTarget, { aspectRatio: number; outputWidth: number; outputHeight: number; maxBytes: number }> = {
  profilePicture: {
    aspectRatio: 1,
    outputWidth: 640,
    outputHeight: 640,
    maxBytes: 4 * 1024 * 1024,
  },
  background: {
    aspectRatio: 4,
    outputWidth: 1600,
    outputHeight: 400,
    maxBytes: 10 * 1024 * 1024,
  },
};

@Component({
  selector: 'app-public-profile',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MenuBarComponent],
  templateUrl: './public-profile.component.html',
  styleUrl: './public-profile.component.scss',
})
export class PublicProfileComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly profileService = inject(ProfileService);
  private readonly animethequeService = inject(AnimethequeService);
  private readonly mangaLibraryService = inject(MangaLibraryService);
  private readonly authService = inject(AuthService);
  private readonly analytics = inject(MarketingAnalyticsService);
  private readonly seoService = inject(SeoService);

  private cropImage: HTMLImageElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private objectUrls: string[] = [];
  private cropDrag:
    | {
        pointerId: number;
        startX: number;
        startY: number;
        initialOffsetX: number;
        initialOffsetY: number;
        frameWidth: number;
        frameHeight: number;
        maxTravelX: number;
        maxTravelY: number;
      }
    | null = null;

  readonly account = toSignal(this.authService.account$, {
    initialValue: this.authService.currentAccount(),
  });
  readonly profile = signal<PublicProfile | null>(null);
  readonly animeEntries = signal<AnimethequeEntry[]>([]);
  readonly mangaEntries = signal<MangaLibraryEntry[]>([]);
  readonly followState = signal<FollowState | null>(null);
  readonly loading = signal(true);
  readonly followSaving = signal(false);
  readonly mediaSaving = signal(false);
  readonly cacheVersion = signal(Date.now());
  readonly backgroundPreview = signal<string | null>(null);
  readonly profilePicturePreview = signal<string | null>(null);
  readonly cropState = signal<CropState | null>(null);
  readonly mediaActionTarget = signal<CropTarget | null>(null);
  readonly mediaPanelPosition = signal<MediaPanelPosition>({ left: 24, top: 24 });
  readonly errorMessage = signal('');
  readonly followFeedback = signal('');
  readonly shareFeedback = signal('');
  readonly mediaFeedback = signal('');
  readonly toastMessage = signal('');

  readonly displayName = computed(() => this.profile()?.displayName || this.profile()?.pseudo || 'Profil');
  readonly initials = computed(() => this.displayName().slice(0, 1).toUpperCase() || 'A');
  readonly profilePictureUrl = computed(
    () => this.profilePicturePreview() || this.profileService.assetUrl(this.profile()?.profilePictureUrl, this.cacheVersion()),
  );
  readonly backgroundUrl = computed(
    () => this.backgroundPreview() || this.profileService.assetUrl(this.profile()?.backgroundUrl, this.cacheVersion()),
  );
  readonly accentColor = computed(() => this.profile()?.accentColor || '#ff6f4f');
  readonly bannerStyle = computed(() => {
    const backgroundUrl = this.backgroundUrl();
    return backgroundUrl
      ? `linear-gradient(90deg, rgba(5, 7, 9, 0.82), rgba(5, 7, 9, 0.36) 48%, rgba(5, 7, 9, 0.86)), url("${backgroundUrl}")`
      : 'linear-gradient(90deg, rgba(5, 7, 9, 0.92), rgba(83, 49, 33, 0.48) 48%, rgba(5, 7, 9, 0.92)), url("assets/home-hero/call-of-the-night-hero.jpg")';
  });

  readonly animeSummary = computed(() => buildAnimeAchievementSummary(this.animeEntries()));
  readonly animeLevelHue = computed(() => animeLevelHue(this.animeSummary().level));
  readonly animeLevelNextHue = computed(() => animeLevelNextHue(this.animeSummary().level));
  readonly isOwnProfile = computed(() => {
    const account = this.account();
    const profile = this.profile();
    return Boolean(account && profile && account.id === profile.id);
  });
  readonly canFollow = computed(() => Boolean(this.account() && this.profile() && !this.isOwnProfile()));
  readonly canMessage = computed(() => this.followState()?.mutualFollow === true);
  readonly followersVisible = computed(() => this.followState()?.followersVisible ?? this.profile()?.showFollowers !== false);
  readonly followersCount = computed(() => this.followState()?.followersCount ?? this.profile()?.followersCount ?? 0);

  readonly animeTotal = computed(() => this.animeEntries().filter((entry) => !entry.favorite).length);
  readonly animeWatching = computed(() => this.animeEntries().filter((entry) => entry.status === 'WATCHING').length);
  readonly animeCompleted = computed(() => this.animeEntries().filter((entry) => entry.status === 'COMPLETED').length);
  readonly animeFavorites = computed(() => this.animeEntries().filter((entry) => entry.favorite).length);
  readonly animeWatchedEpisodes = computed(() =>
    this.animeEntries().reduce((total, entry) => total + Math.max(0, Number(entry.watchedEpisodes || 0)), 0),
  );
  readonly animeTotalEpisodes = computed(() =>
    this.animeEntries().reduce((total, entry) => total + Math.max(0, Number(entry.totalEpisodes || 0)), 0),
  );

  readonly mangaTotal = computed(() => this.mangaEntries().length);
  readonly mangaReading = computed(() => this.mangaEntries().filter((entry) => entry.status === 'WATCHING').length);
  readonly mangaCompleted = computed(() => this.mangaEntries().filter((entry) => entry.status === 'COMPLETED').length);
  readonly mangaFavorites = computed(() => this.mangaEntries().filter((entry) => entry.favorite).length);
  readonly mangaReadVolumes = computed(() =>
    this.mangaEntries().reduce((total, entry) => total + Math.max(0, Number(entry.readVolumes || 0)), 0),
  );
  readonly mangaTotalVolumes = computed(() =>
    this.mangaEntries().reduce((total, entry) => total + Math.max(0, Number(entry.totalVolumes || 0)), 0),
  );

  readonly favoriteItems = computed<ProfileFavoriteItem[]>(() => {
    const animeItems = this.animeEntries()
      .filter((entry) => entry.favorite)
      .map((entry) => this.favoriteFromAnime(entry));
    const mangaItems = this.mangaEntries()
      .filter((entry) => entry.favorite)
      .map((entry) => this.favoriteFromManga(entry));
    return [...animeItems, ...mangaItems]
      .sort((left, right) => this.timeValue(right.updatedAt) - this.timeValue(left.updatedAt))
      .slice(0, 5);
  });

  readonly activityItems = computed<ProfileActivityItem[]>(() => {
    const animeItems = this.animeEntries().map((entry) => this.activityFromAnime(entry));
    const mangaItems = this.mangaEntries().map((entry) => this.activityFromManga(entry));
    return [...animeItems, ...mangaItems]
      .sort((left, right) => this.timeValue(right.updatedAt) - this.timeValue(left.updatedAt))
      .slice(0, 4);
  });

  readonly badgePreview = computed<AnimeAchievementProgress[]>(() => {
    return [...this.animeSummary().unlockedAchievements]
      .sort((left, right) =>
        this.timeValue(right.unlockedAt ?? undefined) - this.timeValue(left.unlockedAt ?? undefined)
        || right.target - left.target
        || right.current - left.current,
      )
      .slice(0, 8);
  });

  readonly genreChips = computed<ProfileGenreChip[]>(() => {
    const byGenre = new Map<string, ProfileGenreChip>();
    for (const entry of this.animeEntries()) {
      for (const genre of entry.catalogGenres ?? []) {
        this.addGenre(byGenre, genre, 'anime');
      }
    }
    for (const entry of this.mangaEntries()) {
      for (const genre of entry.catalogGenres ?? []) {
        this.addGenre(byGenre, genre, 'manga');
      }
    }

    return [...byGenre.values()]
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' }))
      .slice(0, 8);
  });

  readonly completedAnimePercent = computed(() => this.percent(this.animeCompleted(), this.animeTotal()));
  readonly episodeProgressPercent = computed(() => this.percent(this.animeWatchedEpisodes(), this.animeTotalEpisodes()));
  readonly completedMangaPercent = computed(() => this.percent(this.mangaCompleted(), this.mangaTotal()));
  readonly volumeProgressPercent = computed(() => this.percent(this.mangaReadVolumes(), this.mangaTotalVolumes()));

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const pseudo = params.get('pseudo')?.trim() || this.account()?.pseudo?.trim();
      if (!pseudo) {
        this.showNotFound();
        return;
      }

      this.loadProfile(pseudo);
    });
  }

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.revokeObjectUrls();
  }

  @HostListener('document:click', ['$event'])
  closeMediaActionsOnOutsideClick(event: MouseEvent): void {
    if (!this.mediaActionTarget()) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('.media-panel')) {
      return;
    }

    this.closeMediaActions();
  }

  @HostListener('document:keydown.escape')
  closeMediaActionsOnEscape(): void {
    this.closeMediaActions();
  }

  animeLevelProgressLabel(): string {
    const progress = this.animeSummary();
    if (progress.isMaxLevel) {
      return 'Niveau maximum atteint';
    }

    return `${this.formatNumber(progress.xpIntoLevel)} / ${this.formatNumber(progress.xpForNextLevel)} XP vers le niveau ${progress.level + 1}`;
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
        return 'À voir';
    }
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

  publicProfileRoute(profile: PublicProfile): string[] {
    return ['/profile', profile.pseudo];
  }

  achievementRoute(profile: PublicProfile): string[] {
    return this.isOwnProfile() ? ['/achievements'] : ['/profile', profile.pseudo, 'achievements'];
  }

  animeLibraryRoute(profile: PublicProfile): string[] {
    return this.isOwnProfile() ? ['/anime-library'] : ['/profile', profile.pseudo, 'anime-library'];
  }

  mangaLibraryRoute(profile: PublicProfile): string[] {
    return this.isOwnProfile() ? ['/manga-library'] : ['/profile', profile.pseudo, 'manga-library'];
  }

  lastActiveLabel(profile: PublicProfile): string {
    if (profile.online) {
      return 'En ligne';
    }

    if (!profile.lastActiveAt) {
      return 'Hors ligne';
    }

    return `Vu ${this.relativeTimeLabel(profile.lastActiveAt)}`;
  }

  async shareProfile(): Promise<void> {
    const profile = this.profile();
    if (!profile || typeof window === 'undefined') {
      return;
    }

    const url = `${window.location.origin}/profile/${profile.pseudo}`;
    const title = `Profil de ${this.displayName()}`;
    const text = `Découvre le profil AnimeClub de ${this.displayName()}.`;

    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        this.shareFeedback.set('Lien du profil copié.');
      }
    } catch {
      this.shareFeedback.set('Partage annulé.');
    }
  }

  toggleFollow(): void {
    const account = this.account();
    const profile = this.profile();
    const state = this.followState();
    if (!account || !profile || this.isOwnProfile() || this.followSaving()) {
      return;
    }

    this.followSaving.set(true);
    this.followFeedback.set('');
    const request = state?.following
      ? this.profileService.unfollow(account.id, profile.id)
      : this.profileService.follow(account.id, profile.id);

    request.subscribe({
      next: (updatedState) => {
        this.followState.set(updatedState);
        this.followFeedback.set(updatedState.following ? 'Profil suivi.' : 'Profil retiré de tes suivis.');
        this.analytics.trackEvent('profile_follow', {
          route: `/profile/${profile.pseudo}`,
          profile_id: profile.id,
          profile_pseudo: profile.pseudo,
          following: updatedState.following,
        });
        this.followSaving.set(false);
      },
      error: () => {
        this.followFeedback.set('Action impossible pour le moment.');
        this.followSaving.set(false);
      },
    });
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat('fr-FR').format(Math.max(0, Math.round(Number(value || 0))));
  }

  selectProfilePicture(event: Event): void {
    this.selectImage(event, 'profilePicture');
  }

  selectBackground(event: Event): void {
    this.selectImage(event, 'background');
  }

  openMediaActions(target: CropTarget, input: HTMLInputElement, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.isOwnProfile()) {
      return;
    }

    const hasImage = target === 'profilePicture' ? Boolean(this.profilePictureUrl()) : Boolean(this.backgroundUrl());
    if (!hasImage) {
      input.click();
      return;
    }

    this.mediaPanelPosition.set(this.panelPositionFromPointer(event));
    this.mediaActionTarget.set(target);
  }

  closeMediaActions(): void {
    this.mediaActionTarget.set(null);
  }

  changeSelectedMedia(input: HTMLInputElement): void {
    this.closeMediaActions();
    input.click();
  }

  deleteSelectedMedia(): void {
    const target = this.mediaActionTarget();
    const account = this.account();
    this.closeMediaActions();

    if (!target || !account || !this.isOwnProfile()) {
      return;
    }

    this.mediaSaving.set(true);
    this.mediaFeedback.set('Suppression en cours...');

    if (target === 'profilePicture') {
      this.profilePicturePreview.set(null);

      if (!account.profilePictureUrl && !this.profile()?.profilePictureUrl) {
        this.applyMediaMessage('Photo de profil retirée.');
        return;
      }

      this.profileService.deleteProfilePicture(account.id).subscribe({
        next: (updatedAccount) => this.applyUpdatedAccount(updatedAccount, 'Photo de profil retirée.'),
        error: () => this.applyMediaError(),
      });
      return;
    }

    this.backgroundPreview.set(null);

    if (!account.backgroundUrl && !this.profile()?.backgroundUrl) {
      this.applyMediaMessage('Bannière retirée.');
      return;
    }

    this.profileService.deleteBackground(account.id).subscribe({
      next: (updatedAccount) => this.applyUpdatedAccount(updatedAccount, 'Bannière retirée.'),
      error: () => this.applyMediaError(),
    });
  }

  cropSelectionWidth(crop: CropState): number {
    const fullWidth = crop.sourceAspectRatio > crop.aspectRatio ? (crop.aspectRatio / crop.sourceAspectRatio) * 100 : 100;
    return fullWidth / crop.zoom;
  }

  cropSelectionHeight(crop: CropState): number {
    const fullHeight = crop.sourceAspectRatio > crop.aspectRatio ? 100 : (crop.sourceAspectRatio / crop.aspectRatio) * 100;
    return fullHeight / crop.zoom;
  }

  cropSelectionLeft(crop: CropState): number {
    const width = this.cropSelectionWidth(crop);
    const maxTravel = (100 - width) / 2;
    return 50 + maxTravel * (crop.offsetX / 50) - width / 2;
  }

  cropSelectionTop(crop: CropState): number {
    const height = this.cropSelectionHeight(crop);
    const maxTravel = (100 - height) / 2;
    return 50 + maxTravel * (crop.offsetY / 50) - height / 2;
  }

  startCropDrag(event: PointerEvent): void {
    const crop = this.cropState();
    if (!crop) {
      return;
    }

    const frame = event.currentTarget as HTMLElement;
    const selectionWidth = this.cropSelectionWidth(crop);
    const selectionHeight = this.cropSelectionHeight(crop);
    frame.setPointerCapture(event.pointerId);
    this.cropDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialOffsetX: crop.offsetX,
      initialOffsetY: crop.offsetY,
      frameWidth: frame.clientWidth || 1,
      frameHeight: frame.clientHeight || 1,
      maxTravelX: Math.max(0, (100 - selectionWidth) / 2),
      maxTravelY: Math.max(0, (100 - selectionHeight) / 2),
    };
    event.preventDefault();
  }

  moveCropDrag(event: PointerEvent): void {
    const drag = this.cropDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = drag.maxTravelX === 0 ? 0 : (((event.clientX - drag.startX) / drag.frameWidth) * 100 * 50) / drag.maxTravelX;
    const deltaY = drag.maxTravelY === 0 ? 0 : (((event.clientY - drag.startY) / drag.frameHeight) * 100 * 50) / drag.maxTravelY;
    this.cropState.update((crop) =>
      crop
        ? {
            ...crop,
            offsetX: this.clamp(drag.initialOffsetX + deltaX, -50, 50),
            offsetY: this.clamp(drag.initialOffsetY + deltaY, -50, 50),
          }
        : crop,
    );
    event.preventDefault();
  }

  endCropDrag(event: PointerEvent): void {
    if (this.cropDrag?.pointerId === event.pointerId) {
      const frame = event.currentTarget as HTMLElement;
      if (frame.hasPointerCapture(event.pointerId)) {
        frame.releasePointerCapture(event.pointerId);
      }
      this.cropDrag = null;
    }
  }

  zoomCrop(delta: number): void {
    this.cropState.update((crop) =>
      crop ? { ...crop, zoom: this.clamp(Number((crop.zoom + delta).toFixed(2)), 1, 3) } : crop,
    );
  }

  zoomCropWithWheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoomCrop(event.deltaY < 0 ? 0.1 : -0.1);
  }

  resetCrop(): void {
    this.cropState.update((crop) => (crop ? { ...crop, zoom: 1, offsetX: 0, offsetY: 0 } : crop));
  }

  cancelCrop(): void {
    this.cropDrag = null;
    this.cropState.set(null);
    this.cropImage = null;
  }

  async applyCrop(): Promise<void> {
    const crop = this.cropState();
    if (!crop || !this.cropImage) {
      return;
    }

    try {
      const file = await this.createCroppedFile(this.cropImage, crop);
      const previewUrl = URL.createObjectURL(file);
      this.objectUrls.push(previewUrl);

      if (crop.target === 'profilePicture') {
        this.profilePicturePreview.set(previewUrl);
      } else {
        this.backgroundPreview.set(previewUrl);
      }

      this.cancelCrop();
      this.uploadCroppedMedia(crop.target, file);
    } catch {
      this.mediaFeedback.set(crop.target === 'profilePicture' ? 'La photo dépasse 4 Mo après recadrage.' : 'La bannière dépasse 10 Mo après recadrage.');
    }
  }

  private loadProfile(pseudo: string): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.followFeedback.set('');
    this.shareFeedback.set('');
    this.mediaFeedback.set('');
    this.mediaActionTarget.set(null);
    this.cropState.set(null);
    this.profilePicturePreview.set(null);
    this.backgroundPreview.set(null);
    this.followState.set(null);
    this.animeEntries.set([]);
    this.mangaEntries.set([]);
    this.profile.set(null);

    this.profileService.getPublicProfile(pseudo).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.updateSeo(profile);
        this.analytics.trackEvent('profile_view', {
          route: `/profile/${profile.pseudo}`,
          profile_id: profile.id,
          profile_pseudo: profile.pseudo,
        });
        this.loadFollowState(profile.id);
        this.loadLibraries(profile.id);
      },
      error: () => this.showNotFound(),
    });
  }

  private updateSeo(profile: PublicProfile): void {
    this.seoService.setPageMeta({
      title: `Profil de ${profile.displayName || profile.pseudo} - AnimeClub`,
      description: `Profil public de ${profile.displayName || profile.pseudo} sur AnimeClub : favoris, badges, activité et listes publiques.`,
      image: this.profileService.assetUrl(profile.profilePictureUrl || profile.backgroundUrl) || undefined,
      type: 'profile',
      noindex: this.isOwnProfile(),
    });
  }

  private loadLibraries(profileId: number): void {
    const ownProfile = this.account()?.id === profileId;
    const profile = this.profile();
    const animeRequest = ownProfile
      ? this.animethequeService.list(profileId)
      : profile?.showAnimeLibrary === false
        ? of([] as AnimethequeEntry[])
        : this.animethequeService.publicList(profileId);
    const mangaRequest = ownProfile
      ? this.mangaLibraryService.list(profileId)
      : profile?.showMangaLibrary === false
        ? of([] as MangaLibraryEntry[])
        : this.mangaLibraryService.publicList(profileId);

    forkJoin({
      anime: animeRequest.pipe(catchError(() => of([] as AnimethequeEntry[]))),
      manga: mangaRequest.pipe(catchError(() => of([] as MangaLibraryEntry[]))),
    }).subscribe(({ anime, manga }) => {
      this.animeEntries.set(anime);
      this.mangaEntries.set(manga);
      this.loading.set(false);
    });
  }

  private loadFollowState(targetId: number): void {
    const account = this.account();
    if (!account) {
      return;
    }

    this.profileService.followState(account.id, targetId).subscribe({
      next: (state) => this.followState.set(state),
      error: () => this.followState.set(null),
    });
  }

  private selectImage(event: Event, target: CropTarget): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.closeMediaActions();

    if (!file) {
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      this.mediaFeedback.set('Format refusé. Utilise une image PNG, JPG, WebP ou GIF.');
      return;
    }

    if (file.size > SOURCE_MAX_BYTES) {
      this.mediaFeedback.set('Image trop lourde. Maximum 24 Mo avant recadrage.');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    this.objectUrls.push(objectUrl);
    this.openCropper(objectUrl, target);
  }

  private async openCropper(sourceUrl: string, target: CropTarget): Promise<void> {
    try {
      this.cropImage = await this.loadImage(sourceUrl);
      this.cropState.set({
        target,
        sourceUrl,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        aspectRatio: CROP_SETTINGS[target].aspectRatio,
        sourceAspectRatio: this.cropImage.naturalWidth / this.cropImage.naturalHeight,
      });
      this.mediaFeedback.set('Déplace l’image et ajuste le zoom avant de valider.');
    } catch {
      this.mediaFeedback.set('Impossible de charger cette image.');
    }
  }

  private uploadCroppedMedia(target: CropTarget, file: File): void {
    const account = this.account();
    if (!account || this.mediaSaving()) {
      return;
    }

    const formData = new FormData();
    formData.append(target === 'profilePicture' ? 'profilePicture' : 'background', file);

    this.mediaSaving.set(true);
    this.mediaFeedback.set('Enregistrement...');

    this.profileService.update(account.id, formData).subscribe({
      next: (updatedAccount) =>
        this.applyUpdatedAccount(updatedAccount, target === 'profilePicture' ? 'Photo de profil changée.' : 'Bannière changée.'),
      error: () => {
        if (target === 'profilePicture') {
          this.profilePicturePreview.set(null);
        } else {
          this.backgroundPreview.set(null);
        }

        this.applyMediaError();
      },
    });
  }

  private applyUpdatedAccount(account: Account, message: string): void {
    this.authService.updateCurrentAccount(account);
    this.profile.update((profile) =>
      profile && profile.id === account.id
        ? {
            ...profile,
            pseudo: account.pseudo,
            displayName: account.displayName,
            bio: account.bio,
            profileStatus: account.profileStatus,
            favoriteAnime: account.favoriteAnime,
            accentColor: account.accentColor,
            profilePictureUrl: account.profilePictureUrl,
            backgroundUrl: account.backgroundUrl,
            showFollowers: account.showFollowers,
            showFollowing: account.showFollowing,
            showAnimeLibrary: account.showAnimeLibrary,
            showMangaLibrary: account.showMangaLibrary,
          }
        : profile,
    );
    this.profilePicturePreview.set(null);
    this.backgroundPreview.set(null);
    this.cropState.set(null);
    this.cropImage = null;
    this.cacheVersion.set(Date.now());
    this.applyMediaMessage(message);
  }

  private applyMediaMessage(message: string): void {
    this.mediaSaving.set(false);
    this.mediaFeedback.set(message);
    this.showToast(message);
  }

  private applyMediaError(): void {
    this.mediaSaving.set(false);
    this.mediaFeedback.set('Enregistrement impossible pour le moment.');
  }

  private showToast(message: string): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastMessage.set(message);
    this.toastTimer = setTimeout(() => {
      this.toastMessage.set('');
      this.toastTimer = null;
    }, 3600);
  }

  private loadImage(sourceUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image loading failed'));
      image.src = sourceUrl;
    });
  }

  private async createCroppedFile(image: HTMLImageElement, crop: CropState): Promise<File> {
    const settings = CROP_SETTINGS[crop.target];
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;
    const imageAspectRatio = imageWidth / imageHeight;
    const baseCropWidth = imageAspectRatio > settings.aspectRatio ? imageHeight * settings.aspectRatio : imageWidth;
    const baseCropHeight = imageAspectRatio > settings.aspectRatio ? imageHeight : imageWidth / settings.aspectRatio;
    const cropWidth = baseCropWidth / crop.zoom;
    const cropHeight = baseCropHeight / crop.zoom;
    const centerX = imageWidth / 2 + ((imageWidth - cropWidth) / 2) * (crop.offsetX / 50);
    const centerY = imageHeight / 2 + ((imageHeight - cropHeight) / 2) * (crop.offsetY / 50);
    const sourceX = this.clamp(centerX - cropWidth / 2, 0, Math.max(0, imageWidth - cropWidth));
    const sourceY = this.clamp(centerY - cropHeight / 2, 0, Math.max(0, imageHeight - cropHeight));
    const canvas = document.createElement('canvas');
    canvas.width = settings.outputWidth;
    canvas.height = settings.outputHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas unavailable');
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      0,
      0,
      settings.outputWidth,
      settings.outputHeight,
    );

    let quality = 0.9;
    let blob = await this.canvasToBlob(canvas, quality);
    while (blob.size > settings.maxBytes && quality > 0.58) {
      quality -= 0.08;
      blob = await this.canvasToBlob(canvas, quality);
    }

    if (blob.size > settings.maxBytes) {
      throw new Error('Cropped image is too large');
    }

    const prefix = crop.target === 'profilePicture' ? 'avatar' : 'banner';
    return new File([blob], `${prefix}-${Date.now()}.jpg`, { type: 'image/jpeg' });
  }

  private canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }

          reject(new Error('Image export failed'));
        },
        'image/jpeg',
        quality,
      );
    });
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private revokeObjectUrls(): void {
    for (const objectUrl of this.objectUrls) {
      URL.revokeObjectURL(objectUrl);
    }
    this.objectUrls = [];
  }

  private panelPositionFromPointer(event: MouseEvent): MediaPanelPosition {
    const panelWidth = 280;
    const estimatedPanelHeight = 178;
    const viewportPadding = 16;
    const left = Math.min(
      Math.max(event.clientX - panelWidth / 2, viewportPadding),
      window.innerWidth - panelWidth - viewportPadding,
    );
    const top = Math.min(
      Math.max(event.clientY + 12, viewportPadding),
      window.innerHeight - estimatedPanelHeight - viewportPadding,
    );

    return { left, top };
  }

  private favoriteFromAnime(entry: AnimethequeEntry): ProfileFavoriteItem {
    return {
      id: `anime-${entry.id}`,
      kind: 'anime',
      title: entry.title,
      subtitle: entry.seasonTitle || entry.parentTitle || this.statusLabel(entry.status),
      coverUrl: entry.coverUrl,
      route: this.animeRoute(entry),
      queryParams: null,
      updatedAt: entry.updatedAt,
    };
  }

  private favoriteFromManga(entry: MangaLibraryEntry): ProfileFavoriteItem {
    return {
      id: `manga-${entry.id}`,
      kind: 'manga',
      title: entry.title,
      subtitle: entry.catalogType || this.statusLabel(entry.status),
      coverUrl: entry.coverUrl,
      route: this.mangaRoute(entry),
      queryParams: null,
      updatedAt: entry.updatedAt || '',
    };
  }

  private activityFromAnime(entry: AnimethequeEntry): ProfileActivityItem {
    const completed = entry.status === 'COMPLETED';
    const favorite = entry.favorite;
    return {
      id: `anime-${entry.id}`,
      kind: 'anime',
      icon: completed ? 'OK' : favorite ? '*' : 'TV',
      title: completed ? 'A terminé un anime' : favorite ? 'A ajouté un anime à ses favoris' : 'A mis à jour son Animethèque',
      subtitle: `${entry.title} · ${this.animeProgressLabel(entry)}`,
      timeLabel: this.relativeTimeLabel(entry.updatedAt || ''),
      route: this.animeRoute(entry),
      queryParams: null,
      updatedAt: entry.updatedAt,
    };
  }

  private activityFromManga(entry: MangaLibraryEntry): ProfileActivityItem {
    const completed = entry.status === 'COMPLETED';
    const favorite = entry.favorite;
    return {
      id: `manga-${entry.id}`,
      kind: 'manga',
      icon: completed ? 'OK' : favorite ? '*' : 'BD',
      title: completed ? 'A terminé un manga' : favorite ? 'A ajouté un manga à ses favoris' : 'A mis à jour sa Mangathèque',
      subtitle: `${entry.title} · ${this.mangaProgressLabel(entry)}`,
      timeLabel: this.relativeTimeLabel(entry.updatedAt || ''),
      route: this.mangaRoute(entry),
      queryParams: null,
      updatedAt: entry.updatedAt || '',
    };
  }

  private animeProgressLabel(entry: AnimethequeEntry): string {
    if (isMovieEntry(entry)) {
      return entry.status === 'COMPLETED' || entry.watchedEpisodes > 0 ? 'Film terminé' : 'Film non terminé';
    }

    return `${entry.watchedEpisodes}/${entry.totalEpisodes > 0 ? entry.totalEpisodes : '?'} épisodes`;
  }

  private mangaProgressLabel(entry: MangaLibraryEntry): string {
    return `${entry.readVolumes}/${entry.totalVolumes > 0 ? entry.totalVolumes : '?'} tomes`;
  }

  private addGenre(genres: Map<string, ProfileGenreChip>, rawGenre: string, kind: LibraryKind): void {
    const name = rawGenre.trim();
    if (!name) {
      return;
    }

    const existing = genres.get(name);
    if (!existing) {
      genres.set(name, { name, kind, count: 1 });
      return;
    }

    existing.count += 1;
    existing.kind = existing.kind === kind ? kind : 'mixed';
  }

  private percent(value: number, total: number): number {
    if (total <= 0) {
      return 0;
    }

    return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
  }

  private timeValue(value: string | undefined): number {
    if (!value) {
      return 0;
    }

    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  private relativeTimeLabel(value: string): string {
    const time = this.timeValue(value);
    if (!time) {
      return 'récemment';
    }

    const diffMs = Date.now() - time;
    const minutes = Math.max(0, Math.floor(diffMs / 60000));
    if (minutes < 1) {
      return 'à l’instant';
    }
    if (minutes < 60) {
      return `il y a ${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `il y a ${hours} h`;
    }

    const days = Math.floor(hours / 24);
    if (days < 8) {
      return `il y a ${days} j`;
    }

    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(time));
  }

  private showNotFound(): void {
    this.profile.set(null);
    this.animeEntries.set([]);
    this.mangaEntries.set([]);
    this.followState.set(null);
    this.errorMessage.set('Profil introuvable.');
    this.loading.set(false);
  }
}
