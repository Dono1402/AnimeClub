import { Component, HostListener, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { catchError, concatMap, from, map, of } from 'rxjs';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { AnimeEpisodeOption, PopularAnime, PopularAnimeSeason } from '../models/anime.model';
import { AnimethequeEntry, AnimethequeEntryRequest, WatchStatus } from '../models/animetheque.model';
import { CharacterCatalogEntry } from '../models/character.model';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AnimeCatalogService } from '../services/anime-catalog.service';
import { AnimethequeService } from '../services/animetheque.service';
import { AuthService } from '../services/auth.service';
import { AchievementNotificationService } from '../services/achievement-notification.service';
import { CharacterCatalogService } from '../services/character-catalog.service';
import { LanguageService } from '../services/language.service';
import { MarketingAnalyticsService } from '../services/marketing-analytics.service';
import { SeoService } from '../services/seo.service';
import { animeTypeLabel, isMovieAnime, isMovieSeason, isMovieType } from '../utils/anime-format.util';
import { cleanSeasonTitle, labelMainSeason, mainSeasonNumberFor, uniqueMainSeasonCount } from '../utils/anime-season-label.util';

const UNKNOWN_EPISODE_LIMIT = 9999;
const CONTINUOUS_ANIME_IDS = new Set([21]);

