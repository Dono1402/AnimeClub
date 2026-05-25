import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { WatchStatus } from '../models/animetheque.model';
import { MangaLibraryEntry, MangaLibraryEntryRequest } from '../models/manga.model';
import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { MangaLibraryService } from '../services/manga-library.service';

type StatusFilter = WatchStatus | 'ALL' | 'FAVORITES';
type TypeFilter = 'ALL' | 'MANGA' | 'LIGHT_NOVEL' | 'NOVEL' | 'MANHWA' | 'MANHUA' | 'ONE_SHOT' | 'DOUJINSHI' | 'OTHER';
type SortMode = 'title-asc' | 'updated-desc' | 'progress-desc' | 'catalog-score-desc';
type StatKind = 'manga' | 'reading' | 'completed' | 'volumes' | 'score';

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

interface ExternalLink {
  id: string;
  label: string;
}

const UNKNOWN_VOLUME_LIMIT = 9999;

const STATUS_LABELS: Record<WatchStatus, string> = {
  PLANNED: 'À lire',
  WATCHING: 'En cours',
  COMPLETED: 'Terminé',
  PAUSED: 'En pause',
  DROPPED: 'Abandonné',
};

const STATUS_OPTIONS: { value: WatchStatus; label: string }[] = [
  { value: 'PLANNED', label: 'À lire' },
  { value: 'WATCHING', label: 'En cours' },
  { value: 'COMPLETED', label: 'Terminé' },
  { value: 'PAUSED', label: 'En pause' },
  { value: 'DROPPED', label: 'Abandonné' },
];

