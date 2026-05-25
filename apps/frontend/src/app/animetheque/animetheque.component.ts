import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { AnimethequeEntry, AnimethequeEntryRequest, WatchStatus } from '../models/animetheque.model';
import { AchievementNotificationService } from '../services/achievement-notification.service';
import { AnimethequeService } from '../services/animetheque.service';
import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { MarketingAnalyticsService } from '../services/marketing-analytics.service';
import { isMovieEntry } from '../utils/anime-format.util';

type StatusFilter = WatchStatus | 'ALL' | 'FAVORITES';
type TypeFilter = 'ALL' | 'SERIES' | 'OVA' | 'MOVIE' | 'SPECIAL';
type SortMode = 'title-asc' | 'updated-desc' | 'progress-desc' | 'catalog-score-desc';
type StatKind = 'anime' | 'watching' | 'completed' | 'episodes' | 'score';

interface LibraryStat {
  value: string;
  label: string;
  caption: string;
  kind: StatKind;
}

interface TypeChip {
  value: TypeFilter;
  label: string;
}

interface PlatformLink {
  id: string;
  label: string;
}

const UNKNOWN_EPISODE_LIMIT = 9999;

const STATUS_LABELS: Record<WatchStatus, string> = {
  PLANNED: 'À voir',
  WATCHING: 'En cours',
  COMPLETED: 'Terminé',
  PAUSED: 'En pause',
  DROPPED: 'Abandonné',
};

const STATUS_OPTIONS: { value: WatchStatus; label: string }[] = [
  { value: 'PLANNED', label: 'À voir' },
  { value: 'WATCHING', label: 'En cours' },
  { value: 'COMPLETED', label: 'Terminé' },
  { value: 'PAUSED', label: 'En pause' },
  { value: 'DROPPED', label: 'Abandonné' },
];

