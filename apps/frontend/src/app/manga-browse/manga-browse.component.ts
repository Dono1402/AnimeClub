import { Component, HostListener, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { WatchStatus } from '../models/animetheque.model';
import { MangaCatalogFilterOptions, MangaCatalogFilters, MangaCatalogGenreOption, MangaLibraryEntry, MangaLibraryEntryRequest, PopularManga } from '../models/manga.model';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { MangaCatalogService } from '../services/manga-catalog.service';
import { MangaLibraryService } from '../services/manga-library.service';

const ALL_GENRES_VALUE = 'all';
const ALL_FILTER_VALUE = 'all';
const DEFAULT_CATALOG_YEAR = '2025';
const DEFAULT_SORT_MODE: MangaSortMode = 'popularity-asc';
const PREVIEW_MANGA_COUNT = 15;
const GENRE_LABELS_FR: Record<string, string> = {
  Action: 'Action',
  Adventure: 'Aventure',
  'Avant Garde': 'Avant-garde',
  Comedy: 'Comédie',
  Drama: 'Drame',
  Fantasy: 'Fantastique',
  Gourmet: 'Gastronomie',
  Horror: 'Horreur',
  Mystery: 'Mystère',
  Romance: 'Romance',
  'Sci-Fi': 'Science-fiction',
  'Slice of Life': 'Tranche de vie',
  Sports: 'Sport',
  Supernatural: 'Surnaturel',
  Suspense: 'Suspense',
};

type MangaSortMode = 'popularity-asc' | 'title-asc' | 'title-desc' | 'volumes-desc' | 'score-desc' | 'rank-asc';
type PaginationItem = number | 'ellipsis';
type CatalogFilterChipKey = 'query' | 'genre' | 'type' | 'status' | 'year' | 'score' | 'sort';
type CatalogFilterChip = {
  key: CatalogFilterChipKey;
  label: string;
};
type CatalogFilterMenu = 'sort' | 'type' | 'status' | 'year' | 'score';
type LibrarySaveState = 'idle' | 'saving' | 'saved' | 'error';
type BackgroundTransitionLayer = {
  id: number;
  style: string;
  visible: boolean;
};

@Component({
  selector: 'app-manga-browse',
  standalone: true,
  imports: [MenuBarComponent, RouterLink, TranslatePipe],
  templateUrl: './manga-browse.component.html',
  styleUrl: './manga-browse.component.scss',
})
export class MangaBrowseComponent implements OnInit, OnDestroy {
  private readonly mangaCatalogService = inject(MangaCatalogService);
  private readonly mangaLibraryService = inject(MangaLibraryService);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly requestedSortMode = this.route.snapshot.queryParamMap.get('sort') ?? '';
  private readonly defaultCatalogBackgroundUrl = 'assets/anime-catalog/anime-page-bg.png';
  private searchDebounceId: ReturnType<typeof setTimeout> | null = null;
  private searchRequestId = 0;
  private backgroundFadeTimeoutIds: ReturnType<typeof setTimeout>[] = [];
  private backgroundFadeFrameIds: number[] = [];
  private previewRailFrameIds: number[] = [];
  private readonly fallbackNeonPalette = [
    '104, 218, 255',
    '143, 123, 255',
    '102, 232, 178',
    '255, 209, 102',
    '255, 135, 96',
    '244, 119, 216',
    '126, 238, 245',
  ];
  private readonly backgroundFadeDurationMs = 560;
  private committedBackgroundStyle = this.backgroundStyleForUrl(this.defaultCatalogBackgroundUrl);
  private targetBackgroundStyle = this.committedBackgroundStyle;
  private backgroundTransitionLayerId = 0;

  readonly allGenresValue = ALL_GENRES_VALUE;
  readonly allFilterValue = ALL_FILTER_VALUE;
  readonly minScoreFilterOptions = [
    { value: '7', label: 'Score 7+' },
    { value: '8', label: 'Score 8+' },
    { value: '9', label: 'Score 9+' },
  ];
  readonly sortOptions: { value: MangaSortMode; labelKey: string }[] = [
    { value: 'popularity-asc', labelKey: 'manga.sortPopularityAsc' },
    { value: 'title-asc', labelKey: 'manga.sortTitleAsc' },
    { value: 'title-desc', labelKey: 'manga.sortTitleDesc' },
    { value: 'rank-asc', labelKey: 'manga.sortRankAsc' },
    { value: 'score-desc', labelKey: 'manga.sortScoreDesc' },
    { value: 'volumes-desc', labelKey: 'manga.sortVolumesDesc' },
  ];

  readonly mangas = signal<PopularManga[]>([]);
  readonly account = this.authService.currentAccount();
  readonly libraryEntries = signal<MangaLibraryEntry[]>([]);
  readonly librarySaveStates = signal<Record<string, LibrarySaveState>>({});
  readonly libraryFeedback = signal('');
  readonly filterOptions = signal<MangaCatalogFilterOptions | null>(null);
  readonly previewedManga = signal<PopularManga | null>(null);
  readonly query = signal('');
  readonly selectedGenre = signal(ALL_GENRES_VALUE);
  readonly selectedType = signal(ALL_FILTER_VALUE);
  readonly selectedStatus = signal(ALL_FILTER_VALUE);
  readonly selectedYear = signal(ALL_FILTER_VALUE);
  readonly defaultYearFilterActive = signal(false);
  readonly selectedMinScore = signal(ALL_FILTER_VALUE);
  readonly sortMode = signal<MangaSortMode>(DEFAULT_SORT_MODE);
  readonly openFilterMenu = signal<CatalogFilterMenu | null>(null);
  readonly advancedFiltersOpen = signal(false);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(9);
  readonly totalItems = signal(0);
  readonly catalogTotalItems = signal(0);
  readonly hasNextPage = signal(true);
  readonly backgroundBaseStyle = signal(this.committedBackgroundStyle);
  readonly backgroundTransitionLayers = signal<BackgroundTransitionLayer[]>([]);
  readonly mangaNeonColors = signal<Record<string, string>>({});
  readonly previewDisplayLimit = PREVIEW_MANGA_COUNT;
  readonly previewRailActive = signal(false);
  readonly previewMode = computed(() => this.isPreviewState(this.query().trim()));

  readonly filteredMangas = computed(() => this.sortMangaList(this.mangas(), this.sortMode()));
  readonly displayedMangas = computed(() => {
    const list = this.filteredMangas();
    if (!this.previewMode()) {
      return list;
    }

    const previewItems = list.slice(0, PREVIEW_MANGA_COUNT);
    return [...previewItems, ...previewItems];
  });

  readonly activeFilterChips = computed<CatalogFilterChip[]>(() => {
    const chips: CatalogFilterChip[] = [];
    const query = this.query().trim();
    const genre = this.selectedGenre();
    const type = this.selectedType();
    const status = this.selectedStatus();
    const year = this.selectedYear();
    const minScore = this.selectedMinScore();
    const sortMode = this.sortMode();

    if (query) {
      chips.push({ key: 'query', label: `Recherche: ${query}` });
    }
    if (genre !== ALL_GENRES_VALUE) {
      chips.push({ key: 'genre', label: this.selectedGenreLabel() });
    }
    if (type !== ALL_FILTER_VALUE) {
      chips.push({ key: 'type', label: this.formatDisplayType(type) });
    }
    if (status !== ALL_FILTER_VALUE) {
      chips.push({ key: 'status', label: this.statusDisplay(status) });
    }
    if (year !== ALL_FILTER_VALUE && (!this.defaultYearFilterActive() || year !== DEFAULT_CATALOG_YEAR)) {
      chips.push({ key: 'year', label: year });
    }
    if (minScore !== ALL_FILTER_VALUE) {
      chips.push({ key: 'score', label: `Score ${minScore}+` });
    }
    if (sortMode !== DEFAULT_SORT_MODE) {
      chips.push({ key: 'sort', label: this.formatSortModeLabel(sortMode) });
    }

    return chips;
  });

  readonly availableGenres = computed(() => this.filterOptions()?.genres ?? []);
  readonly availableTypes = computed(() =>
    (this.filterOptions()?.types ?? this.mangas().map((manga) => manga.type))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, this.languageService.language(), { sensitivity: 'base' })),
  );
  readonly availableStatuses = computed(() =>
    (this.filterOptions()?.statuses ?? this.mangas().map((manga) => manga.status))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, this.languageService.language(), { sensitivity: 'base' })),
  );
  readonly availableYears = computed(() =>
    Array.from(
      new Set([
        DEFAULT_CATALOG_YEAR,
        ...(this.filterOptions()?.years.map((year) => String(year)) ?? this.mangas().map((manga) => this.formatCardYear(manga))),
      ]),
    )
      .filter((year) => /^\d{4}$/.test(year))
      .sort((left, right) => Number(right) - Number(left)),
  );
  readonly totalPages = computed(() => {
    if (this.totalItems() <= 0 || this.pageSize() <= 0) {
      return this.hasNextPage() ? this.page() + 1 : this.page();
    }

    return Math.max(1, Math.ceil(this.totalItems() / this.pageSize()));
  });
  readonly paginationItems = computed<PaginationItem[]>(() => this.buildPaginationItems(this.page(), this.totalPages()));

  readonly selectedBackgroundUrl = computed(() => this.previewedManga()?.imageUrl || this.defaultCatalogBackgroundUrl);
  readonly backgroundStyle = computed(() => this.backgroundStyleForUrl(this.selectedBackgroundUrl()));

  constructor() {
    effect(() => {
      this.fadeToBackground(this.backgroundStyle());
    });
  }

  @HostListener('document:click')
  closeFilterMenus(): void {
    this.openFilterMenu.set(null);
  }

  @HostListener('document:keydown.escape')
  closeFilterMenusOnEscape(): void {
    this.closeFilterMenus();
  }

  ngOnInit(): void {
    const requestedQuery = this.route.snapshot.queryParamMap.get('q')?.trim() ?? '';
    this.selectedYear.set(ALL_FILTER_VALUE);
    this.defaultYearFilterActive.set(false);
    this.sortMode.set(DEFAULT_SORT_MODE);
    this.query.set(requestedQuery);

    if (this.isMangaSortMode(this.requestedSortMode)) {
      this.sortMode.set(this.requestedSortMode);
    }

    this.loadLibraryEntries();
    this.loadFilterOptions();
    this.loadCatalogTotal();
    this.loadCurrentPage(1, requestedQuery);
  }

  ngOnDestroy(): void {
    this.cancelPendingSearch();
    this.cancelPendingBackgroundFade();
    this.cancelPreviewRailAnimationFrames();
  }

  setQuery(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.query.set(query);
    if (query.trim()) {
      this.selectedYear.set(ALL_FILTER_VALUE);
    } else if (this.defaultYearFilterActive()) {
      this.selectedYear.set(ALL_FILTER_VALUE);
    }
    this.scheduleSearch();
  }

  setGenre(genre: string): void {
    const selectedGenre = genre || ALL_GENRES_VALUE;
    this.selectedGenre.set(selectedGenre);
    if (this.defaultYearFilterActive()) {
      this.selectedYear.set(ALL_FILTER_VALUE);
    }
    this.loadCurrentPage(1);
  }

  setType(type: string): void {
    this.selectedType.set(type || ALL_FILTER_VALUE);
    this.loadCurrentPage(1);
  }

  setStatus(status: string): void {
    this.selectedStatus.set(status || ALL_FILTER_VALUE);
    this.loadCurrentPage(1);
  }

  setYear(year: string): void {
    this.defaultYearFilterActive.set(false);
    this.selectedYear.set(year || ALL_FILTER_VALUE);
    this.loadCurrentPage(1);
  }

  setMinScore(score: string): void {
    this.selectedMinScore.set(score || ALL_FILTER_VALUE);
    this.loadCurrentPage(1);
  }

  toggleFilterMenu(menu: CatalogFilterMenu, event: Event): void {
    event.stopPropagation();
    this.openFilterMenu.update((currentMenu) => currentMenu === menu ? null : menu);
  }

  selectSortMode(sortMode: MangaSortMode, event: Event): void {
    event.stopPropagation();
    this.closeFilterMenus();
    this.setSortMode(sortMode);
  }

  selectType(type: string, event: Event): void {
    event.stopPropagation();
    this.closeFilterMenus();
    this.setType(type);
  }

  selectStatus(status: string, event: Event): void {
    event.stopPropagation();
    this.closeFilterMenus();
    this.setStatus(status);
  }

  selectYear(year: string, event: Event): void {
    event.stopPropagation();
    this.closeFilterMenus();
    this.setYear(year);
  }

  selectMinScore(score: string, event: Event): void {
    event.stopPropagation();
    this.closeFilterMenus();
    this.setMinScore(score);
  }

  toggleAdvancedFilters(): void {
    this.closeFilterMenus();
    this.advancedFiltersOpen.update((isOpen) => !isOpen);
  }

  setSortMode(sortMode: MangaSortMode): void {
    this.sortMode.set(sortMode);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: sortMode === DEFAULT_SORT_MODE ? null : sortMode },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.loadCurrentPage(1);
  }

  clearAllFilters(): void {
    this.query.set('');
    this.selectedGenre.set(ALL_GENRES_VALUE);
    this.selectedType.set(ALL_FILTER_VALUE);
    this.selectedStatus.set(ALL_FILTER_VALUE);
    this.defaultYearFilterActive.set(false);
    this.selectedYear.set(ALL_FILTER_VALUE);
    this.selectedMinScore.set(ALL_FILTER_VALUE);
    this.sortMode.set(DEFAULT_SORT_MODE);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: null, sort: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.loadCurrentPage(1);
  }

  removeFilterChip(key: CatalogFilterChipKey): void {
    switch (key) {
      case 'query':
        this.query.set('');
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { q: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        if (this.defaultYearFilterActive()) {
          this.selectedYear.set(ALL_FILTER_VALUE);
        }
        this.loadCurrentPage(1, '');
        return;
      case 'genre':
        this.setGenre(ALL_GENRES_VALUE);
        return;
      case 'type':
        this.setType(ALL_FILTER_VALUE);
        return;
      case 'status':
        this.setStatus(ALL_FILTER_VALUE);
        return;
      case 'year':
        this.setYear(ALL_FILTER_VALUE);
        return;
      case 'score':
        this.setMinScore(ALL_FILTER_VALUE);
        return;
      case 'sort':
        this.setSortMode(DEFAULT_SORT_MODE);
        return;
    }
  }

  previewManga(manga: PopularManga): void {
    this.prepareMangaNeonColor(manga);
    this.previewedManga.set(manga);
  }

  clearPreviewManga(manga: PopularManga): void {
    if (this.previewedManga()?.slug === manga.slug) {
      this.previewedManga.set(null);
    }
  }

  mangaRoute(manga: PopularManga): string[] {
    return ['/manga', manga.slug];
  }

  neonRgbForManga(manga: PopularManga): string {
    return this.mangaNeonColors()[manga.slug] ?? this.fallbackNeonRgbForManga(manga);
  }

  prepareMangaNeonColor(manga: PopularManga): void {
    if (!this.mangaNeonColors()[manga.slug]) {
      this.setMangaNeonColor(manga.slug, this.fallbackNeonRgbForManga(manga));
    }
  }

  goToPage(page: number): void {
    if (this.previewMode()) {
      return;
    }

    const targetPage = Math.max(1, Math.min(page, this.totalPages()));
    if (this.loading() || targetPage === this.page()) {
      return;
    }

    this.loadPage(targetPage, this.query().trim());
  }

  previousPage(): void {
    this.goToPage(this.page() - 1);
  }

  nextPage(): void {
    this.goToPage(this.page() + 1);
  }

  addToMangatheque(manga: PopularManga, event: Event): void {
    event.stopPropagation();
    if (!this.account) {
      void this.router.navigate(['/login']);
      return;
    }

    this.setLibrarySaveState(manga.slug, 'saving');
    this.libraryFeedback.set('');

    this.mangaLibraryService.save(this.account.id, this.toMangaLibraryRequest(manga)).subscribe({
      next: (updated) => {
        this.libraryEntries.update((entries) => {
          const exists = entries.some((entry) => entry.id === updated.id || entry.mangaSlug === updated.mangaSlug);
          return exists
            ? entries.map((entry) => (entry.id === updated.id || entry.mangaSlug === updated.mangaSlug ? updated : entry))
            : [updated, ...entries];
        });
        this.setLibrarySaveState(manga.slug, 'saved');
        this.libraryFeedback.set(`${updated.title} ajouté à ta Mangathèque.`);
      },
      error: () => {
        this.setLibrarySaveState(manga.slug, 'error');
        this.libraryFeedback.set('Ajout à la Mangathèque impossible.');
      },
    });
  }

  librarySaveState(manga: PopularManga): LibrarySaveState {
    return this.librarySaveStates()[manga.slug] ?? 'idle';
  }

  isInLibrary(manga: PopularManga): boolean {
    return this.libraryEntries().some((entry) => entry.mangaSlug === manga.slug);
  }

  libraryButtonLabel(manga: PopularManga): string {
    const state = this.librarySaveState(manga);
    if (state === 'saving') {
      return 'Ajout...';
    }

    if (state === 'saved' || this.isInLibrary(manga)) {
      return 'Dans ma Mangathèque';
    }

    return 'Ajouter à ma Mangathèque';
  }

  isRankingView(): boolean {
    return this.sortMode() === 'rank-asc';
  }

  hasCardScore(manga: PopularManga): boolean {
    return manga.score !== null && Number.isFinite(manga.score);
  }

  formatCardScore(score: number | null): string {
    return score === null ? '' : score.toFixed(2).replace(/\.00$/, '');
  }

  missingScoreLabel(): string {
    return 'N/A';
  }

  formatCardType(manga: PopularManga): string {
    switch (this.normalize(manga.type)) {
      case 'light novel':
        return 'LN';
      case 'one-shot':
      case 'oneshot':
        return 'ONE-SHOT';
      case 'doujinshi':
        return 'DOUJIN';
      default:
        return manga.type || 'MANGA';
    }
  }

  formatDisplayType(type: string): string {
    switch (this.normalize(type)) {
      case 'light novel':
      case 'lightnovel':
        return 'Light Novel';
      case 'one-shot':
      case 'oneshot':
        return 'One-shot';
      default:
        return type || 'Tous';
    }
  }

  statusDisplay(status: string): string {
    switch (this.normalize(status)) {
      case 'publishing':
        return 'En cours';
      case 'finished':
      case 'complete':
        return 'Terminé';
      case 'on hiatus':
        return 'En pause';
      case 'discontinued':
        return 'Arrêté';
      case 'not yet published':
        return 'À venir';
      default:
        return status || 'Statut inconnu';
    }
  }

  formatCardYear(manga: PopularManga): string {
    const match = /\b(19|20)\d{2}\b/.exec(manga.published);
    return match?.[0] ?? 'N/A';
  }

  formatMangaFacts(manga: PopularManga): string {
    return manga.volumes > 0 ? `${manga.volumes} tomes` : 'Tomes inconnus';
  }

  formatRankingGenres(manga: PopularManga): string {
    return manga.genres.slice(0, 4).map((genre) => this.formatGenreName(genre)).join(' | ');
  }

  rankingLabel(manga: PopularManga, index: number): string {
    const rank = manga.rank ?? (this.page() - 1) * this.pageSize() + index + 1;
    return `#${rank.toLocaleString('fr-FR')}`;
  }

  formatGenreLabel(genre: MangaCatalogGenreOption): string {
    return this.formatGenreName(genre.name);
  }

  sortModeLabel(sortMode = this.sortMode()): string {
    const option = this.sortOptions.find((currentOption) => currentOption.value === sortMode) ?? this.sortOptions[0];
    return this.languageService.t(option.labelKey);
  }

  typeFilterLabel(type = this.selectedType()): string {
    return type === ALL_FILTER_VALUE ? 'Tous' : this.formatDisplayType(type);
  }

  statusFilterLabel(status = this.selectedStatus()): string {
    return status === ALL_FILTER_VALUE ? 'Tous' : this.statusDisplay(status);
  }

  yearFilterLabel(year = this.selectedYear()): string {
    return year === ALL_FILTER_VALUE ? 'Toutes' : year;
  }

  minScoreFilterLabel(score = this.selectedMinScore()): string {
    if (score === ALL_FILTER_VALUE) {
      return 'Tous';
    }

    return this.minScoreFilterOptions.find((option) => option.value === score)?.label ?? score;
  }

  private selectedGenreLabel(): string {
    const genre = this.availableGenres().find((option) => String(option.id) === this.selectedGenre());
    return genre ? this.formatGenreLabel(genre) : '';
  }

  private formatGenreName(genre: string): string {
    if (this.languageService.language() !== 'fr') {
      return genre;
    }

    return GENRE_LABELS_FR[genre] ?? genre;
  }

  private loadCurrentPage(page: number, query = this.query().trim()): void {
    if (page === 1 && this.isPreviewState(query)) {
      this.loadPreview();
      return;
    }

    this.loadPage(page, query);
  }

  private loadPreview(): void {
    this.cancelPendingSearch();
    const requestId = ++this.searchRequestId;
    this.restartPreviewRailAnimation(false);
    this.loading.set(true);
    this.errorMessage.set('');

    this.mangaCatalogService.getPreviewManga(PREVIEW_MANGA_COUNT).subscribe({
      next: (result) => {
        if (requestId !== this.searchRequestId) {
          return;
        }

        const previewItems = result.items.slice(0, PREVIEW_MANGA_COUNT);
        this.mangas.set(previewItems);
        this.page.set(1);
        this.pageSize.set(PREVIEW_MANGA_COUNT);
        this.totalItems.set(previewItems.length);
        this.hasNextPage.set(false);
        this.loading.set(false);
        this.restartPreviewRailAnimation(true);
      },
      error: () => {
        if (requestId !== this.searchRequestId) {
          return;
        }

        this.errorMessage.set('Impossible de charger les mangas.');
        this.loading.set(false);
      },
    });
  }

  private loadPage(page: number, query = this.query().trim()): void {
    this.cancelPendingSearch();
    const requestId = ++this.searchRequestId;
    const filters = this.catalogFilters(query);

    this.restartPreviewRailAnimation(false);
    this.loading.set(true);
    this.errorMessage.set('');

    const request = query
      ? this.mangaCatalogService.searchManga(query, page, this.sortMode(), filters)
      : this.mangaCatalogService.getPopularManga(page, this.sortMode(), filters);

    request.subscribe({
      next: (result) => {
        if (requestId !== this.searchRequestId) {
          return;
        }

        this.mangas.set(result.items);
        this.page.set(result.page || page);
        this.pageSize.set(result.pageSize || 9);
        this.totalItems.set(result.totalItems || result.items.length);
        this.hasNextPage.set(result.hasNextPage);
        this.loading.set(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: () => {
        if (requestId !== this.searchRequestId) {
          return;
        }

        this.errorMessage.set('Impossible de charger les mangas.');
        this.loading.set(false);
      },
    });
  }

  private loadFilterOptions(): void {
    this.mangaCatalogService.getFilterOptions().subscribe({
      next: (options) => this.filterOptions.set(options),
      error: () => this.filterOptions.set({ genres: [], types: [], statuses: [], years: [] }),
    });
  }

  private loadLibraryEntries(): void {
    if (!this.account) {
      this.libraryEntries.set([]);
      return;
    }

    this.mangaLibraryService.list(this.account.id).subscribe({
      next: (entries) => this.libraryEntries.set(entries),
      error: () => this.libraryEntries.set([]),
    });
  }

  private setLibrarySaveState(slug: string, state: LibrarySaveState): void {
    this.librarySaveStates.update((states) => ({ ...states, [slug]: state }));
  }

  private toMangaLibraryRequest(manga: PopularManga): MangaLibraryEntryRequest {
    return {
      mangaSlug: manga.slug,
      title: manga.title,
      coverUrl: manga.imageUrl,
      status: 'PLANNED' as WatchStatus,
      readChapters: 0,
      totalChapters: Math.max(0, Number(manga.chapters || 0)),
      readVolumes: 0,
      totalVolumes: Math.max(0, Number(manga.volumes || 0)),
      score: null,
      favorite: false,
      notes: '',
      catalogType: manga.type || null,
      catalogScore: manga.score ?? null,
      catalogYear: this.catalogYear(manga),
      catalogGenres: manga.genres,
      catalogAuthors: manga.authors,
    };
  }

  private catalogYear(manga: PopularManga): number | null {
    const match = /\b(19|20)\d{2}\b/.exec(manga.published);
    return match ? Number(match[0]) : null;
  }

  private loadCatalogTotal(): void {
    this.mangaCatalogService.getMangaCatalogTotal().subscribe({
      next: (total) => this.catalogTotalItems.set(total),
      error: () => this.catalogTotalItems.set(0),
    });
  }

  private scheduleSearch(): void {
    this.cancelPendingSearch();
    this.searchDebounceId = setTimeout(() => {
      this.searchDebounceId = null;
      this.loadCurrentPage(1, this.query().trim());
    }, 350);
  }

  private cancelPendingSearch(): void {
    if (this.searchDebounceId !== null) {
      clearTimeout(this.searchDebounceId);
      this.searchDebounceId = null;
    }
  }

  private catalogFilters(query = this.query().trim()): MangaCatalogFilters {
    const ignoreDateFilters = query.trim().length > 0;

    return {
      genre: this.selectedGenre() !== ALL_GENRES_VALUE ? this.selectedGenre() : undefined,
      type: this.selectedType() !== ALL_FILTER_VALUE ? this.selectedType() : undefined,
      status: this.selectedStatus() !== ALL_FILTER_VALUE ? this.selectedStatus() : undefined,
      year: ignoreDateFilters || this.selectedYear() === ALL_FILTER_VALUE ? undefined : this.selectedYear(),
      minScore: this.selectedMinScore() !== ALL_FILTER_VALUE ? this.selectedMinScore() : undefined,
    };
  }

  private isPreviewState(query = this.query().trim()): boolean {
    return (
      query.trim().length === 0 &&
      this.selectedGenre() === ALL_GENRES_VALUE &&
      this.selectedType() === ALL_FILTER_VALUE &&
      this.selectedStatus() === ALL_FILTER_VALUE &&
      this.selectedYear() === ALL_FILTER_VALUE &&
      this.selectedMinScore() === ALL_FILTER_VALUE &&
      this.sortMode() === DEFAULT_SORT_MODE
    );
  }

  private restartPreviewRailAnimation(enabled: boolean): void {
    this.cancelPreviewRailAnimationFrames();
    this.previewRailActive.set(false);
    if (!enabled) {
      return;
    }

    const firstFrameId = window.requestAnimationFrame(() => {
      this.previewRailFrameIds = this.previewRailFrameIds.filter((id) => id !== firstFrameId);

      const secondFrameId = window.requestAnimationFrame(() => {
        this.previewRailFrameIds = this.previewRailFrameIds.filter((id) => id !== secondFrameId);
        if (this.previewMode() && this.mangas().length > 0) {
          this.previewRailActive.set(true);
        }
      });

      this.previewRailFrameIds.push(secondFrameId);
    });

    this.previewRailFrameIds.push(firstFrameId);
  }

  private cancelPreviewRailAnimationFrames(): void {
    if (this.previewRailFrameIds.length === 0) {
      return;
    }

    for (const frameId of this.previewRailFrameIds) {
      window.cancelAnimationFrame(frameId);
    }
    this.previewRailFrameIds = [];
  }

  private sortMangaList(list: PopularManga[], sortMode: MangaSortMode): PopularManga[] {
    return [...list].sort((left, right) => {
      switch (sortMode) {
        case 'title-desc':
          return this.compareMangaTitle(right, left);
        case 'rank-asc':
          return (left.rank ?? 999999) - (right.rank ?? 999999) || this.compareMangaTitle(left, right);
        case 'popularity-asc':
          return (left.popularity ?? 999999) - (right.popularity ?? 999999) || this.compareMangaTitle(left, right);
        case 'score-desc':
          return (right.score ?? -1) - (left.score ?? -1) || this.compareMangaTitle(left, right);
        case 'volumes-desc':
          return right.volumes - left.volumes || this.compareMangaTitle(left, right);
        case 'title-asc':
        default:
          return this.compareMangaTitle(left, right);
      }
    });
  }

  private compareMangaTitle(left: PopularManga, right: PopularManga): number {
    return left.title.localeCompare(right.title, 'fr', { sensitivity: 'base' });
  }

  private isMangaSortMode(value: string): value is MangaSortMode {
    return ['popularity-asc', 'title-asc', 'title-desc', 'volumes-desc', 'score-desc', 'rank-asc'].includes(value);
  }

  private formatSortModeLabel(sortMode: MangaSortMode): string {
    const option = this.sortOptions.find((currentOption) => currentOption.value === sortMode);
    return option ? this.languageService.t(option.labelKey) : '';
  }

  private buildPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    if (currentPage <= 3) {
      pages.add(2);
      pages.add(3);
      pages.add(4);
    }
    if (currentPage >= totalPages - 2) {
      pages.add(totalPages - 3);
      pages.add(totalPages - 2);
      pages.add(totalPages - 1);
    }

    const orderedPages = [...pages]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((left, right) => left - right);

    const items: PaginationItem[] = [];
    for (const page of orderedPages) {
      const previous = items[items.length - 1];
      if (typeof previous === 'number' && page - previous > 1) {
        items.push('ellipsis');
      }
      items.push(page);
    }

    return items;
  }

  private setMangaNeonColor(slug: string, rgb: string): void {
    this.mangaNeonColors.update((colors) => ({ ...colors, [slug]: rgb }));
  }

  private fallbackNeonRgbForManga(manga: PopularManga): string {
    const key = manga.slug || manga.title;
    const hash = Array.from(key).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
    return this.fallbackNeonPalette[hash % this.fallbackNeonPalette.length];
  }

  private backgroundStyleForUrl(url: string): string {
    if (!url) {
      return 'linear-gradient(135deg, #171717, #2a1d1d)';
    }

    if (url === this.defaultCatalogBackgroundUrl) {
      return `linear-gradient(180deg, rgba(3, 8, 12, 0), rgba(3, 8, 12, 0.08) 46%, rgba(3, 8, 12, 0.64)), linear-gradient(90deg, rgba(3, 8, 12, 0.2), rgba(3, 8, 12, 0) 52%, rgba(3, 8, 12, 0.03)), url("${url}")`;
    }

    return `linear-gradient(90deg, rgba(12, 12, 12, 0.95), rgba(12, 12, 12, 0.6), rgba(12, 12, 12, 0.88)), url("${url}")`;
  }

  private fadeToBackground(targetStyle: string): void {
    if (targetStyle === this.targetBackgroundStyle) {
      return;
    }

    this.cancelPendingBackgroundFrames();

    this.targetBackgroundStyle = targetStyle;
    const nextLayer = targetStyle === this.committedBackgroundStyle
      ? null
      : {
          id: ++this.backgroundTransitionLayerId,
          style: targetStyle,
          visible: false,
        };

    this.backgroundTransitionLayers.update((layers) => [
      ...layers.map((layer) => ({ ...layer, visible: false })),
      ...(nextLayer ? [nextLayer] : []),
    ]);

    if (nextLayer) {
      this.queueBackgroundFrame(() => {
        if (this.targetBackgroundStyle !== targetStyle) {
          return;
        }

        this.backgroundTransitionLayers.update((layers) =>
          layers.map((layer) => (layer.id === nextLayer.id ? { ...layer, visible: true } : layer)),
        );
      });
    }

    this.queueBackgroundCleanup(targetStyle, nextLayer?.id);
  }

  private queueBackgroundFrame(callback: () => void): void {
    const frameId = window.requestAnimationFrame(() => {
      this.backgroundFadeFrameIds = this.backgroundFadeFrameIds.filter((id) => id !== frameId);
      callback();
    });

    this.backgroundFadeFrameIds.push(frameId);
  }

  private queueBackgroundCleanup(targetStyle: string, layerId?: number): void {
    const timeoutId = setTimeout(() => {
      this.backgroundFadeTimeoutIds = this.backgroundFadeTimeoutIds.filter((id) => id !== timeoutId);

      if (this.targetBackgroundStyle === targetStyle) {
        this.committedBackgroundStyle = targetStyle;
        this.backgroundBaseStyle.set(targetStyle);
        this.backgroundTransitionLayers.set([]);
        return;
      }

      if (layerId !== undefined) {
        this.removeBackgroundLayer(layerId);
      }
    }, this.backgroundFadeDurationMs + 120);

    this.backgroundFadeTimeoutIds.push(timeoutId);
  }

  private removeBackgroundLayer(layerId: number): void {
    this.backgroundTransitionLayers.update((layers) => layers.filter((layer) => layer.id !== layerId));
  }

  private cancelPendingBackgroundFrames(): void {
    if (this.backgroundFadeFrameIds.length > 0) {
      for (const frameId of this.backgroundFadeFrameIds) {
        window.cancelAnimationFrame(frameId);
      }

      this.backgroundFadeFrameIds = [];
    }
  }

  private cancelPendingBackgroundFade(): void {
    this.cancelPendingBackgroundFrames();

    if (this.backgroundFadeTimeoutIds.length > 0) {
      for (const timeoutId of this.backgroundFadeTimeoutIds) {
        clearTimeout(timeoutId);
      }

      this.backgroundFadeTimeoutIds = [];
    }
  }

  private normalize(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