@Component({
  selector: 'app-mangatheque',
  standalone: true,
  imports: [FormsModule, RouterLink, MenuBarComponent],
  templateUrl: './mangatheque.component.html',
  styleUrl: './mangatheque.component.scss',
})
export class MangathequeComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly mangaLibraryService = inject(MangaLibraryService);
  private readonly languageService = inject(LanguageService);

  readonly account = this.authService.currentAccount();
  readonly entries = signal<MangaLibraryEntry[]>([]);
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
    { value: 'PLANNED', label: 'À lire' },
    { value: 'FAVORITES', label: 'Favoris' },
  ];

  readonly sortOptions: { value: SortMode; label: string }[] = [
    { value: 'title-asc', label: 'Titre (A → Z)' },
    { value: 'updated-desc', label: 'Ajout récent' },
    { value: 'progress-desc', label: 'Progression' },
    { value: 'catalog-score-desc', label: 'Score catalogue' },
  ];

  readonly allExternalLink: ExternalLink = { id: 'all', label: 'Tous' };
  readonly externalLinks: ExternalLink[] = [
    { id: 'mangaplus', label: 'Manga Plus' },
    { id: 'amazon', label: 'Amazon' },
    { id: 'fnac', label: 'Fnac' },
    { id: 'bookwalker', label: 'BookWalker' },
    { id: 'izneo', label: 'Izneo' },
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

  readonly typeChips = computed<TypeChip[]>(() => {
    const values: TypeFilter[] = ['MANGA', 'LIGHT_NOVEL', 'NOVEL', 'MANHWA', 'MANHUA', 'ONE_SHOT', 'DOUJINSHI', 'OTHER'];
    return [
      { value: 'ALL', label: 'Total' },
      ...values
        .filter((value) => this.typeCount(value) > 0)
        .map((value) => ({ value, label: this.typeFilterLabel(value) })),
    ];
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

  readonly readingEntries = computed(() =>
    this.visibleEntries().filter((entry) => this.effectiveStatus(entry) === 'WATCHING'),
  );

  readonly completedEntries = computed(() =>
    this.visibleEntries().filter((entry) => this.effectiveStatus(entry) === 'COMPLETED'),
  );

  readonly otherEntries = computed(() =>
    this.visibleEntries().filter((entry) => !['WATCHING', 'COMPLETED'].includes(this.effectiveStatus(entry))),
  );

  readonly readVolumesTotal = computed(() =>
    this.entries().reduce((total, entry) => total + Math.max(0, Number(entry.readVolumes || 0)), 0),
  );

  readonly readingCount = computed(() => this.entries().filter((entry) => this.effectiveStatus(entry) === 'WATCHING').length);
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
    { value: String(this.entries().length), label: 'Mangas suivis', caption: 'Collection totale', kind: 'manga' },
    { value: String(this.readingCount()), label: 'En cours', caption: 'Lecture active', kind: 'reading' },
    { value: String(this.completedCount()), label: 'Terminés', caption: 'Complétés', kind: 'completed' },
    { value: this.formatNumber(this.readVolumesTotal()), label: 'Tomes lus', caption: 'Progression', kind: 'volumes' },
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

    this.mangaLibraryService.list(this.account.id).subscribe({
      next: (entries) => {
        this.entries.set(entries);
        this.loading.set(false);
      },
      error: () => {
        this.feedback.set('Impossible de charger ta Mangathèque.');
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

  showReading(): void {
    this.statusFilter.set('WATCHING');
  }

  showCompleted(): void {
    this.statusFilter.set('COMPLETED');
  }

  updateStatus(entry: MangaLibraryEntry, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const status = select.value as WatchStatus;
    if (status === 'WATCHING' && entry.readVolumes <= 0) {
      select.value = this.displayStatus(entry);
      this.feedback.set('Choisis au moins 1 tome lu pour passer ce manga en cours.');
      return;
    }

    const readVolumes = this.readVolumesForStatus(entry, status);
    this.save({
      ...entry,
      status: this.statusForReadVolumes(status, readVolumes, entry.totalVolumes),
      readVolumes,
    });
  }

  updateReadVolumes(entry: MangaLibraryEntry, event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = Number(input.value);
    const readVolumes = Number.isFinite(rawValue)
      ? this.clampNumber(rawValue, 0, this.maxVolumes(entry))
      : 0;
    input.value = String(readVolumes);
    this.save({
      ...entry,
      readVolumes,
      status: this.statusForReadVolumes(entry.status, readVolumes, entry.totalVolumes),
    });
  }

  updateReadVolumesByDelta(entry: MangaLibraryEntry, delta: number): void {
    const readVolumes = this.clampNumber(Number(entry.readVolumes || 0) + delta, 0, this.maxVolumes(entry));
    this.save({
      ...entry,
      readVolumes,
      status: this.statusForReadVolumes(entry.status, readVolumes, entry.totalVolumes),
    });
  }

  updateTotalVolumes(entry: MangaLibraryEntry, event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = Number(input.value);
    const totalVolumes = Number.isFinite(rawValue) ? Math.max(0, Math.floor(rawValue)) : 0;
    const readVolumes = totalVolumes > 0 ? Math.min(entry.readVolumes, totalVolumes) : entry.readVolumes;
    input.value = totalVolumes > 0 ? String(totalVolumes) : '';
    this.save({
      ...entry,
      totalVolumes,
      readVolumes,
      status: this.statusForReadVolumes(entry.status, readVolumes, totalVolumes),
    });
  }

  advanceProgress(entry: MangaLibraryEntry): void {
    if (this.effectiveStatus(entry) === 'COMPLETED') {
      return;
    }

    const readVolumes = this.clampNumber(Number(entry.readVolumes || 0) + 1, 0, this.maxVolumes(entry));
    this.save({
      ...entry,
      status: this.statusForReadVolumes('WATCHING', readVolumes, entry.totalVolumes),
      readVolumes,
    });
  }

  toggleFavorite(entry: MangaLibraryEntry): void {
    this.save({ ...entry, favorite: !entry.favorite });
  }

  remove(entry: MangaLibraryEntry): void {
    if (!this.account) {
      return;
    }

    this.mangaLibraryService.delete(this.account.id, entry.id).subscribe({
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

  displayStatus(entry: MangaLibraryEntry): WatchStatus {
    return this.effectiveStatus(entry);
  }

  statusPillClass(entry: MangaLibraryEntry): string {
    return `status-pill status-pill--${this.displayStatus(entry).toLowerCase()}`;
  }

  mangaRoute(entry: MangaLibraryEntry): string[] {
    return entry.mangaSlug ? ['/manga', entry.mangaSlug] : ['/manga'];
  }

  coverUrl(entry: MangaLibraryEntry): string {
    return entry.coverUrl || this.fallbackCoverUrl;
  }

  entryYear(entry: MangaLibraryEntry): string {
    return entry.catalogYear ? String(entry.catalogYear) : 'Année inconnue';
  }

  entryTypeLabel(entry: MangaLibraryEntry): string {
    return this.typeFilterLabel(this.typeCategory(entry));
  }

  typeBadgeClass(entry: MangaLibraryEntry): string {
    return `type-badge type-badge--${this.typeCategory(entry).toLowerCase().replace('_', '-')}`;
  }

  volumeProgressLabel(entry: MangaLibraryEntry): string {
    const total = entry.totalVolumes > 0 ? entry.totalVolumes : '?';
    return `${entry.readVolumes} / ${total} tomes`;
  }

  shortVolumeProgressLabel(entry: MangaLibraryEntry): string {
    return `${entry.readVolumes} / ${entry.totalVolumes > 0 ? entry.totalVolumes : '?'}`;
  }

  progressPercent(entry: MangaLibraryEntry): number {
    if (!entry.totalVolumes) {
      return 0;
    }

    return Math.min(100, Math.max(0, Math.round((entry.readVolumes / entry.totalVolumes) * 100)));
  }

  catalogScore(entry: MangaLibraryEntry): number | null {
    const score = entry.catalogScore;
    return score === null || score === undefined || !Number.isFinite(Number(score)) ? null : Number(score);
  }

  catalogScoreLabel(entry: MangaLibraryEntry): string {
    const score = this.catalogScore(entry);
    return score === null ? '-' : this.formatScore(score);
  }

  externalUrl(link: ExternalLink): string {
    const cleanQuery = this.query().trim() || 'manga';
    const query = encodeURIComponent(cleanQuery);

    switch (link.id) {
      case 'all':
        return `https://www.google.com/search?q=${query}%20manga`;
      case 'mangaplus':
        return `https://mangaplus.shueisha.co.jp/search_result?keyword=${query}`;
      case 'amazon':
        return `https://www.amazon.fr/s?k=${query}%20manga`;
      case 'fnac':
        return `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${query}%20manga`;
      case 'bookwalker':
        return `https://global.bookwalker.jp/search/?qcat=&word=${query}`;
      case 'izneo':
      default:
        return `https://www.izneo.com/fr/recherche?text=${query}`;
    }
  }

  private matchesSearch(entry: MangaLibraryEntry, query: string): boolean {
    if (!query) {
      return true;
    }

    return this.normalize(
      [
        entry.title,
        this.statusLabel(this.effectiveStatus(entry)),
        this.entryTypeLabel(entry),
        this.entryYear(entry),
        ...this.catalogGenres(entry),
        ...this.catalogAuthors(entry),
      ].join(' '),
    ).includes(query);
  }

  private matchesStatusFilter(entry: MangaLibraryEntry, status: StatusFilter): boolean {
    switch (status) {
      case 'ALL':
        return true;
      case 'FAVORITES':
        return entry.favorite;
      default:
        return this.effectiveStatus(entry) === status;
    }
  }

  private sortEntries(entries: MangaLibraryEntry[], sortMode: SortMode): MangaLibraryEntry[] {
    const sorted = [...entries];

    switch (sortMode) {
      case 'updated-desc':
        return sorted.sort((left, right) => this.timestamp(right.updatedAt) - this.timestamp(left.updatedAt));
      case 'progress-desc':
        return sorted.sort((left, right) => this.progressPercent(right) - this.progressPercent(left) || this.compareTitle(left, right));
      case 'catalog-score-desc':
        return sorted.sort((left, right) => (this.catalogScore(right) ?? -1) - (this.catalogScore(left) ?? -1) || this.compareTitle(left, right));
      case 'title-asc':
      default:
        return sorted.sort((left, right) => this.compareTitle(left, right));
    }
  }

  private typeCategory(entry: MangaLibraryEntry): TypeFilter {
    const type = this.normalize(entry.catalogType || '');
    if (type.includes('light novel')) {
      return 'LIGHT_NOVEL';
    }
    if (type.includes('novel')) {
      return 'NOVEL';
    }
    if (type.includes('manhwa')) {
      return 'MANHWA';
    }
    if (type.includes('manhua')) {
      return 'MANHUA';
    }
    if (type.includes('one shot') || type.includes('one-shot')) {
      return 'ONE_SHOT';
    }
    if (type.includes('doujin')) {
      return 'DOUJINSHI';
    }
    if (type.includes('manga') || !type) {
      return 'MANGA';
    }

    return 'OTHER';
  }

  private typeFilterLabel(type: TypeFilter): string {
    switch (type) {
      case 'ALL':
        return 'Total';
      case 'LIGHT_NOVEL':
        return 'Light Novel';
      case 'NOVEL':
        return 'Novel';
      case 'MANHWA':
        return 'Manhwa';
      case 'MANHUA':
        return 'Manhua';
      case 'ONE_SHOT':
        return 'One-shot';
      case 'DOUJINSHI':
        return 'Doujinshi';
      case 'OTHER':
        return 'Autres';
      case 'MANGA':
      default:
        return 'Manga';
    }
  }

  private catalogGenres(entry: MangaLibraryEntry): string[] {
    return (entry.catalogGenres ?? []).map((genre) => genre.trim()).filter(Boolean);
  }

  private catalogAuthors(entry: MangaLibraryEntry): string[] {
    return (entry.catalogAuthors ?? []).map((author) => author.trim()).filter(Boolean);
  }

  private effectiveStatus(entry: MangaLibraryEntry): WatchStatus {
    if (entry.status !== 'WATCHING') {
      return entry.status;
    }

    const readVolumes = Math.max(0, Number(entry.readVolumes || 0));
    if (readVolumes <= 0) {
      return 'PLANNED';
    }

    return entry.totalVolumes > 0 && readVolumes >= entry.totalVolumes ? 'COMPLETED' : 'WATCHING';
  }

  private save(entry: MangaLibraryEntry): void {
    if (!this.account) {
      return;
    }

    const totalVolumes = Math.max(0, Number(entry.totalVolumes || 0));
    const readVolumes = this.normalizedReadVolumes(entry, totalVolumes);
    const status = this.statusForReadVolumes(entry.status, readVolumes, totalVolumes);

    const request: MangaLibraryEntryRequest = {
      mangaSlug: entry.mangaSlug,
      title: entry.title,
      coverUrl: entry.coverUrl,
      status,
      readChapters: Math.max(0, Number(entry.readChapters || 0)),
      totalChapters: Math.max(0, Number(entry.totalChapters || 0)),
      readVolumes,
      totalVolumes,
      score: entry.score === null || entry.score === undefined ? null : this.clampNumber(Number(entry.score), 0, 10),
      favorite: entry.favorite,
      notes: entry.notes || '',
      catalogType: entry.catalogType ?? null,
      catalogScore: entry.catalogScore ?? null,
      catalogYear: entry.catalogYear ?? null,
      catalogGenres: entry.catalogGenres ?? [],
      catalogAuthors: entry.catalogAuthors ?? [],
    };

    this.mangaLibraryService.save(this.account.id, request).subscribe({
      next: (updated) => {
        this.entries.update((entries) => {
          const exists = entries.some((item) => item.id === updated.id);
          return exists ? entries.map((item) => (item.id === updated.id ? updated : item)) : [updated, ...entries];
        });
        this.feedback.set(this.languageService.t('library.updated', { title: updated.title }));
      },
      error: () => this.feedback.set(this.languageService.t('library.updateError')),
    });
  }

  private normalizedReadVolumes(entry: MangaLibraryEntry, totalVolumes: number): number {
    if (entry.status === 'COMPLETED') {
      return totalVolumes > 0 ? totalVolumes : Math.max(0, Number(entry.readVolumes || 0));
    }

    if (entry.status === 'PLANNED') {
      return 0;
    }

    return this.clampNumber(Number(entry.readVolumes || 0), 0, totalVolumes > 0 ? totalVolumes : UNKNOWN_VOLUME_LIMIT);
  }

  private readVolumesForStatus(entry: MangaLibraryEntry, status: WatchStatus): number {
    if (status === 'COMPLETED') {
      return entry.totalVolumes > 0 ? entry.totalVolumes : Math.max(0, Number(entry.readVolumes || 0));
    }

    if (status === 'PLANNED') {
      return 0;
    }

    return entry.readVolumes;
  }

  private statusForReadVolumes(currentStatus: WatchStatus, readVolumes: number, totalVolumes: number): WatchStatus {
    if (totalVolumes > 0 && readVolumes >= totalVolumes) {
      return 'COMPLETED';
    }

    if (readVolumes <= 0 && currentStatus === 'WATCHING') {
      return 'PLANNED';
    }

    if (readVolumes > 0 && currentStatus === 'PLANNED') {
      return 'WATCHING';
    }

    return currentStatus;
  }

  private maxVolumes(entry: MangaLibraryEntry): number {
    return entry.totalVolumes > 0 ? entry.totalVolumes : UNKNOWN_VOLUME_LIMIT;
  }

  private compareTitle(left: MangaLibraryEntry, right: MangaLibraryEntry): number {
    return left.title.localeCompare(right.title, 'fr', { sensitivity: 'base' });
  }

  private timestamp(value: string | undefined): number {
    const timestamp = new Date(value ?? '').getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private formatScore(score: number | null): string {
    if (score === null || !Number.isFinite(score)) {
      return '-';
    }

    return score.toFixed(1).replace(/\.0$/, '');
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('fr-FR').format(value);
  }

  private clampNumber(value: number, min: number, max: number): number {
    const cleanValue = Number.isFinite(value) ? Math.floor(value) : min;
    return Math.max(min, Math.min(cleanValue, max));
  }

  private normalize(value: string): string {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