@Component({
  selector: 'app-animetheque',
  standalone: true,
  imports: [FormsModule, RouterLink, MenuBarComponent],
  templateUrl: './animetheque.component.html',
  styleUrl: './animetheque.component.scss',
})
export class AnimethequeComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly animethequeService = inject(AnimethequeService);
  private readonly achievementNotificationService = inject(AchievementNotificationService);
  private readonly languageService = inject(LanguageService);
  private readonly analytics = inject(MarketingAnalyticsService);

  readonly account = this.authService.currentAccount();
  readonly entries = signal<AnimethequeEntry[]>([]);
  readonly loading = signal(true);
  readonly feedback = signal('');
  readonly statusFilter = signal<StatusFilter>('ALL');
  readonly typeFilter = signal<TypeFilter>('ALL');
  readonly sortMode = signal<SortMode>('title-asc');
  readonly genreFilter = signal('ALL');
  readonly query = signal('');

  readonly fallbackCoverUrl = 'assets/anime-catalog/default-castle-bg.webp';
  readonly statusOptions = STATUS_OPTIONS;

  readonly statusTabs: { value: StatusFilter; label: string }[] = [
    { value: 'ALL', label: 'Tous' },
    { value: 'WATCHING', label: 'En cours' },
    { value: 'COMPLETED', label: 'Terminés' },
    { value: 'PLANNED', label: 'À voir' },
    { value: 'FAVORITES', label: 'Favoris' },
  ];

  readonly typeChips: TypeChip[] = [
    { value: 'ALL', label: 'Total' },
    { value: 'SERIES', label: 'Séries' },
    { value: 'OVA', label: 'OAV' },
    { value: 'MOVIE', label: 'Films' },
    { value: 'SPECIAL', label: 'Spécial' },
  ];

  readonly sortOptions: { value: SortMode; label: string }[] = [
    { value: 'title-asc', label: 'Titre (A → Z)' },
    { value: 'updated-desc', label: 'Ajout récent' },
    { value: 'progress-desc', label: 'Progression' },
    { value: 'catalog-score-desc', label: 'Score catalogue' },
  ];

  readonly allPlatformLink: PlatformLink = { id: 'all', label: 'Tous' };
  readonly platformLinks: PlatformLink[] = [
    { id: 'crunchyroll', label: 'crunchyroll' },
    { id: 'netflix', label: 'NETFLIX' },
    { id: 'prime', label: 'prime video' },
    { id: 'wakanim', label: 'WAKANIM' },
    { id: 'disney', label: 'Disney+' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'adn', label: 'ADN' },
  ];

  readonly genreOptions = computed(() => {
    const genres = new Set<string>();
    for (const entry of this.entries()) {
      for (const genre of this.catalogGenres(entry)) {
        genres.add(genre);
      }
    }

    return [...genres].sort((left, right) => left.localeCompare(right, 'fr', { sensitivity: 'base' }));
  });

  readonly visibleEntries = computed(() => {
    const status = this.statusFilter();
    const type = this.typeFilter();
    const genre = this.genreFilter();
    const query = this.normalize(this.query());

    const filtered = this.entries()
      .filter((entry) => this.matchesStatusFilter(entry, status))
      .filter((entry) => type === 'ALL' || this.typeCategory(entry) === type)
      .filter((entry) => genre === 'ALL' || this.catalogGenres(entry).includes(genre))
      .filter((entry) => this.matchesSearch(entry, query));

    return this.sortEntries(filtered, this.sortMode());
  });

  readonly watchingEntries = computed(() =>
    this.visibleEntries().filter((entry) => this.effectiveStatus(entry) === 'WATCHING'),
  );

  readonly completedEntries = computed(() =>
    this.visibleEntries().filter((entry) => this.effectiveStatus(entry) === 'COMPLETED'),
  );

  readonly otherEntries = computed(() =>
    this.visibleEntries().filter((entry) => !['WATCHING', 'COMPLETED'].includes(this.effectiveStatus(entry))),
  );

  readonly watchedEpisodesTotal = computed(() =>
    this.entries().reduce((total, entry) => total + Math.max(0, Number(entry.watchedEpisodes || 0)), 0),
  );

  readonly watchingCount = computed(() => this.entries().filter((entry) => this.effectiveStatus(entry) === 'WATCHING').length);
  readonly completedCount = computed(() => this.entries().filter((entry) => this.effectiveStatus(entry) === 'COMPLETED').length);

  readonly completedScoredEntries = computed(() =>
    this.entries().filter((entry) => this.effectiveStatus(entry) === 'COMPLETED' && this.catalogScore(entry) !== null),
  );

  readonly averageCatalogScore = computed(() => {
    const scoredEntries = this.completedScoredEntries();
    if (!scoredEntries.length) {
      return null;
    }

    const total = scoredEntries.reduce((sum, entry) => sum + (this.catalogScore(entry) ?? 0), 0);
    return total / scoredEntries.length;
  });

  readonly statCards = computed<LibraryStat[]>(() => [
    { value: String(this.entries().length), label: 'Animes suivis', caption: 'Collection totale', kind: 'anime' },
    { value: String(this.watchingCount()), label: 'En cours', caption: 'En attente', kind: 'watching' },
    { value: String(this.completedCount()), label: 'Terminés', caption: 'Complétés', kind: 'completed' },
    { value: this.formatNumber(this.watchedEpisodesTotal()), label: 'Épisodes vus', caption: 'Temps de visionnage', kind: 'episodes' },
    {
      value: this.averageCatalogScore() === null ? '-' : this.formatScore(this.averageCatalogScore()),
      label: 'Note moyenne',
      caption: this.completedScoredEntries().length
        ? `Sur ${this.completedScoredEntries().length} terminés`
        : 'Score catalogue',
      kind: 'score',
    },
  ]);

  readonly hasActiveFilters = computed(
    () =>
      this.statusFilter() !== 'ALL' ||
      this.typeFilter() !== 'ALL' ||
      this.genreFilter() !== 'ALL' ||
      this.query().trim().length > 0,
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (!this.account) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.feedback.set('');

    this.animethequeService.list(this.account.id).subscribe({
      next: (entries) => {
        this.entries.set(entries);
        this.loading.set(false);
      },
      error: () => {
        this.feedback.set(this.languageService.t('library.loadingError'));
        this.loading.set(false);
      },
    });
  }

  setStatusFilter(status: StatusFilter): void {
    this.statusFilter.set(status);
  }

  setTypeFilter(type: TypeFilter): void {
    this.typeFilter.set(type);
  }

  setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  setSortMode(event: Event): void {
    this.sortMode.set((event.target as HTMLSelectElement).value as SortMode);
  }

  setGenreFilter(event: Event): void {
    this.genreFilter.set((event.target as HTMLSelectElement).value);
  }

  clearFilters(): void {
    this.statusFilter.set('ALL');
    this.typeFilter.set('ALL');
    this.genreFilter.set('ALL');
    this.query.set('');
  }

  showWatching(): void {
    this.statusFilter.set('WATCHING');
  }

  showCompleted(): void {
    this.statusFilter.set('COMPLETED');
  }

  updateStatus(entry: AnimethequeEntry, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const status = select.value as WatchStatus;
    if (status === 'WATCHING' && !this.isMovie(entry) && entry.watchedEpisodes <= 0) {
      select.value = entry.status;
      this.feedback.set(this.languageService.t('anime.watchingNeedsEpisode'));
      return;
    }

    let watchedEpisodes = this.watchedEpisodesForStatus(entry, status);
    if (status === 'WATCHING' && this.isWatchedAtEpisodeLimit(entry, watchedEpisodes)) {
      watchedEpisodes = Math.max(0, Number(entry.totalEpisodes || 0) - 1);
      if (watchedEpisodes <= 0) {
        select.value = entry.status;
        this.feedback.set(this.languageService.t('anime.watchingNeedsEpisode'));
        return;
      }
    }

    this.save({
      ...entry,
      status: this.statusForWatchedEpisodes(status, watchedEpisodes, entry.totalEpisodes),
      watchedEpisodes,
    });
  }

  advanceProgress(entry: AnimethequeEntry): void {
    if (this.effectiveStatus(entry) === 'COMPLETED') {
      return;
    }

    if (this.isMovie(entry)) {
      this.save({ ...entry, status: 'COMPLETED', watchedEpisodes: 1 });
      return;
    }

    const nextWatched = this.clampNumber(Number(entry.watchedEpisodes || 0) + 1, 0, this.maxEpisodes(entry));
    const completed = entry.totalEpisodes > 0 && nextWatched >= entry.totalEpisodes;
    this.save({
      ...entry,
      status: completed ? 'COMPLETED' : 'WATCHING',
      watchedEpisodes: nextWatched,
    });
  }

  toggleFavorite(entry: AnimethequeEntry): void {
    this.save({ ...entry, favorite: !entry.favorite });
  }

  remove(entry: AnimethequeEntry): void {
    if (!this.account) {
      return;
    }

    this.animethequeService.delete(this.account.id, entry.id).subscribe({
      next: () => {
        this.entries.update((entries) => entries.filter((item) => item.id !== entry.id));
        this.feedback.set(this.languageService.t('library.removed', { title: entry.title }));
      },
      error: () => this.feedback.set(this.languageService.t('library.removeError')),
    });
  }

  typeCount(type: TypeFilter): number {
    if (type === 'ALL') {
      return this.entries().length;
    }

    return this.entries().filter((entry) => this.typeCategory(entry) === type).length;
  }

  statusLabel(status: WatchStatus): string {
    return STATUS_LABELS[status] ?? status;
  }

  displayStatus(entry: AnimethequeEntry): WatchStatus {
    return this.effectiveStatus(entry);
  }

  statusPillClass(entry: AnimethequeEntry): string {
    return `status-pill status-pill--${this.displayStatus(entry).toLowerCase()}`;
  }

  entryRoute(entry: AnimethequeEntry): string[] {
    if (entry.trackingMode === 'SEASON' && entry.parentAnimeSlug && entry.seasonSlug) {
      return ['/animes', entry.parentAnimeSlug, 'seasons', entry.seasonSlug];
    }

    return ['/animes', entry.parentAnimeSlug || entry.animeSlug];
  }

  coverUrl(entry: AnimethequeEntry): string {
    return entry.coverUrl || this.fallbackCoverUrl;
  }

  entryYear(entry: AnimethequeEntry): string {
    return entry.catalogYear ? String(entry.catalogYear) : 'Année inconnue';
  }

  entryTypeLabel(entry: AnimethequeEntry): string {
    switch (this.typeCategory(entry)) {
      case 'MOVIE':
        return 'Film';
      case 'OVA':
        return 'OAV';
      case 'SPECIAL':
        return 'Spécial';
      case 'SERIES':
      default:
        return 'Série';
    }
  }

  typeBadgeClass(entry: AnimethequeEntry): string {
    return `type-badge type-badge--${this.typeCategory(entry).toLowerCase()}`;
  }

  episodeProgressLabel(entry: AnimethequeEntry): string {
    if (this.isMovie(entry)) {
      return entry.status === 'COMPLETED' || entry.watchedEpisodes > 0 ? 'Film vu' : 'Film à voir';
    }

    const total = entry.totalEpisodes > 0 ? entry.totalEpisodes : '?';
    return `${entry.watchedEpisodes} / ${total} épisodes`;
  }

  shortEpisodeProgressLabel(entry: AnimethequeEntry): string {
    if (this.isMovie(entry)) {
      return entry.status === 'COMPLETED' || entry.watchedEpisodes > 0 ? '1 / 1' : '0 / 1';
    }

    return `${entry.watchedEpisodes} / ${entry.totalEpisodes > 0 ? entry.totalEpisodes : '?'}`;
  }

  progressPercent(entry: AnimethequeEntry): number {
    if (this.isMovie(entry)) {
      return entry.status === 'COMPLETED' || entry.watchedEpisodes > 0 ? 100 : 0;
    }

    if (!entry.totalEpisodes) {
      return 0;
    }

    return Math.min(100, Math.max(0, Math.round((entry.watchedEpisodes / entry.totalEpisodes) * 100)));
  }

  catalogScore(entry: AnimethequeEntry): number | null {
    const score = entry.catalogScore;
    return score === null || score === undefined || !Number.isFinite(Number(score)) ? null : Number(score);
  }

  catalogScoreLabel(entry: AnimethequeEntry): string {
    const score = this.catalogScore(entry);
    return score === null ? '-' : this.formatScore(score);
  }

  platformUrl(platform: PlatformLink): string {
    const cleanQuery = this.query().trim() || 'anime';
    const query = encodeURIComponent(cleanQuery);

    switch (platform.id) {
      case 'all':
        return `https://www.google.com/search?q=${query}%20anime%20fiche`;
      case 'crunchyroll':
        return `https://www.crunchyroll.com/search?q=${query}`;
      case 'netflix':
        return `https://www.netflix.com/search?q=${query}`;
      case 'prime':
        return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${query}`;
      case 'wakanim':
        return `https://www.wakanim.tv/fr/v2/catalogue/search?search=${query}`;
      case 'disney':
        return `https://www.disneyplus.com/search?q=${query}`;
      case 'youtube':
        return `https://www.youtube.com/results?search_query=${query}`;
      case 'adn':
      default:
        return `https://animationdigitalnetwork.fr/recherche?search=${query}`;
    }
  }

  isMovie(entry: AnimethequeEntry): boolean {
    return isMovieEntry(entry) || this.typeCategory(entry) === 'MOVIE';
  }

  private matchesSearch(entry: AnimethequeEntry, query: string): boolean {
    if (!query) {
      return true;
    }

    return this.normalize(
      [
        entry.title,
        entry.parentTitle,
        entry.seasonTitle,
        this.statusLabel(this.effectiveStatus(entry)),
        this.entryTypeLabel(entry),
        this.entryYear(entry),
        ...this.catalogGenres(entry),
      ].join(' '),
    ).includes(query);
  }

  private matchesStatusFilter(entry: AnimethequeEntry, status: StatusFilter): boolean {
    switch (status) {
      case 'ALL':
        return true;
      case 'FAVORITES':
        return entry.favorite;
      default:
        return this.effectiveStatus(entry) === status;
    }
  }

  private sortEntries(entries: AnimethequeEntry[], sortMode: SortMode): AnimethequeEntry[] {
    const sorted = [...entries];

    switch (sortMode) {
      case 'updated-desc':
        return sorted.sort((left, right) => this.compareUpdatedDesc(left, right));
      case 'progress-desc':
        return sorted.sort((left, right) => this.progressPercent(right) - this.progressPercent(left) || this.compareTitle(left, right));
      case 'catalog-score-desc':
        return sorted.sort((left, right) => (this.catalogScore(right) ?? -1) - (this.catalogScore(left) ?? -1) || this.compareTitle(left, right));
      case 'title-asc':
      default:
        return sorted.sort((left, right) => this.compareTitle(left, right));
    }
  }

  private typeCategory(entry: AnimethequeEntry): TypeFilter {
    const rawType = this.normalizeCatalogType(entry.catalogType || entry.mediaType || '');
    if (rawType.includes('movie') || rawType.includes('film')) {
      return 'MOVIE';
    }

    if (rawType.includes('ova') || rawType.includes('oav')) {
      return 'OVA';
    }

    if (rawType.includes('special')) {
      return 'SPECIAL';
    }

    return 'SERIES';
  }

  private catalogGenres(entry: AnimethequeEntry): string[] {
    return (entry.catalogGenres ?? []).map((genre) => genre.trim()).filter(Boolean);
  }

  private effectiveStatus(entry: AnimethequeEntry): WatchStatus {
    if (entry.status !== 'WATCHING') {
      return entry.status;
    }

    const watchedEpisodes = Math.max(0, Number(entry.watchedEpisodes || 0));
    if (watchedEpisodes <= 0) {
      return 'PLANNED';
    }

    return this.isWatchedAtEpisodeLimit(entry, watchedEpisodes) ? 'COMPLETED' : 'WATCHING';
  }

  private save(entry: AnimethequeEntry): void {
    if (!this.account) {
      return;
    }

    const previousEntries = this.entries();
    const previousEntry = previousEntries.find((item) => item.id === entry.id);
    const request = this.toRequest(entry);

    this.animethequeService.save(this.account.id, request).subscribe({
      next: (updated) => {
        this.entries.update((entries) => {
          const exists = entries.some((item) => item.id === updated.id);
          if (exists) {
            return entries.map((item) => (item.id === updated.id ? updated : item));
          }

          return [updated, ...entries.filter((item) => item.id !== entry.id)];
        });
        this.achievementNotificationService.notifyUnlockedFromEntries(previousEntries, this.entries());
        this.trackProgressUpdate(previousEntry, updated);
        this.feedback.set(this.languageService.t('library.updated', { title: updated.title }));
      },
      error: () => this.feedback.set(this.languageService.t('library.updateError')),
    });
  }

  private trackProgressUpdate(previousEntry: AnimethequeEntry | undefined, updated: AnimethequeEntry): void {
    if (
      previousEntry &&
      previousEntry.status === updated.status &&
      previousEntry.watchedEpisodes === updated.watchedEpisodes
    ) {
      return;
    }

    const properties = {
      route: '/anime-library',
      anime_id: updated.animeSlug || updated.id,
      anime_title: updated.title,
      status: updated.status,
      watched_episodes: updated.watchedEpisodes,
    };

    this.analytics.trackEvent('anime_progress_update', properties);
    if (updated.status === 'COMPLETED' && previousEntry?.status !== 'COMPLETED') {
      this.analytics.trackEvent('anime_mark_completed', properties);
    }
  }

  private toRequest(entry: AnimethequeEntry): AnimethequeEntryRequest {
    const totalEpisodes = Math.max(0, Number(entry.totalEpisodes || 0));
    const watchedEpisodes = this.normalizedWatchedEpisodes(entry, totalEpisodes);
    const status = this.statusForWatchedEpisodes(entry.status, watchedEpisodes, totalEpisodes);
    const score = entry.score === null || entry.score === undefined ? null : this.clampNumber(Number(entry.score), 0, 10);

    return {
      animeSlug: entry.animeSlug,
      parentAnimeSlug: entry.parentAnimeSlug,
      parentTitle: entry.parentTitle,
      seasonSlug: entry.seasonSlug,
      seasonTitle: entry.seasonTitle,
      seasonNumber: entry.seasonNumber,
      trackingMode: entry.trackingMode,
      mediaType: entry.mediaType,
      title: entry.title,
      coverUrl: entry.coverUrl,
      status,
      watchedEpisodes,
      totalEpisodes,
      score,
      favorite: entry.favorite,
      notes: entry.notes || '',
    };
  }

  private normalizedWatchedEpisodes(entry: AnimethequeEntry, totalEpisodes: number): number {
    if (this.isMovie(entry)) {
      return entry.status === 'COMPLETED' ? 1 : 0;
    }

    if (entry.status === 'COMPLETED') {
      return totalEpisodes > 0 ? totalEpisodes : Math.max(0, Number(entry.watchedEpisodes || 0));
    }

    if (entry.status === 'PLANNED') {
      return 0;
    }

    const maxEpisodes = totalEpisodes > 0 ? totalEpisodes : UNKNOWN_EPISODE_LIMIT;
    return this.clampNumber(Number(entry.watchedEpisodes || 0), 0, maxEpisodes);
  }

  private watchedEpisodesForStatus(entry: AnimethequeEntry, status: WatchStatus): number {
    if (this.isMovie(entry)) {
      return status === 'COMPLETED' ? 1 : 0;
    }

    if (status === 'COMPLETED') {
      return entry.totalEpisodes > 0 ? entry.totalEpisodes : Math.max(0, Number(entry.watchedEpisodes || 0));
    }

    if (status === 'PLANNED') {
      return 0;
    }

    return entry.watchedEpisodes;
  }

  private statusForWatchedEpisodes(currentStatus: WatchStatus, watchedEpisodes: number, totalEpisodes: number): WatchStatus {
    if (currentStatus === 'WATCHING' && totalEpisodes > 0 && watchedEpisodes >= totalEpisodes) {
      return 'COMPLETED';
    }

    if (watchedEpisodes <= 0 && currentStatus === 'WATCHING') {
      return 'PLANNED';
    }

    if (watchedEpisodes > 0 && currentStatus === 'PLANNED') {
      return 'WATCHING';
    }

    return currentStatus;
  }

  private isWatchedAtEpisodeLimit(entry: AnimethequeEntry, watchedEpisodes = entry.watchedEpisodes): boolean {
    const totalEpisodes = Math.max(0, Number(entry.totalEpisodes || 0));
    return totalEpisodes > 0 && watchedEpisodes >= totalEpisodes;
  }

  private maxEpisodes(entry: AnimethequeEntry): number {
    return entry.totalEpisodes > 0 ? entry.totalEpisodes : UNKNOWN_EPISODE_LIMIT;
  }

  private compareUpdatedDesc(left: AnimethequeEntry, right: AnimethequeEntry): number {
    return this.timestamp(right.updatedAt) - this.timestamp(left.updatedAt);
  }

  private compareTitle(left: AnimethequeEntry, right: AnimethequeEntry): number {
    return left.title.localeCompare(right.title, 'fr', { sensitivity: 'base' });
  }

  private timestamp(value: string): number {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  private normalizeCatalogType(value: string): string {
    return this.normalize(value).replace(/[^a-z0-9]+/g, ' ');
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.max(min, Math.min(Math.round(value), max));
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('fr-BE').format(value);
  }

  private formatScore(value: number | null): string {
    if (value === null) {
      return '-';
    }

    return value.toLocaleString('fr-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
}