@Component({
  selector: 'app-anime-detail',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatFormFieldModule, MatSelectModule, MenuBarComponent, TranslatePipe],
  templateUrl: './anime-detail.component.html',
  styleUrl: './anime-detail.component.scss',
})
export class AnimeDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly animeCatalogService = inject(AnimeCatalogService);
  private readonly animethequeService = inject(AnimethequeService);
  private readonly authService = inject(AuthService);
  private readonly achievementNotificationService = inject(AchievementNotificationService);
  private readonly characterCatalogService = inject(CharacterCatalogService);
  private readonly languageService = inject(LanguageService);
  private readonly analytics = inject(MarketingAnalyticsService);
  private readonly seoService = inject(SeoService);
  private readonly sanitizer = inject(DomSanitizer);
  private episodeTitleTranslationRequestId = 0;
  private activePoster: HTMLElement | null = null;

  readonly account = toSignal(this.authService.account$, {
    initialValue: this.authService.currentAccount(),
  });

  readonly anime = signal<PopularAnime | null>(null);
  readonly selectedSeasonSlug = signal<string | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly feedback = signal('');
  readonly errorMessage = signal('');
  readonly translatedSynopsis = signal('');
  readonly translatingSynopsis = signal(false);
  readonly watchStatus = signal<WatchStatus>('PLANNED');
  readonly watchedEpisodes = signal(0);
  readonly heroTrackingEditorOpen = signal(false);
  readonly episodeOptions = signal<AnimeEpisodeOption[]>([]);
  readonly translatedEpisodeTitles = signal<Record<number, string>>({});
  readonly relatedCharacters = signal<CharacterCatalogEntry[]>([]);
  readonly libraryEntries = signal<AnimethequeEntry[]>([]);
  readonly episodesLoading = signal(false);

  readonly statusOptions: { value: WatchStatus; labelKey: string }[] = [
    { value: 'WATCHING', labelKey: 'status.WATCHING' },
    { value: 'PLANNED', labelKey: 'status.PLANNED' },
    { value: 'COMPLETED', labelKey: 'status.COMPLETED' },
    { value: 'PAUSED', labelKey: 'status.PAUSED' },
    { value: 'DROPPED', labelKey: 'status.DROPPED' },
  ];
  readonly primaryStatusOptions: { value: WatchStatus; labelKey: string }[] = [
    { value: 'WATCHING', labelKey: 'status.WATCHING' },
    { value: 'COMPLETED', labelKey: 'status.COMPLETED' },
    { value: 'PLANNED', labelKey: 'status.PLANNED' },
  ];

  readonly selectedLibraryEntry = computed(() => {
    const anime = this.anime();
    return anime ? this.findLibraryEntryForCurrentTarget(anime) : undefined;
  });

  readonly selectedSeason = computed(() => {
    const anime = this.anime();
    const selectedSlug = this.selectedSeasonSlug();
    if (!anime || !selectedSlug) {
      return null;
    }

    return anime.seasons.find((season) => season.slug === selectedSlug) ?? null;
  });

  readonly selectedSeasonNumber = computed(() => {
    const anime = this.anime();
    const season = this.selectedSeason();
    if (!anime || !season) {
      return null;
    }

    return this.mainSeasonNumber(anime, season);
  });

  readonly visibleEpisodeOptions = computed(() =>
    this.episodeOptions()
      .filter((episode) => episode.value > 0)
      .sort((left, right) => {
        const seasonDiff = (left.seasonNumber || 0) - (right.seasonNumber || 0);
        return seasonDiff !== 0 ? seasonDiff : (left.seasonEpisode || left.value) - (right.seasonEpisode || right.value);
      }),
  );

  readonly canTrackCurrentView = computed(() => {
    const anime = this.anime();
    if (!anime) {
      return false;
    }

    return !this.shouldTrackSeasonsSeparately(anime) || Boolean(this.selectedSeason());
  });

  readonly isCurrentMovie = computed(() => {
    const anime = this.anime();
    if (!anime) {
      return false;
    }

    return this.isMovieCurrentTarget(anime);
  });

  readonly backgroundStyle = computed(() => {
    const anime = this.anime();
    const season = this.selectedSeason();
    const url = season?.imageUrl || anime?.backgroundUrl || anime?.imageUrl;
    return url
      ? `linear-gradient(90deg, rgba(12, 12, 12, 0.97), rgba(12, 12, 12, 0.62), rgba(12, 12, 12, 0.9)), url("${url}")`
      : 'linear-gradient(135deg, #171717, #2a1d1d)';
  });

  readonly trailerSafeUrl = computed<SafeResourceUrl | null>(() => {
    const anime = this.anime();
    if (!anime) {
      return null;
    }

    const videoId = this.extractYouTubeVideoId(this.trailerUrlForCurrentView(anime));
    if (!videoId) {
      return null;
    }

    const origin = encodeURIComponent(window.location.origin);
    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&controls=1&modestbranding=1&rel=0&playsinline=1&origin=${origin}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
  });

  constructor() {
    effect(() => {
      const anime = this.anime();
      const language = this.languageService.language();
      if (!anime) {
        this.translatedSynopsis.set('');
        return;
      }

      this.translateSynopsis(this.synopsisForCurrentView(anime), language);
    });

    effect(() => {
      const language = this.languageService.language();
      this.translateEpisodeTitles(this.episodeOptions(), language);
    });

    effect(() => {
      const account = this.account();
      if (!account) {
        this.libraryEntries.set([]);
        return;
      }

      this.loadLibraryEntries(account.id);
    });

  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) =>
      this.loadAnime(params.get('slug') ?? '', params.get('seasonSlug') ?? null),
    );
  }

  private loadAnime(slug: string, seasonSlug: string | null): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.animeCatalogService.getPopularAnimeBySelection(slug).subscribe({
      next: (anime) => {
        this.loading.set(false);
        if (!anime) {
          this.errorMessage.set('Anime introuvable.');
          return;
        }

        this.setAnime(anime, slug, seasonSlug);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger cet anime.');
      },
    });
  }

  setWatchStatus(status: WatchStatus): void {
    if (!this.canModifyTracking()) {
      return;
    }

    const anime = this.anime();
    if (anime && this.isMovieCurrentTarget(anime)) {
      this.watchStatus.set(status);
      this.watchedEpisodes.set(status === 'COMPLETED' ? 1 : 0);
      return;
    }

    if (anime && status === 'WATCHING' && this.watchedEpisodes() <= 0) {
      this.errorMessage.set(this.languageService.t('anime.watchingNeedsEpisode'));
      return;
    }

    this.watchStatus.set(status);

    if (status === 'COMPLETED') {
      this.completeCurrentTarget();
      return;
    }

    if (status === 'PLANNED') {
      this.watchedEpisodes.set(0);
      return;
    }

    if (anime && status === 'WATCHING' && this.hasWatchedAllCurrentTarget(anime)) {
      const completedValue = this.completedEpisodeValue(anime);
      const inProgressEpisode = completedValue - 1;
      if (inProgressEpisode <= 0) {
        this.watchStatus.set('PLANNED');
        this.errorMessage.set(this.languageService.t('anime.watchingNeedsEpisode'));
        return;
      }

      this.watchedEpisodes.set(inProgressEpisode);
    }
  }

  setWatchedEpisode(value: number): void {
    if (!this.canModifyTracking()) {
      return;
    }

    const anime = this.anime();
    if (anime && this.isMovieCurrentTarget(anime)) {
      return;
    }

    if (this.watchStatus() === 'COMPLETED') {
      return;
    }

    const maxEpisodes = anime ? this.maxEpisodesForCurrentTarget(anime) : UNKNOWN_EPISODE_LIMIT;
    const nextValue = Math.max(0, Math.min(Number(value), maxEpisodes));
    if (anime && nextValue > 0 && this.hasWatchedAllCurrentTarget(anime, nextValue)) {
      this.watchStatus.set('COMPLETED');
    } else if (nextValue > 0 && this.watchStatus() === 'PLANNED') {
      this.watchStatus.set('WATCHING');
    } else if (nextValue <= 0 && this.watchStatus() === 'WATCHING') {
      this.watchStatus.set('PLANNED');
    }

    this.watchedEpisodes.set(nextValue);
  }

  setWatchedEpisodeFromEvent(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.setWatchedEpisode(Number.isFinite(value) ? value : 0);
  }

  changeSeasonFromEvent(anime: PopularAnime, event: Event): void {
    const seasonSlug = (event.target as HTMLSelectElement).value;
    if (!seasonSlug) {
      void this.router.navigate(['/animes', anime.slug]);
      return;
    }

    const season = anime.seasons.find((currentSeason) => currentSeason.slug === seasonSlug);
    if (!season) {
      void this.router.navigate(['/animes', anime.slug]);
      return;
    }

    void this.router.navigate(this.seasonRoute(anime, season));
  }

  openSeason(anime: PopularAnime, season: PopularAnimeSeason): void {
    void this.router.navigate(this.seasonRoute(anime, season));
  }

  markEpisodeWatched(episode: AnimeEpisodeOption): void {
    if (episode.value <= 0 || this.watchStatus() === 'COMPLETED') {
      return;
    }

    if (this.watchStatus() === 'PLANNED') {
      this.watchStatus.set('WATCHING');
    }

    this.setWatchedEpisode(episode.value);
  }

  trackingControlsDisabled(anime: PopularAnime): boolean {
    return !this.account() || !this.canTrackCurrentView();
  }

  addSelected(openHeroTrackingEditor = false): void {
    const account = this.account();
    const anime = this.anime();
    if (!account || !anime || this.saving()) {
      return;
    }

    if (!this.canTrackCurrentView()) {
      this.errorMessage.set('Choisis une saison avant d’ajouter cet anime à ton Animetheque.');
      return;
    }

    this.saving.set(true);
    this.feedback.set('');
    this.errorMessage.set('');
    this.normalizeTrackingBeforeSave(anime);

    const previousEntries = this.libraryEntries();
    this.animethequeService.save(account.id, this.toAnimethequeRequest(anime)).subscribe({
      next: (entry) => {
        this.upsertLibraryEntry(entry);
        this.achievementNotificationService.notifyUnlockedFromEntries(previousEntries, this.libraryEntries());
        this.trackAnimeLibrarySave(anime, entry);
        this.feedback.set(this.languageService.t('anime.added', { title: anime.title }));
        this.saving.set(false);
        if (openHeroTrackingEditor) {
          this.heroTrackingEditorOpen.set(true);
        }
      },
      error: () => {
        this.errorMessage.set(this.languageService.t('anime.addError'));
        this.saving.set(false);
      },
    });
  }

  private canModifyTracking(): boolean {
    const anime = this.anime();
    if (!this.account()) {
      this.errorMessage.set('Connecte-toi pour modifier ton suivi.');
      return false;
    }

    if (anime && !this.canTrackCurrentView()) {
      this.errorMessage.set('Choisis une saison avant de modifier ton suivi.');
      return false;
    }

    return true;
  }

  formatEpisodes(anime: PopularAnime): string {
    if (this.isMovieCurrentTarget(anime)) {
      return 'Film';
    }

    const season = this.selectedSeason();
    if (season) {
      return season.episodes > 0
        ? this.languageService.t('anime.episodeCount', { count: season.episodes })
        : this.languageService.t('anime.episodesUnknown');
    }

    if (anime.seasons.length > 1) {
      const seasonCount = this.seasonCollectionLabel(anime);
      const episodeCount =
        anime.episodes > 0
          ? this.languageService.t('anime.episodeTotal', { count: anime.episodes })
          : this.languageService.t('anime.episodesUnknown');
      return `${seasonCount} • ${episodeCount}`;
    }

    return anime.episodes > 0
      ? this.languageService.t('anime.episodeCount', { count: anime.episodes })
      : this.languageService.t('anime.episodesUnknown');
  }

  formatEpisodeLimit(anime: PopularAnime): string {
    if (this.isMovieCurrentTarget(anime)) {
      return this.movieProgressHint();
    }

    if (this.episodesLoading()) {
      return this.languageService.t('anime.loadingEpisodes');
    }

    const totalEpisodes = this.totalEpisodesForCurrentTarget(anime);
    return totalEpisodes > 0
      ? this.languageService.t('anime.lastCompletedEpisodeHint', { count: totalEpisodes })
      : this.languageService.t('anime.lastCompletedEpisodeHintUnknown');
  }

  seasonCollectionLabel(anime: PopularAnime): string {
    const mainCount = uniqueMainSeasonCount(anime, { isMainSeason: (currentAnime, season) => this.isMainSeason(currentAnime, season) });
    const movieCount = anime.seasons.filter((season) => isMovieSeason(season)).length;
    const extraCount = anime.seasons.filter((season) => !isMovieSeason(season) && this.isExtraSeason(season, anime)).length;
    const spinOffCount = anime.seasons.filter((season) => this.isSpinOffSeason(anime, season)).length;
    const parts: string[] = [];

    if (mainCount > 0) {
      parts.push(this.languageService.t('anime.seasonCount', { count: mainCount }));
    }

    if (movieCount > 0) {
      parts.push(`${movieCount} film${movieCount > 1 ? 's' : ''}`);
    }

    if (extraCount > 0) {
      parts.push(`${extraCount} OVA / ${extraCount > 1 ? 'spéciaux' : 'spécial'}`);
    }

    if (spinOffCount > 0) {
      parts.push(`${spinOffCount} spin-off${spinOffCount > 1 ? 's' : ''}`);
    }

    return parts.length > 0 ? parts.join(' + ') : this.languageService.t('anime.seasonCount', { count: anime.seasons.length });
  }

  formatSeasonLine(season: PopularAnimeSeason, index: number): string {
    if (isMovieSeason(season)) {
      return `${animeTypeLabel(season.type)} · ${season.title}`;
    }

    const episodes =
      season.episodes > 0
        ? this.languageService.t('anime.episodeCount', { count: season.episodes })
        : this.languageService.t('anime.episodesUnknown');
    return this.languageService.t('anime.seasonLine', {
      index: index + 1,
      title: season.title,
      episodes,
      seasonDate: '',
    });
  }

  detailEyebrow(anime: PopularAnime): string {
    if (this.isMovieCurrentTarget(anime)) {
      return 'Film anime';
    }

    const selectedSeason = this.selectedSeason();
    if (selectedSeason) {
      return this.seasonEyebrowLabel(anime, selectedSeason);
    }

    return this.shouldTrackSeasonsSeparately(anime) ? 'Série anime' : 'Anime';
  }

  detailTitle(anime: PopularAnime): string {
    return anime.title;
  }

  detailImageUrl(anime: PopularAnime): string {
    return this.selectedSeason()?.imageUrl || anime.imageUrl;
  }

  heroBackgroundImageUrl(anime: PopularAnime): string {
    return this.selectedSeason()?.imageUrl || anime.backgroundUrl || anime.imageUrl;
  }

  synopsisForCurrentView(anime: PopularAnime): string {
    return this.selectedSeason()?.synopsis || anime.synopsis;
  }

  globalPosterStackSeasons(anime: PopularAnime): PopularAnimeSeason[] {
    if (this.selectedSeason() || this.isMovieCurrentTarget(anime) || anime.seasons.length <= 1) {
      return [];
    }

    const mainSeasons = anime.seasons.filter((season) => this.isMainSeason(anime, season));
    const stackSeasons = mainSeasons.length > 1 ? mainSeasons : anime.seasons;
    return stackSeasons.slice(0, 8);
  }

  posterStackX(index: number, total: number): string {
    return `${index * this.posterStackGapSize(total)}px`;
  }

  posterStackHoverX(index: number, total: number): string {
    if (total >= 8) {
      return `${index * 25}px`;
    }

    if (total >= 6) {
      return `${index * 28}px`;
    }

    return `${index * 34}px`;
  }

  posterStackY(index: number): string {
    return `${index * 6}px`;
  }

  posterStackRotation(index: number): string {
    return `${-4 + index * 1.25}deg`;
  }

  posterStackTrail(total: number): string {
    const gap = this.posterStackGapSize(total);
    return `${Math.max(46, (Math.min(total, 8) - 1) * gap + 10)}px`;
  }

  posterStackZIndex(index: number): number {
    return 40 - index;
  }

  onPosterPointerMove(event: PointerEvent): void {
    const poster = event.currentTarget as HTMLElement | null;
    if (!poster || this.shouldDisablePosterParallax(event)) {
      return;
    }

    const rect = poster.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const tiltX = (0.5 - y) * 10;
    const tiltY = (x - 0.5) * 12;
    const imageX = (0.5 - x) * 22;
    const imageY = (0.5 - y) * 22;

    poster.classList.add('is-parallax-active');
    this.activePoster = poster;
    poster.style.setProperty('--poster-tilt-x', `${tiltX.toFixed(2)}deg`);
    poster.style.setProperty('--poster-tilt-y', `${tiltY.toFixed(2)}deg`);
    poster.style.setProperty('--poster-offset-x', `${imageX.toFixed(2)}px`);
    poster.style.setProperty('--poster-offset-y', `${imageY.toFixed(2)}px`);
    poster.style.setProperty('--poster-glare-x', `${(x * 100).toFixed(1)}%`);
    poster.style.setProperty('--poster-glare-y', `${(y * 100).toFixed(1)}%`);
  }

  onPosterPointerLeave(event: Event): void {
    const poster = event.currentTarget as HTMLElement | null;
    if (!poster) {
      return;
    }

    this.resetPosterParallax(poster);
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentPointerMove(event: PointerEvent): void {
    if (!this.activePoster) {
      return;
    }

    const target = event.target;
    if (target instanceof Node && this.activePoster.contains(target)) {
      return;
    }

    const rect = this.activePoster.getBoundingClientRect();
    const isInside =
      event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;

    if (!isInside) {
      this.resetPosterParallax(this.activePoster);
    }
  }

  private resetPosterParallax(poster: HTMLElement): void {
    poster.classList.remove('is-parallax-active');
    poster.style.setProperty('--poster-tilt-x', '0deg');
    poster.style.setProperty('--poster-tilt-y', '0deg');
    poster.style.setProperty('--poster-offset-x', '0px');
    poster.style.setProperty('--poster-offset-y', '0px');
    poster.style.setProperty('--poster-glare-x', '50%');
    poster.style.setProperty('--poster-glare-y', '50%');
    this.activePoster = null;
  }

  private shouldDisablePosterParallax(event: PointerEvent): boolean {
    if (event.pointerType === 'touch') {
      return true;
    }

    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private posterStackGapSize(total: number): number {
    if (total >= 8) {
      return 10;
    }

    if (total >= 6) {
      return 12;
    }

    return 16;
  }

  releaseLabel(anime: PopularAnime): string {
    const year = this.selectedSeason()?.year ?? anime.year;
    return year ? String(year) : 'Date inconnue';
  }

  targetScore(anime: PopularAnime): number | null {
    return this.selectedSeason()?.score ?? anime.score;
  }

  targetRank(anime: PopularAnime): number | null {
    return this.selectedSeason()?.rank ?? anime.rank;
  }

  targetPopularity(anime: PopularAnime): number | null {
    return this.selectedSeason()?.popularity ?? anime.popularity;
  }

  targetStatus(anime: PopularAnime): string {
    return this.selectedSeason()?.status || anime.status;
  }

  targetJapaneseTitle(anime: PopularAnime): string | null {
    return this.selectedSeason()?.titleJapanese ?? anime.titleJapanese;
  }

  targetGenres(anime: PopularAnime): string[] {
    const genres = this.selectedSeason()?.genres;
    return genres && genres.length > 0 ? genres : anime.genres;
  }

  statusDisplay(status: string): string {
    switch (status) {
      case 'Finished Airing':
        return 'Terminé';
      case 'Currently Airing':
        return 'En diffusion';
      case 'Not yet aired':
        return 'À venir';
      default:
        return status || 'Statut inconnu';
    }
  }

  seasonDisplay(season: string | null): string {
    switch (season) {
      case 'winter':
        return 'Hiver';
      case 'spring':
        return 'Printemps';
      case 'summer':
        return 'Été';
      case 'fall':
        return 'Automne';
      default:
        return 'Saison inconnue';
    }
  }

  broadcastSeasonLabel(anime: PopularAnime): string {
    const selectedSeason = this.selectedSeason();
    if (selectedSeason) {
      return this.seasonDisplay(selectedSeason.season);
    }

    if (anime.seasons.length > 1) {
      return 'Multi-saisons';
    }

    return this.seasonDisplay(anime.season);
  }

  studioLine(anime: PopularAnime): string {
    const studios = this.selectedSeason()?.studios?.length ? this.selectedSeason()?.studios ?? [] : anime.studios;
    return studios.length > 0 ? studios.slice(0, 3).join(', ') : 'Studio inconnu';
  }

  rankLabel(value: number | null): string {
    return value === null ? 'Non classé' : `#${value.toLocaleString('fr-FR')}`;
  }

  favoritesLabel(value: number | null): string {
    return value && value > 0 ? `${value.toLocaleString('fr-FR')} favoris` : 'Favoris inconnus';
  }

  popularityLabel(value: number | null): string {
    return value === null ? 'Popularité inconnue' : `#${value.toLocaleString('fr-FR')}`;
  }

  episodeListTitle(episode: AnimeEpisodeOption): string {
    const translatedTitle = this.translatedEpisodeTitles()[episode.value];
    const title = translatedTitle || episode.title;
    return title || `Episode ${episode.seasonEpisode || episode.value}`;
  }

  scorePercent(score: number | null): number {
    return score === null ? 0 : Math.max(0, Math.min(100, score * 10));
  }

  malUrl(anime: PopularAnime): string {
    return `https://myanimelist.net/anime/${this.selectedSeason()?.malId ?? anime.id}`;
  }

  watchSearchUrl(anime: PopularAnime, provider: 'crunchyroll' | 'adn' | 'netflix' | 'prime' | 'wakanim'): string {
    const query = encodeURIComponent(this.externalSearchTitle(anime));
    switch (provider) {
      case 'crunchyroll':
        return `https://www.crunchyroll.com/search?q=${query}`;
      case 'adn':
        return `https://animationdigitalnetwork.fr/recherche?search=${query}`;
      case 'netflix':
        return `https://www.netflix.com/search?q=${query}`;
      case 'prime':
        return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${query}`;
      case 'wakanim':
      default:
        return `https://www.wakanim.tv/fr/v2/catalogue/search?search=${query}`;
    }
  }

  wikipediaSearchUrl(anime: PopularAnime): string {
    return `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(this.externalSearchTitle(anime))}`;
  }

  youtubeSearchUrl(anime: PopularAnime): string {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${this.externalSearchTitle(anime)} trailer anime`)}`;
  }

  private externalSearchTitle(anime: PopularAnime): string {
    return this.selectedSeason()?.title || anime.title;
  }

  seasonDisplayTitle(anime: PopularAnime, season: PopularAnimeSeason, seasonNumber?: number): string {
    if (this.isExtraSeason(season, anime)) {
      return this.extraSeasonLabel(anime, season);
    }

    if (this.isSpinOffSeason(anime, season)) {
      return this.spinOffSeasonLabel(anime, season);
    }

    const titleFromSeason = this.localizedSeasonTitle(anime, season);
    if (titleFromSeason) {
      return titleFromSeason;
    }

    return `Saison ${seasonNumber ?? this.mainSeasonNumber(anime, season)}`;
  }

  seasonRoute(anime: PopularAnime, season: PopularAnimeSeason): string[] {
    return ['/animes', anime.slug, 'seasons', season.slug];
  }

  seasonCardTitle(anime: PopularAnime, season: PopularAnimeSeason, index: number): string {
    return this.seasonDisplayTitle(anime, season);
  }

  seasonCode(anime: PopularAnime, season: PopularAnimeSeason): string {
    if (this.isExtraSeason(season, anime)) {
      return this.extraSeasonCode(season, anime);
    }

    if (this.isSpinOffSeason(anime, season)) {
      return 'SO';
    }

    return labelMainSeason(anime, season, {
      isMainSeason: (currentAnime, currentSeason) => this.isMainSeason(currentAnime, currentSeason),
    }).code;
  }

  seasonTabLabel(anime: PopularAnime, season: PopularAnimeSeason, index: number): string {
    if (this.isExtraSeason(season, anime)) {
      return this.extraSeasonTabLabel(anime, season);
    }

    if (this.isSpinOffSeason(anime, season)) {
      return 'Spin-off';
    }

    const title = this.seasonDisplayTitle(anime, season);
    return title.length > 24 ? this.seasonCode(anime, season) : title;
  }

  seasonCardMeta(anime: PopularAnime, season: PopularAnimeSeason): string {
    const type = this.isSpinOffSeason(anime, season) ? 'Spin-off' : animeTypeLabel(season.type);
    const episodes =
      season.episodes > 0
        ? this.languageService.t('anime.episodeCount', { count: season.episodes })
        : this.languageService.t('anime.episodesUnknown');
    const year = season.year ? String(season.year) : 'Date inconnue';
    return `${type} · ${episodes} · ${year}`;
  }

  hasSeparateSeasonTracking(anime: PopularAnime): boolean {
    return this.shouldTrackSeasonsSeparately(anime);
  }

  showHeroTrackingPanel(anime: PopularAnime): boolean {
    return Boolean(anime);
  }

  showSeasonHub(anime: PopularAnime): boolean {
    return anime.seasons.length > 0 && (!this.isMovieCurrentTarget(anime) || anime.seasons.length > 1);
  }

  overallWatchedEpisodes(anime: PopularAnime): number {
    if (this.shouldTrackSeasonsSeparately(anime)) {
      return anime.seasons.reduce((total, season) => total + this.seasonWatchedEpisodes(anime, season), 0);
    }

    const entry = this.findSeriesLibraryEntry(anime);
    if (entry) {
      return entry.status === 'COMPLETED'
        ? this.overallTotalEpisodes(anime)
        : Math.max(0, Number(entry.watchedEpisodes || 0));
    }

    return Math.max(0, this.watchedEpisodes());
  }

  overallTotalEpisodes(anime: PopularAnime): number {
    const seasonTotal = anime.seasons.reduce((total, season) => total + this.seasonTotalEpisodes(season), 0);
    return seasonTotal > 0 ? seasonTotal : Math.max(0, anime.episodes);
  }

  overallProgressPercent(anime: PopularAnime): number {
    return this.progressPercent(this.overallWatchedEpisodes(anime), this.overallTotalEpisodes(anime));
  }

  percentLabel(value: number): string {
    return `${Math.round(value)}%`;
  }

  overallProgressLabel(anime: PopularAnime): string {
    const total = this.overallTotalEpisodes(anime);
    return `${this.overallWatchedEpisodes(anime)} / ${total > 0 ? total : '?'} épisodes vus`;
  }

  currentTargetProgressLabel(anime: PopularAnime): string {
    const total = this.totalEpisodesForCurrentTarget(anime);
    return `${this.watchedEpisodes()} / ${total > 0 ? total : '?'} épisodes`;
  }

  currentTargetProgressPercent(anime: PopularAnime): number {
    return this.progressPercent(this.watchedEpisodes(), this.totalEpisodesForCurrentTarget(anime));
  }

  currentTrackingStateLabel(anime: PopularAnime): string {
    if (this.watchStatus() === 'COMPLETED') {
      if (this.isMovieCurrentTarget(anime)) {
        return 'Film terminé';
      }

      return this.selectedSeason() ? 'Saison terminée' : 'Anime terminé';
    }

    if (this.hasTrackingChanges(anime)) {
      return 'Modifications non enregistrées';
    }

    return 'À jour';
  }

  trackingSaveButtonLabel(anime: PopularAnime): string {
    if (this.saving()) {
      return this.languageService.t('anime.adding');
    }

    if (!this.hasTrackingChanges(anime)) {
      return this.watchStatus() === 'COMPLETED' ? this.currentTrackingStateLabel(anime) : 'À jour';
    }

    if (this.hasWatchedAllCurrentTarget(anime)) {
      return this.statusShortLabel('COMPLETED');
    }

    return 'Mettre à jour';
  }

  hasTrackingChanges(anime: PopularAnime): boolean {
    const entry = this.findLibraryEntryForCurrentTarget(anime);
    if (!entry) {
      return true;
    }

    const status = this.normalizedWatchStatusForCurrentTarget(anime);
    const watchedEpisodes =
      status === 'COMPLETED'
        ? this.completedEpisodeValue(anime)
        : Math.min(this.watchedEpisodes(), this.maxEpisodesForCurrentTarget(anime));

    return entry.status !== status || entry.watchedEpisodes !== watchedEpisodes;
  }

  private normalizeTrackingBeforeSave(anime: PopularAnime): void {
    const status = this.normalizedWatchStatusForCurrentTarget(anime);
    if (status !== this.watchStatus()) {
      this.watchStatus.set(status);
    }

    if (status === 'COMPLETED') {
      this.completeCurrentTarget(anime);
    }
  }

  private normalizedWatchStatusForCurrentTarget(anime: PopularAnime): WatchStatus {
    if (this.hasWatchedAllCurrentTarget(anime)) {
      return 'COMPLETED';
    }

    if (this.watchStatus() === 'WATCHING' && this.watchedEpisodes() <= 0) {
      return 'PLANNED';
    }

    if (this.watchStatus() === 'PLANNED' && this.watchedEpisodes() > 0) {
      return 'WATCHING';
    }

    return this.watchStatus();
  }

  private normalizedEntryStatusForCurrentTarget(anime: PopularAnime, entry: AnimethequeEntry): WatchStatus {
    if (entry.status !== 'WATCHING') {
      return entry.status;
    }

    const watchedEpisodes = Math.max(0, Number(entry.watchedEpisodes || 0));
    const totalEpisodes = Math.max(0, Number(entry.totalEpisodes || 0), Number(this.totalEpisodesForCurrentTarget(anime) || 0));
    if (watchedEpisodes <= 0) {
      return 'PLANNED';
    }

    return totalEpisodes > 0 && watchedEpisodes >= totalEpisodes ? 'COMPLETED' : 'WATCHING';
  }

  private hasWatchedAllCurrentTarget(anime: PopularAnime, watchedEpisodes = this.watchedEpisodes()): boolean {
    const totalEpisodes = this.totalEpisodesForCurrentTarget(anime);
    return totalEpisodes > 0 && watchedEpisodes >= totalEpisodes;
  }

  currentTargetEpisodeLimit(anime: PopularAnime): number {
    return this.totalEpisodesForCurrentTarget(anime);
  }

  currentTargetEpisodeLimitLabel(anime: PopularAnime): string {
    const total = this.currentTargetEpisodeLimit(anime);
    return total > 0 ? String(total) : '?';
  }

  currentTargetEpisodeMax(anime: PopularAnime): number {
    const total = this.currentTargetEpisodeLimit(anime);
    return total > 0 ? total : UNKNOWN_EPISODE_LIMIT;
  }

  selectedSeasonLabel(anime: PopularAnime): string {
    const selectedSeason = this.selectedSeason();
    const selectedSeasonNumber = this.selectedSeasonNumber();
    if (selectedSeason && selectedSeasonNumber) {
      return this.seasonDisplayTitle(anime, selectedSeason, selectedSeasonNumber);
    }

    return anime.seasons.length === 1 ? this.seasonDisplayTitle(anime, anime.seasons[0], 1) : 'Vue globale';
  }

  trackingStatusLabel(anime: PopularAnime): string {
    if (this.isMovieCurrentTarget(anime)) {
      return 'Statut du film';
    }

    return this.selectedSeason() ? 'Statut de cette saison' : 'Statut global';
  }

  episodeSectionTitle(anime: PopularAnime): string {
    return `Épisodes - ${this.selectedSeasonLabel(anime)}`;
  }

  nextSeasonRoute(anime: PopularAnime): string[] {
    if (anime.seasons.length === 0) {
      return ['/animes', anime.slug];
    }

    const selectedSlug = this.selectedSeasonSlug();
    const index = Math.max(0, anime.seasons.findIndex((season) => season.slug === selectedSlug));
    const nextSeason = anime.seasons[(index + 1) % anime.seasons.length];
    return this.seasonRoute(anime, nextSeason);
  }

  seasonProgressPercent(anime: PopularAnime, season: PopularAnimeSeason): number {
    return this.progressPercent(this.seasonWatchedEpisodes(anime, season), this.seasonTotalEpisodes(season));
  }

  seasonStatusLabel(anime: PopularAnime, season: PopularAnimeSeason): string {
    const entry = this.findLibraryEntryForSeason(anime, season);
    const progress = this.seasonProgressLabel(anime, season);

    if (!entry) {
      return this.shouldTrackSeasonsSeparately(anime)
        ? `${this.statusShortLabel('PLANNED')} - ${progress}`
        : `Suivi global - ${progress}`;
    }

    const selectedSeason = this.selectedSeason();
    const status = selectedSeason?.slug === season.slug ? this.watchStatus() : entry.status;
    return `${this.languageService.t(this.statusLabelKey(status))} - ${progress}`;
  }

  seasonProgressLabel(anime: PopularAnime, season: PopularAnimeSeason): string {
    const watched = this.seasonWatchedEpisodes(anime, season);
    const total = this.seasonTotalEpisodes(season);
    return `${watched} / ${total > 0 ? total : '?'} \u00c9pisodes vus`;
  }

  seasonStatusBadgeLabel(anime: PopularAnime, season: PopularAnimeSeason): string {
    const entry = this.findLibraryEntryForSeason(anime, season);
    if (!entry) {
      return this.statusShortLabel('PLANNED');
    }

    const selectedSeason = this.selectedSeason();
    const status = selectedSeason?.slug === season.slug ? this.watchStatus() : entry.status;
    return this.statusShortLabel(status);
  }

  seasonStatusBadgeClass(anime: PopularAnime, season: PopularAnimeSeason): string {
    const entry = this.findLibraryEntryForSeason(anime, season);
    if (!entry) {
      return 'status-planned';
    }

    const selectedSeason = this.selectedSeason();
    const status = selectedSeason?.slug === season.slug ? this.watchStatus() : entry.status;
    return `status-${status.toLowerCase()}`;
  }

  isEpisodeWatched(episode: AnimeEpisodeOption): boolean {
    return episode.value > 0 && this.watchedEpisodes() >= episode.value;
  }

  lastLibraryUpdateLabel(): string {
    const entry = this.selectedLibraryEntry();
    if (!entry?.updatedAt) {
      return 'Aucune sauvegarde';
    }

    const updatedAt = new Date(entry.updatedAt);
    const now = new Date();
    if (
      updatedAt.getFullYear() === now.getFullYear() &&
      updatedAt.getMonth() === now.getMonth() &&
      updatedAt.getDate() === now.getDate()
    ) {
      return "Aujourd'hui";
    }

    return new Intl.DateTimeFormat('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(updatedAt);
  }

  trackingHint(anime: PopularAnime): string {
    if (this.isMovieCurrentTarget(anime)) {
      return 'Film : pas de suivi par episode. Marque-le simplement en termine quand tu l as vu.';
    }

    if (!this.shouldTrackSeasonsSeparately(anime)) {
      return 'Suivi continu : la progression reste globale pour cet anime.';
    }

    return this.selectedSeason()
      ? 'Cette saison sera enregistrée comme une entrée séparée dans ton Animetheque.'
      : 'Choisis une saison pour enregistrer ta progression saison par saison.';
  }

  trailerTitle(anime: PopularAnime): string {
    const season = this.selectedSeason();
    const seasonNumber = this.selectedSeasonNumber();
    if (season && seasonNumber) {
      return `Trailer - ${this.seasonDisplayTitle(anime, season, seasonNumber)}`;
    }

    return `Trailer - ${anime.title}`;
  }

  formatScore(score: number | null): string {
    return score === null ? this.languageService.t('common.unrated') : `${score.toFixed(2)}/10`;
  }

  private removedScoreLabel(): string {
    return 'Non noté';
  }

  statusLabelKey(status: WatchStatus): string {
    return `status.${status}`;
  }

  statusShortLabel(status: WatchStatus): string {
    switch (status) {
      case 'WATCHING':
        return 'En cours';
      case 'COMPLETED':
        return 'Terminé';
      case 'PAUSED':
        return 'Pause';
      case 'DROPPED':
        return 'Abandonné';
      case 'PLANNED':
      default:
        return 'À voir';
    }
  }

  episodeProgressLabel(entry: AnimethequeEntry): string {
    if (isMovieType(entry.mediaType) || (!entry.mediaType && entry.trackingMode !== 'SEASON' && entry.totalEpisodes === 1)) {
      return entry.status === 'COMPLETED' || entry.watchedEpisodes > 0 ? 'Film termine' : 'Film non termine';
    }

    const total = entry.totalEpisodes > 0 ? entry.totalEpisodes : '?';
    return entry.watchedEpisodes <= 0
      ? this.languageService.t('library.progressNone', { total })
      : this.languageService.t('library.progressWatched', { watched: entry.watchedEpisodes, total });
  }

  watchedEpisodeSummary(value: number): string {
    const episode = this.episodeOptions().find((option) => option.value === value);
    if (episode) {
      return this.formatWatchedEpisodeOption(episode);
    }

    return value <= 0
      ? this.languageService.t('anime.noEpisodeWatched')
      : this.languageService.t('anime.watchedUntilEpisode', { count: value });
  }

  completedTargetLabel(): string {
    if (this.isCurrentMovie()) {
      return 'FILM TERMINE';
    }

    return this.selectedSeason() ? 'SAISON TERMINÉ' : 'ANIME TERMINÉ';
  }

  movieProgressSummary(): string {
    return this.watchStatus() === 'COMPLETED' ? 'FILM TERMINE' : 'FILM NON TERMINE';
  }

  movieProgressHint(): string {
    return 'Change le statut sur Termine quand le film est vu.';
  }

  mediaTypeLabel(anime: PopularAnime): string {
    return animeTypeLabel(this.selectedSeason()?.type ?? anime.type);
  }

  formatWatchedEpisodeOption(episode: AnimeEpisodeOption): string {
    return episode.value <= 0
      ? this.languageService.t('anime.noEpisodeWatched')
      : this.languageService.t('anime.watchedUntilEpisodeSeason', {
          episode: episode.seasonEpisode || episode.value,
          season: episode.seasonNumber || 1,
        });
  }

  formatWatchedEpisodeDetail(episode: AnimeEpisodeOption): string {
    if (episode.value <= 0) {
      return this.languageService.t('anime.noEpisodeWatchedHint');
    }

    return this.translatedEpisodeTitles()[episode.value] ?? episode.title;
  }

  private setAnime(anime: PopularAnime, sourceSlug: string, requestedSeasonSlug: string | null): void {
    this.anime.set(anime);
    this.selectedSeasonSlug.set(this.resolveSeasonSlug(anime, sourceSlug, requestedSeasonSlug));
    this.feedback.set('');
    this.errorMessage.set('');
    this.watchStatus.set('PLANNED');
    this.heroTrackingEditorOpen.set(false);
    this.watchedEpisodes.set(this.defaultWatchedEpisodes(anime));
    this.applyExistingEntry(anime);
    this.loadEpisodeOptions(anime);
    this.loadRelatedCharacters(anime);
    this.updateSeo(anime);
    this.trackAnimeView(anime);
    this.scrollToPageTop();
  }

  private trackAnimeView(anime: PopularAnime): void {
    this.analytics.trackEvent('anime_view', {
      route: this.router.url.split('?')[0],
      anime_id: anime.id,
      anime_title: this.detailTitle(anime),
    });
  }

  private trackAnimeLibrarySave(anime: PopularAnime, entry: AnimethequeEntry): void {
    const properties = {
      route: this.router.url.split('?')[0],
      anime_id: anime.id,
      anime_title: this.detailTitle(anime),
      status: entry.status,
      watched_episodes: entry.watchedEpisodes,
    };

    this.analytics.trackEvent('anime_add_to_library', properties);
    this.analytics.trackEvent('anime_progress_update', properties);
    if (entry.status === 'COMPLETED') {
      this.analytics.trackEvent('anime_mark_completed', properties);
    }
  }

  private updateSeo(anime: PopularAnime): void {
    const title = `${this.detailTitle(anime)} - AnimeClub`;
    const synopsis = this.synopsisForCurrentView(anime).replace(/\s+/g, ' ').trim();
    this.seoService.setPageMeta({
      title,
      description: synopsis
        ? `Fiche anime de ${this.detailTitle(anime)} : ${synopsis.slice(0, 145)}`
        : `Fiche anime de ${this.detailTitle(anime)} : synopsis, épisodes, personnages, note et suivi dans votre Animethèque.`,
      image: this.detailImageUrl(anime),
      type: 'article',
    });
  }

  private scrollToPageTop(): void {
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  }

  private loadRelatedCharacters(anime: PopularAnime): void {
    this.relatedCharacters.set([]);
    const targetAnimeMalId = this.selectedSeason()?.malId ?? anime.id;

    this.characterCatalogService.getCharactersByAnimeMalId(targetAnimeMalId, 12).subscribe({
      next: (characters) => {
        if (this.anime()?.slug !== anime.slug) {
          return;
        }

        if (characters.length > 0) {
          this.relatedCharacters.set(characters.slice(0, 10));
          return;
        }

        this.loadRelatedCharactersFallback(anime);
      },
      error: () => {
        if (this.anime()?.slug === anime.slug) {
          this.loadRelatedCharactersFallback(anime);
        }
      },
    });
  }

  private loadRelatedCharactersFallback(anime: PopularAnime): void {
    this.characterCatalogService.listCharacters(this.characterSearchQuery(anime.title), 1, 12).subscribe({
      next: (result) => {
        if (this.anime()?.slug !== anime.slug) {
          return;
        }

        const targetAnimeMalId = this.selectedSeason()?.malId ?? anime.id;
        const characters = [...result.items].sort((left, right) => {
          const leftExact = left.sourceAnimeMalId === targetAnimeMalId ? 0 : 1;
          const rightExact = right.sourceAnimeMalId === targetAnimeMalId ? 0 : 1;
          return leftExact - rightExact;
        });
        this.relatedCharacters.set(characters.slice(0, 10));
      },
      error: () => {
        if (this.anime()?.slug === anime.slug) {
          this.relatedCharacters.set([]);
        }
      },
    });
  }

  private characterSearchQuery(title: string): string {
    const dashIndex = title.indexOf(' -');
    if (dashIndex > 2) {
      return title.slice(0, dashIndex).trim();
    }

    return title;
  }

  private loadEpisodeOptions(anime: PopularAnime): void {
    if (this.isMovieCurrentTarget(anime)) {
      this.episodeOptions.set([]);
      this.translatedEpisodeTitles.set({});
      this.episodesLoading.set(false);
      this.watchedEpisodes.set(this.watchStatus() === 'COMPLETED' ? 1 : 0);
      return;
    }

    const fallbackOptions = this.createFallbackEpisodeOptions(anime);
    this.episodeOptions.set(fallbackOptions);

    if (!this.canTrackCurrentView()) {
      this.episodeOptions.set([]);
      this.episodesLoading.set(false);
      this.watchedEpisodes.set(0);
      return;
    }

    this.episodesLoading.set(true);

    const selectedSeason = this.selectedSeason();
    const selectedSeasonNumber = this.selectedSeasonNumber();
    const options$ =
      selectedSeason && selectedSeasonNumber && this.shouldTrackSeasonsSeparately(anime)
        ? this.animeCatalogService.getSeasonEpisodeOptions(selectedSeason, selectedSeasonNumber)
        : this.animeCatalogService.getEpisodeOptions(anime);

    options$.subscribe({
      next: (options) => {
        if (this.anime()?.slug !== anime.slug) {
          return;
        }

        const finalOptions = options.length > 0 ? [this.noEpisodeOption(), ...options] : fallbackOptions;
        this.episodeOptions.set(finalOptions);
        this.episodesLoading.set(false);
        if (this.watchStatus() === 'COMPLETED') {
          this.completeCurrentTarget(anime);
        } else {
          this.watchedEpisodes.set(Math.min(Math.max(0, this.watchedEpisodes()), this.maxEpisodesForCurrentTarget(anime)));
        }
      },
      error: () => {
        if (this.anime()?.slug === anime.slug) {
          this.episodeOptions.set(fallbackOptions);
          this.episodesLoading.set(false);
        }
      },
    });
  }

  private loadLibraryEntries(accountId: number): void {
    this.animethequeService.list(accountId).subscribe({
      next: (entries) => {
        this.libraryEntries.set(entries);
        const anime = this.anime();
        if (anime) {
          this.applyExistingEntry(anime);
        }
      },
      error: () => {
        this.libraryEntries.set([]);
      },
    });
  }

  private applyExistingEntry(anime: PopularAnime): void {
    const entry = this.findLibraryEntryForCurrentTarget(anime);
    if (!entry) {
      return;
    }

    const status = this.normalizedEntryStatusForCurrentTarget(anime, entry);
    this.watchStatus.set(status);
    if (this.isMovieCurrentTarget(anime)) {
      this.watchedEpisodes.set(status === 'COMPLETED' || entry.watchedEpisodes > 0 ? 1 : 0);
      return;
    }

    const targetEpisodes = this.totalEpisodesForCurrentTarget(anime);
    const maxEpisodes = targetEpisodes > 0 ? targetEpisodes : Math.max(entry.totalEpisodes, this.maxEpisodesForCurrentTarget(anime));
    this.watchedEpisodes.set(
      status === 'COMPLETED'
        ? this.completedEpisodeValue(anime)
        : Math.max(0, Math.min(entry.watchedEpisodes, maxEpisodes)),
    );
  }

  private upsertLibraryEntry(entry: AnimethequeEntry): void {
    this.libraryEntries.update((entries) => {
      const index = entries.findIndex(
        (currentEntry) => currentEntry.id === entry.id || currentEntry.animeSlug === entry.animeSlug,
      );

      if (index === -1) {
        return [entry, ...entries];
      }

      const updatedEntries = [...entries];
      updatedEntries[index] = entry;
      return updatedEntries;
    });
  }

  private toAnimethequeRequest(anime: PopularAnime): AnimethequeEntryRequest {
    const status = this.normalizedWatchStatusForCurrentTarget(anime);
    const watchedEpisodes =
      this.isMovieCurrentTarget(anime)
        ? status === 'COMPLETED'
          ? 1
          : 0
        : status === 'COMPLETED'
        ? this.completedEpisodeValue(anime)
        : Math.min(this.watchedEpisodes(), this.maxEpisodesForCurrentTarget(anime));
    const existingEntry = this.findLibraryEntryForCurrentTarget(anime);
    const selectedSeason = this.selectedSeason();
    const selectedSeasonNumber = this.selectedSeasonNumber();
    const trackSeason = Boolean(selectedSeason && selectedSeasonNumber && this.shouldTrackSeasonsSeparately(anime));
    const targetSlug = trackSeason && selectedSeason ? selectedSeason.slug : this.seriesLibrarySlug(anime);
    const targetTitle =
      trackSeason && selectedSeason && selectedSeasonNumber
        ? `${anime.title} - ${this.seasonDisplayTitle(anime, selectedSeason, selectedSeasonNumber)}`
        : anime.title;

    return {
      animeSlug: existingEntry?.animeSlug ?? targetSlug,
      parentAnimeSlug: trackSeason ? anime.slug : null,
      parentTitle: trackSeason ? anime.title : null,
      seasonSlug: trackSeason && selectedSeason ? selectedSeason.slug : null,
      seasonTitle: trackSeason && selectedSeason ? selectedSeason.title : null,
      seasonNumber: trackSeason ? selectedSeasonNumber : null,
      trackingMode: trackSeason ? 'SEASON' : 'SERIES',
      mediaType: this.selectedSeason()?.type ?? anime.type,
      title: targetTitle,
      coverUrl: (trackSeason && selectedSeason ? selectedSeason.imageUrl : anime.imageUrl) || anime.imageUrl,
      status,
      watchedEpisodes,
      totalEpisodes: this.totalEpisodesForCurrentTarget(anime),
      score: null,
      favorite: existingEntry?.favorite ?? false,
      notes: existingEntry?.notes ?? '',
    };
  }

  private findLibraryEntryForCurrentTarget(anime: PopularAnime): AnimethequeEntry | undefined {
    const selectedSeason = this.selectedSeason();
    if (selectedSeason && this.shouldTrackSeasonsSeparately(anime)) {
      return this.libraryEntries().find(
        (entry) => entry.animeSlug === selectedSeason.slug || entry.seasonSlug === selectedSeason.slug,
      );
    }

    return this.findSeriesLibraryEntry(anime);
  }

  private maxEpisodesForCurrentTarget(anime: PopularAnime): number {
    const loadedMax = this.episodeOptions()
      .map((option) => option.value)
      .reduce((max, value) => Math.max(max, value), 0);

    const totalEpisodes = this.totalEpisodesForCurrentTarget(anime);
    if (totalEpisodes > 0) {
      return totalEpisodes;
    }

    return loadedMax > 0 ? loadedMax : UNKNOWN_EPISODE_LIMIT;
  }

  private completedEpisodeValue(anime: PopularAnime): number {
    const totalEpisodes = this.totalEpisodesForCurrentTarget(anime);
    if (totalEpisodes > 0) {
      return totalEpisodes;
    }

    const loadedMax = this.episodeOptions()
      .map((option) => option.value)
      .reduce((max, value) => Math.max(max, value), 0);

    return loadedMax > 0 ? loadedMax : this.watchedEpisodes();
  }

  private completeCurrentTarget(anime: PopularAnime | null = this.anime()): void {
    if (!anime) {
      return;
    }

    this.watchedEpisodes.set(this.completedEpisodeValue(anime));
  }

  private createFallbackEpisodeOptions(anime: PopularAnime): AnimeEpisodeOption[] {
    const options: AnimeEpisodeOption[] = [this.noEpisodeOption()];
    const selectedSeason = this.selectedSeason();
    const selectedSeasonNumber = this.selectedSeasonNumber();

    if (selectedSeason && selectedSeasonNumber && this.shouldTrackSeasonsSeparately(anime)) {
      return [
        ...options,
        ...this.createFallbackSeasonEpisodeOptions(
          Math.max(0, selectedSeason.episodes),
          0,
          selectedSeasonNumber,
          selectedSeason.title,
        ),
      ];
    }

    const seasons = anime.seasons.length > 0 ? anime.seasons : [];
    let offset = 0;

    if (seasons.length > 0) {
      for (const [index, season] of seasons.entries()) {
        const totalEpisodes = Math.max(0, season.episodes);
        options.push(...this.createFallbackSeasonEpisodeOptions(totalEpisodes, offset, index + 1, season.title));
        offset += totalEpisodes;
      }

      return options;
    }

    return [...options, ...this.createFallbackSeasonEpisodeOptions(anime.episodes > 0 ? anime.episodes : 0, 0, 1)];
  }

  private noEpisodeOption(): AnimeEpisodeOption {
    return {
      value: 0,
      title: '',
      label: this.languageService.t('anime.noEpisodeWatched'),
      seasonTitle: '',
      seasonNumber: 0,
      seasonEpisode: 0,
    };
  }

  private createFallbackSeasonEpisodeOptions(
    totalEpisodes: number,
    offset: number,
    seasonNumber: number,
    seasonTitle = '',
  ): AnimeEpisodeOption[] {
    return Array.from({ length: totalEpisodes }, (_, index) => {
      const episode = index + 1;
      return {
        value: offset + episode,
        title: '',
        label: this.languageService.t('anime.episode', { count: episode }),
        seasonTitle,
        seasonNumber,
        seasonEpisode: episode,
      };
    });
  }

  private defaultWatchedEpisodes(anime: PopularAnime): number {
    return 0;
  }

  private resolveSeasonSlug(anime: PopularAnime, sourceSlug: string, requestedSeasonSlug: string | null): string | null {
    if (!this.shouldTrackSeasonsSeparately(anime)) {
      return null;
    }

    const explicitSeason = requestedSeasonSlug?.trim().toLowerCase();
    if (explicitSeason) {
      return anime.seasons.find((season) => season.slug.toLowerCase() === explicitSeason)?.slug ?? null;
    }

    const source = sourceSlug.trim().toLowerCase();
    return anime.seasons.find((season) => season.slug.toLowerCase() === source)?.slug ?? null;
  }

  private shouldTrackSeasonsSeparately(anime: PopularAnime): boolean {
    return this.mainSeasonCount(anime) > 1 && !this.isContinuousAnime(anime) && !isMovieAnime(anime);
  }

  private mainSeasonCount(anime: PopularAnime): number {
    return anime.seasons.filter((season) => this.isMainSeason(anime, season)).length;
  }

  private findSeriesLibraryEntry(anime: PopularAnime): AnimethequeEntry | undefined {
    const slugs = this.seriesLibrarySlugs(anime);
    const entries = this.libraryEntries().filter(
      (entry) =>
        slugs.has(entry.animeSlug) ||
        Boolean(entry.parentAnimeSlug && slugs.has(entry.parentAnimeSlug)) ||
        Boolean(entry.seasonSlug && slugs.has(entry.seasonSlug)),
    );

    return (
      entries.find((entry) => entry.trackingMode !== 'SEASON' && entry.animeSlug === this.seriesLibrarySlug(anime)) ??
      entries.find((entry) => entry.trackingMode !== 'SEASON' && entry.animeSlug === anime.slug) ??
      entries.find((entry) => entry.trackingMode !== 'SEASON') ??
      entries[0]
    );
  }

  private seriesLibrarySlugs(anime: PopularAnime): Set<string> {
    return new Set([this.seriesLibrarySlug(anime), anime.slug, ...anime.seasons.map((season) => season.slug)]);
  }

  private seriesLibrarySlug(anime: PopularAnime): string {
    return anime.slug.startsWith('series-') || isMovieAnime(anime) ? anime.slug : `series-${this.slugify(anime.title)}`;
  }

  private slugify(value: string): string {
    return this.normalizeTitle(value).replace(/\s+/g, '-');
  }

  private isContinuousAnime(anime: PopularAnime): boolean {
    return CONTINUOUS_ANIME_IDS.has(anime.id) || this.normalizeTitle(anime.title) === 'one piece';
  }

  private totalEpisodesForCurrentTarget(anime: PopularAnime): number {
    if (this.isMovieCurrentTarget(anime)) {
      return Math.max(1, this.selectedSeason()?.episodes ?? anime.episodes ?? 0);
    }

    const selectedSeason = this.selectedSeason();
    if (selectedSeason && this.shouldTrackSeasonsSeparately(anime)) {
      return Math.max(0, selectedSeason.episodes);
    }

    return Math.max(0, anime.episodes);
  }

  private isMovieCurrentTarget(anime: PopularAnime): boolean {
    const selectedSeason = this.selectedSeason();
    return selectedSeason ? isMovieSeason(selectedSeason) : isMovieAnime(anime);
  }

  private entryProgressPercent(entry: AnimethequeEntry): number {
    if (isMovieType(entry.mediaType) || (!entry.mediaType && entry.trackingMode !== 'SEASON' && entry.totalEpisodes === 1)) {
      return entry.status === 'COMPLETED' || entry.watchedEpisodes > 0 ? 100 : 0;
    }

    if (entry.totalEpisodes <= 0) {
      return 0;
    }

    return Math.min(100, Math.max(0, (entry.watchedEpisodes / entry.totalEpisodes) * 100));
  }

  private findLibraryEntryForSeason(anime: PopularAnime, season: PopularAnimeSeason): AnimethequeEntry | undefined {
    if (this.shouldTrackSeasonsSeparately(anime)) {
      return this.libraryEntries().find((entry) => entry.animeSlug === season.slug || entry.seasonSlug === season.slug);
    }

    return this.findSeriesLibraryEntry(anime);
  }

  private seasonWatchedEpisodes(anime: PopularAnime, season: PopularAnimeSeason): number {
    const selectedSeason = this.selectedSeason();
    if (
      selectedSeason?.slug === season.slug ||
      (!this.shouldTrackSeasonsSeparately(anime) && anime.seasons.length === 1)
    ) {
      return this.watchStatus() === 'COMPLETED'
        ? this.seasonTotalEpisodes(season)
        : Math.max(0, Math.min(this.watchedEpisodes(), this.seasonTotalEpisodes(season) || UNKNOWN_EPISODE_LIMIT));
    }

    const entry = this.findLibraryEntryForSeason(anime, season);
    if (!entry) {
      return 0;
    }

    return entry.status === 'COMPLETED'
      ? this.seasonTotalEpisodes(season)
      : Math.max(0, Math.min(entry.watchedEpisodes, this.seasonTotalEpisodes(season) || UNKNOWN_EPISODE_LIMIT));
  }

  private seasonTotalEpisodes(season: PopularAnimeSeason): number {
    return isMovieSeason(season) ? Math.max(1, season.episodes) : Math.max(0, season.episodes);
  }

  private progressPercent(watched: number, total: number): number {
    if (total <= 0) {
      return 0;
    }

    return Math.min(100, Math.max(0, (watched / total) * 100));
  }

  private isExtraSeason(season: PopularAnimeSeason, anime?: PopularAnime): boolean {
    const normalizedType = season.type
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return isMovieSeason(season) || ['ova', 'ona', 'special', 'tv special'].includes(normalizedType) || this.isTvInterludeSpecial(anime, season);
  }

  private isTvInterludeSpecial(anime: PopularAnime | undefined, season: PopularAnimeSeason): boolean {
    if (!anime || season.episodes <= 0 || season.episodes > 6) {
      return false;
    }

    const normalizedAnimeTitle = this.normalizeTitle(anime.title);
    const normalizedTitle = this.normalizeTitle(season.title);
    const paddedTitle = ` ${normalizedTitle} `;

    if (normalizedAnimeTitle === 'the seven deadly sins' && normalizedTitle.includes('signs of holy war')) {
      return true;
    }

    return (
      paddedTitle.includes(' special ') ||
      paddedTitle.includes(' specials ') ||
      paddedTitle.includes(' ova ') ||
      paddedTitle.includes(' recap ')
    );
  }

  private isSpinOffSeason(anime: PopularAnime, season: PopularAnimeSeason): boolean {
    if (this.isExtraSeason(season, anime)) {
      return false;
    }

    const normalizedTitle = this.normalizeTitle(season.title);
    const paddedTitle = ` ${normalizedTitle} `;
    if (
      paddedTitle.includes(' alternative ') ||
      paddedTitle.includes(' spin off ') ||
      paddedTitle.includes(' junior high ') ||
      paddedTitle.includes(' side story ') ||
      paddedTitle.includes(' another story ') ||
      paddedTitle.includes(' gaiden ') ||
      paddedTitle.includes(' sd ') ||
      paddedTitle.includes(' chibi ') ||
      paddedTitle.includes(' mini anime ') ||
      paddedTitle.includes(' omake ') ||
      paddedTitle.includes(' picture drama ') ||
      paddedTitle.includes(' theater ') ||
      paddedTitle.includes(' theatre ') ||
      paddedTitle.includes(' parody ') ||
      paddedTitle.includes(' petit ')
    ) {
      return true;
    }

    const normalizedAnimeTitle = this.normalizeTitle(anime.title);
    if (
      normalizedTitle.includes('four knights of the apocalypse') ||
      normalizedTitle.includes('vigilantes') ||
      normalizedTitle.includes('illegals') ||
      normalizedTitle.includes('rock lee') ||
      normalizedTitle.includes('lee no seishun') ||
      normalizedTitle.includes('gun gale online') ||
      normalizedTitle.includes('explosion on this wonderful world') ||
      normalizedTitle.includes('slime diaries') ||
      (normalizedAnimeTitle === 'the seven deadly sins' && normalizedTitle.includes('mokushiroku no yonkishi'))
    ) {
      return true;
    }

    return false;
  }

  private isMainSeason(anime: PopularAnime, season: PopularAnimeSeason): boolean {
    return !this.isExtraSeason(season, anime) && !this.isSpinOffSeason(anime, season);
  }

  private seasonEyebrowLabel(anime: PopularAnime, season: PopularAnimeSeason): string {
    if (this.isExtraSeason(season, anime)) {
      return this.extraSeasonTabLabel(anime, season);
    }

    if (this.isSpinOffSeason(anime, season)) {
      return 'Spin-off';
    }

    return this.seasonDisplayTitle(anime, season);
  }

  private mainSeasonNumber(anime: PopularAnime, season: PopularAnimeSeason): number {
    return mainSeasonNumberFor(anime, season, {
      isMainSeason: (currentAnime, currentSeason) => this.isMainSeason(currentAnime, currentSeason),
    });
  }

  removeCurrentTracking(): void {
    const account = this.account();
    const entry = this.selectedLibraryEntry();
    if (!account || !entry || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.feedback.set('');
    this.errorMessage.set('');

    this.animethequeService.delete(account.id, entry.id).subscribe({
      next: () => {
        this.libraryEntries.update((entries) => entries.filter((currentEntry) => currentEntry.id !== entry.id));
        this.watchStatus.set('PLANNED');
        this.watchedEpisodes.set(0);
        this.feedback.set(this.languageService.t('library.removed', { title: entry.title }));
        this.saving.set(false);
      },
      error: () => {
        this.errorMessage.set(this.languageService.t('library.removeError'));
        this.saving.set(false);
      },
    });
  }

  private localizedSeasonTitle(anime: PopularAnime, season: PopularAnimeSeason): string {
    if (this.isSpinOffSeason(anime, season)) {
      return '';
    }

    return labelMainSeason(anime, season, {
      isMainSeason: (currentAnime, currentSeason) => this.isMainSeason(currentAnime, currentSeason),
    }).title;
  }

  private cleanSeasonTitle(anime: PopularAnime, title: string): string {
    return cleanSeasonTitle(anime, title)
      .replace(/\bseason\s+\d+\b/gi, ' ')
      .replace(/\bpart\s+(\d+)\b/gi, 'Partie $1')
      .replace(/^[\s.。:;\-\u2013\u2014]+/g, ' ')
      .replace(/[\s.。:;\-\u2013\u2014]+$/g, ' ')
      .replace(/[:\-–—]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extraSeasonLabel(anime: PopularAnime, season: PopularAnimeSeason): string {
    const typeLabel = this.extraSeasonCode(season, anime);
    const detail = this.extraSeasonDetailTitle(anime, season);
    if (detail) {
      return `${typeLabel} - ${detail}`;
    }

    return season.year ? `${typeLabel} ${season.year}` : `${typeLabel} / Spéciaux`;

  }

  private spinOffSeasonLabel(anime: PopularAnime, season: PopularAnimeSeason): string {
    const detail = this.spinOffSeasonDetailTitle(anime, season);
    return detail ? `Spin-off - ${detail}` : 'Spin-off';
  }

  private spinOffSeasonDetailTitle(anime: PopularAnime, season: PopularAnimeSeason): string {
    const detail = this.cleanSeasonTitle(anime, season.title)
      .replace(/\balternative\b/gi, 'Alternative')
      .replace(/\bspin off\b/gi, ' ')
      .replace(/\bside story\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return detail || season.title;
  }

  private extraSeasonTabLabel(anime: PopularAnime, season: PopularAnimeSeason): string {
    const typeLabel = this.extraSeasonCode(season, anime);
    const detail = this.extraSeasonDetailTitle(anime, season);
    if (detail && detail.length <= 18) {
      return `${typeLabel} - ${detail}`;
    }

    return season.year ? `${typeLabel} ${season.year}` : typeLabel;
  }

  private extraSeasonDetailTitle(anime: PopularAnime, season: PopularAnimeSeason): string {
    let detail = season.title.trim();
    for (const removableTitle of [anime.title, anime.titleJapanese].filter(Boolean) as string[]) {
      detail = detail.replace(new RegExp(this.escapeRegExp(removableTitle), 'gi'), ' ');
    }

    detail = detail
      .replace(/\b(ova|ona|specials?|tv specials?)\b/gi, ' ')
      .replace(/\bfinal season\b/gi, 'Saison finale')
      .replace(/\bthe final chapters?\b/gi, 'Chapitres finaux')
      .replace(/^[\s.。:;\-\u2013\u2014]+/g, ' ')
      .replace(/[\s.。:;\-\u2013\u2014]+$/g, ' ')
      .replace(/[:\-–—]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (isMovieSeason(season)) {
      detail = detail
        .replace(/\bthe movie\b/gi, ' ')
        .replace(/\bmovie\b/gi, ' ')
        .replace(/^\s*\d+\s*/, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (!detail || detail.length < 3 || this.normalizeTitle(detail) === this.normalizeTitle(season.title)) {
      return '';
    }

    return detail;
  }

  private extraSeasonCode(season: PopularAnimeSeason, anime?: PopularAnime): string {
    if (isMovieSeason(season)) {
      return 'Film';
    }

    const normalizedType = season.type
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (normalizedType === 'ona') {
      return 'ONA';
    }

    if (normalizedType === 'tv special' || this.isTvInterludeSpecial(anime, season)) {
      return 'SP';
    }

    return 'OVA';
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private trailerUrlForCurrentView(anime: PopularAnime): string | null {
    return this.selectedSeason()?.trailerUrl ?? anime.trailerUrl;
  }

  private extractYouTubeVideoId(url: string | null): string | null {
    if (!url) {
      return null;
    }

    const patterns = [
      /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
      /youtube\.com\/watch\?[^#]*v=([a-zA-Z0-9_-]{6,})/,
      /youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }

  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private translateSynopsis(synopsis: string, language: 'fr' | 'en'): void {
    if (language === 'en') {
      this.translatedSynopsis.set(synopsis);
      this.translatingSynopsis.set(false);
      return;
    }

    this.translatedSynopsis.set('');
    this.translatingSynopsis.set(true);
    this.languageService.translateText(synopsis, 'en', 'fr').subscribe({
      next: (translation) => {
        const currentAnime = this.anime();
        if (currentAnime && this.synopsisForCurrentView(currentAnime) === synopsis && this.languageService.language() === language) {
          this.translatedSynopsis.set(translation);
          this.translatingSynopsis.set(false);
        }
      },
      error: () => {
        const currentAnime = this.anime();
        if (currentAnime && this.synopsisForCurrentView(currentAnime) === synopsis && this.languageService.language() === language) {
          this.translatedSynopsis.set(synopsis);
          this.translatingSynopsis.set(false);
        }
      },
    });
  }

  private translateEpisodeTitles(episodeOptions: AnimeEpisodeOption[], language: 'fr' | 'en'): void {
    const requestId = ++this.episodeTitleTranslationRequestId;

    if (language !== 'fr') {
      this.translatedEpisodeTitles.set({});
      return;
    }

    const titledEpisodes = episodeOptions.filter((episode) => episode.value > 0 && episode.title);
    if (titledEpisodes.length === 0) {
      this.translatedEpisodeTitles.set({});
      return;
    }

    this.translatedEpisodeTitles.set({});
    from(titledEpisodes)
      .pipe(
        concatMap((episode) =>
          this.languageService.translateText(episode.title, 'en', 'fr').pipe(
            map((translation) => ({
              value: episode.value,
              title: translation.trim() || episode.title,
            })),
            catchError(() =>
              of({
                value: episode.value,
                title: episode.title,
              }),
            ),
          ),
        ),
      )
      .subscribe({
        next: ({ value, title }) => {
          if (requestId !== this.episodeTitleTranslationRequestId || this.languageService.language() !== language) {
            return;
          }

          this.translatedEpisodeTitles.update((translations) => ({
            ...translations,
            [value]: title,
          }));
        },
      });
  }
}
