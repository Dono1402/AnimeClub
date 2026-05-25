import { Component, HostListener, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { catchError, concatMap, from, map, of } from 'rxjs';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { AnimeCatalogFilterOptions, AnimeCatalogFilters, AnimeEpisodeOption, PopularAnime, PopularAnimeSeason } from '../models/anime.model';
import { AnimethequeEntry, AnimethequeEntryRequest, WatchStatus } from '../models/animetheque.model';
import { AnimeCatalogService } from '../services/anime-catalog.service';
import { AnimethequeService } from '../services/animetheque.service';
import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { MarketingAnalyticsService } from '../services/marketing-analytics.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { animeTypeLabel, isMovieAnime, isMovieType } from '../utils/anime-format.util';

const UNKNOWN_EPISODE_LIMIT = 9999;
const ALL_GENRES_VALUE = 'all';
const ALL_FILTER_VALUE = 'all';
const DEFAULT_CATALOG_YEAR = '2025';
const DEFAULT_SORT_MODE: AnimeSortMode = 'popularity-asc';
const PREVIEW_ANIME_COUNT = 15;
const GENRE_LABELS_FR: Record<string, string> = {
  Action: 'Action',
  Adventure: 'Aventure',
  'Avant Garde': 'Avant-garde',
  Comedy: 'Comédie',
  Drama: 'Drame',
  Fantasy: 'Fantastique',
  Gourmet: 'Gastronomie',
  Mystery: 'Mystère',
  Romance: 'Romance',
  'Sci-Fi': 'Science-fiction',
  'Slice of Life': 'Tranche de vie',
  Sports: 'Sport',
  Supernatural: 'Surnaturel',
};
type AnimeSortMode = 'popularity-asc' | 'title-asc' | 'title-desc' | 'episodes-desc' | 'score-desc' | 'rank-asc';
type PaginationItem = number | 'ellipsis';
type CatalogFilterChipKey = 'query' | 'genre' | 'type' | 'status' | 'year' | 'season' | 'score' | 'sort';
type CatalogFilterChip = {
  key: CatalogFilterChipKey;
  label: string;
};
type CatalogFilterMenu = 'sort' | 'type' | 'status' | 'year' | 'season' | 'score';
type BackgroundTransitionLayer = {
  id: number;
  style: string;
  visible: boolean;
};

@Component({
  selector: 'app-anime-browse',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MenuBarComponent,
    TranslatePipe,
  ],
  templateUrl: './anime-browse.component.html',
  styleUrl: './anime-browse.component.scss',
})
export class AnimeBrowseComponent implements OnInit, OnDestroy {
  private readonly animeCatalogService = inject(AnimeCatalogService);
  private readonly animethequeService = inject(AnimethequeService);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly analytics = inject(MarketingAnalyticsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly requestedSelection = this.route.snapshot.queryParamMap.get('selection') ?? '';
  private readonly requestedSortMode = this.route.snapshot.queryParamMap.get('sort') ?? '';
  private readonly defaultCatalogBackgroundUrl = 'assets/anime-catalog/anime-page-bg.png';
  private episodeTitleTranslationRequestId = 0;
  private lastTrackedSearchQuery = '';
  private searchDebounceId: ReturnType<typeof setTimeout> | null = null;
  private suggestionDebounceId: ReturnType<typeof setTimeout> | null = null;
  private searchRequestId = 0;
  private suggestionRequestId = 0;
  private backgroundFadeTimeoutIds: ReturnType<typeof setTimeout>[] = [];
  private backgroundFadeFrameIds: number[] = [];
  private previewRailFrameIds: number[] = [];
  private readonly neonColorRequests = new Set<string>();
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

  readonly account = toSignal(this.authService.account$, {
    initialValue: this.authService.currentAccount(),
  });

  readonly statusOptions: { value: WatchStatus; labelKey: string }[] = [
    { value: 'WATCHING', labelKey: 'status.WATCHING' },
    { value: 'PLANNED', labelKey: 'status.PLANNED' },
    { value: 'COMPLETED', labelKey: 'status.COMPLETED' },
    { value: 'PAUSED', labelKey: 'status.PAUSED' },
    { value: 'DROPPED', labelKey: 'status.DROPPED' },
  ];
  readonly allGenresValue = ALL_GENRES_VALUE;
  readonly allFilterValue = ALL_FILTER_VALUE;
  readonly seasonFilterOptions = [
    { value: 'spring', label: 'Printemps' },
    { value: 'summer', label: 'Ete' },
    { value: 'fall', label: 'Automne' },
    { value: 'winter', label: 'Hiver' },
  ];
  readonly minScoreFilterOptions = [
    { value: '7', label: 'Score 7+' },
    { value: '8', label: 'Score 8+' },
    { value: '9', label: 'Score 9+' },
  ];
  readonly sortOptions: { value: AnimeSortMode; labelKey: string }[] = [
    { value: 'popularity-asc', labelKey: 'anime.sortPopularityAsc' },
    { value: 'title-asc', labelKey: 'anime.sortTitleAsc' },
    { value: 'title-desc', labelKey: 'anime.sortTitleDesc' },
    { value: 'rank-asc', labelKey: 'anime.sortRankAsc' },
    { value: 'score-desc', labelKey: 'anime.sortScoreDesc' },
    { value: 'episodes-desc', labelKey: 'anime.sortEpisodesDesc' },
  ];

  readonly animes = signal<PopularAnime[]>([]);
  readonly filterOptions = signal<AnimeCatalogFilterOptions | null>(null);
  readonly selected = signal<PopularAnime | null>(null);
  readonly previewedAnime = signal<PopularAnime | null>(null);
  readonly query = signal('');
  readonly searchSuggestions = signal<PopularAnime[]>([]);
  readonly searchSuggestionsOpen = signal(false);
  readonly suggestionsLoading = signal(false);
  readonly selectedGenre = signal(ALL_GENRES_VALUE);
  readonly selectedType = signal(ALL_FILTER_VALUE);
  readonly selectedStatus = signal(ALL_FILTER_VALUE);
  readonly selectedYear = signal(ALL_FILTER_VALUE);
  readonly defaultYearFilterActive = signal(false);
  readonly selectedSeason = signal(ALL_FILTER_VALUE);
  readonly selectedMinScore = signal(ALL_FILTER_VALUE);
  readonly sortMode = signal<AnimeSortMode>(DEFAULT_SORT_MODE);
  readonly openFilterMenu = signal<CatalogFilterMenu | null>(null);
  readonly advancedFiltersOpen = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly feedback = signal('');
  readonly errorMessage = signal('');
  readonly translatedSynopsis = signal('');
  readonly translatingSynopsis = signal(false);
  readonly page = signal(1);
  readonly pageSize = signal(9);
  readonly totalItems = signal(0);
  readonly catalogTotalItems = signal(0);
  readonly hasNextPage = signal(true);
  readonly watchStatus = signal<WatchStatus>('WATCHING');
  readonly watchedEpisodes = signal(0);
  readonly episodeOptions = signal<AnimeEpisodeOption[]>([]);
  readonly translatedEpisodeTitles = signal<Record<number, string>>({});
  readonly libraryEntries = signal<AnimethequeEntry[]>([]);
  readonly episodesLoading = signal(false);
  readonly backgroundBaseStyle = signal(this.committedBackgroundStyle);
  readonly backgroundTransitionLayers = signal<BackgroundTransitionLayer[]>([]);
  readonly animeNeonColors = signal<Record<string, string>>({});
  readonly showAnimeSearchSuggestions = computed(() => this.searchSuggestionsOpen() && this.query().trim().length >= 2);
  readonly previewDisplayLimit = PREVIEW_ANIME_COUNT;
  readonly previewRailActive = signal(false);
  readonly previewMode = computed(() => this.isPreviewState(this.query().trim()));

  readonly filteredAnimes = computed(() => {
    const hasSearchQuery = this.query().trim().length > 0;
    const selectedGenre = this.selectedGenre();
    const selectedType = this.selectedType();
    const selectedStatus = this.selectedStatus();
    const selectedYear = this.selectedYear();
    const selectedSeason = this.selectedSeason();
    const selectedMinScore = this.selectedMinScore();
    let list = this.animes();

    if (selectedGenre !== ALL_GENRES_VALUE) {
      list = list.filter((anime) => anime.genres.includes(selectedGenre));
    }
    if (selectedType !== ALL_FILTER_VALUE) {
      list = list.filter((anime) => this.formatCardType(anime) === selectedType);
    }
    if (selectedStatus !== ALL_FILTER_VALUE) {
      list = list.filter((anime) => this.statusDisplay(anime.status) === selectedStatus);
    }
    if (!hasSearchQuery && selectedYear !== ALL_FILTER_VALUE) {
      list = list.filter((anime) => this.formatCardYear(anime) === selectedYear);
    }
    if (!hasSearchQuery && selectedSeason !== ALL_FILTER_VALUE) {
      list = list.filter((anime) => this.matchesSeasonFilter(anime, selectedSeason));
    }
    if (selectedMinScore !== ALL_FILTER_VALUE) {
      const minimumScore = Number(selectedMinScore);
      list = list.filter((anime) => anime.score !== null && anime.score >= minimumScore);
    }

    return this.sortAnimeList(list, this.sortMode());
  });
  readonly displayedAnimes = computed(() => {
    const list = this.filteredAnimes();
    if (!this.previewMode()) {
      return list;
    }

    const previewItems = list.slice(0, PREVIEW_ANIME_COUNT);
    return [...previewItems, ...previewItems];
  });

  readonly activeFilterChips = computed<CatalogFilterChip[]>(() => {
    const chips: CatalogFilterChip[] = [];
    const query = this.query().trim();
    const genre = this.selectedGenre();
    const type = this.selectedType();
    const status = this.selectedStatus();
    const year = this.selectedYear();
    const season = this.selectedSeason();
    const minScore = this.selectedMinScore();
    const sortMode = this.sortMode();

    if (query) {
      chips.push({ key: 'query', label: `Recherche: ${query}` });
    }
    if (genre !== ALL_GENRES_VALUE) {
      chips.push({ key: 'genre', label: this.formatGenreLabel(genre) });
    }
    if (type !== ALL_FILTER_VALUE) {
      chips.push({ key: 'type', label: type });
    }
    if (status !== ALL_FILTER_VALUE) {
      chips.push({ key: 'status', label: status });
    }
    if (year !== ALL_FILTER_VALUE && (!this.defaultYearFilterActive() || year !== DEFAULT_CATALOG_YEAR)) {
      chips.push({ key: 'year', label: year });
    }
    if (season !== ALL_FILTER_VALUE) {
      chips.push({ key: 'season', label: this.formatSeasonName(season) });
    }
    if (minScore !== ALL_FILTER_VALUE) {
      chips.push({ key: 'score', label: `Score ${minScore}+` });
    }
    if (sortMode !== DEFAULT_SORT_MODE) {
      chips.push({ key: 'sort', label: this.formatSortModeLabel(sortMode) });
    }

    return chips;
  });

  readonly sortedAnimes = computed(() => [...this.animes()].sort((left, right) => this.compareAnimeTitle(left, right)));
  readonly availableGenres = computed(() =>
    Array.from(new Set((this.filterOptions()?.genres ?? this.animes().flatMap((anime) => anime.genres))))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, this.languageService.language(), { sensitivity: 'base' })),
  );
  readonly availableTypes = computed(() =>
    Array.from(
      new Set((this.filterOptions()?.types ?? this.animes().map((anime) => this.primaryDisplayType(anime))).map((type) => this.formatDisplayType(type))),
    )
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, this.languageService.language(), { sensitivity: 'base' })),
  );
  readonly availableStatuses = computed(() =>
    Array.from(new Set((this.filterOptions()?.statuses ?? this.animes().map((anime) => anime.status)).map((status) => this.statusDisplay(status))))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, this.languageService.language(), { sensitivity: 'base' })),
  );
  readonly availableYears = computed(() =>
    Array.from(
      new Set(
        [
          DEFAULT_CATALOG_YEAR,
          ...(
            this.filterOptions()?.years.map((year) => String(year)) ??
            this.animes().map((anime) => this.formatCardYear(anime))
          ),
        ],
      ),
    )
      .filter((year) => /^\d{4}$/.test(year))
      .sort((left, right) => Number(right) - Number(left)),
  );
  readonly selectedLibraryEntry = computed(() => {
    const anime = this.selected();
    return anime ? this.findLibraryEntryForAnime(anime) : undefined;
  });
  readonly totalPages = computed(() => {
    if (this.totalItems() <= 0 || this.pageSize() <= 0) {
      return this.hasNextPage() ? this.page() + 1 : this.page();
    }

    return Math.max(1, Math.ceil(this.totalItems() / this.pageSize()));
  });
  readonly paginationItems = computed<PaginationItem[]>(() => this.buildPaginationItems(this.page(), this.totalPages()));

  readonly selectedBackgroundUrl = computed(() => {
    const anime = this.selected();

    return anime ? anime.backgroundUrl || anime.imageUrl : this.defaultCatalogBackgroundUrl;
  });

  readonly backgroundStyle = computed(() => {
    const url = this.selectedBackgroundUrl();
    return this.backgroundStyleForUrl(url);
  });

  constructor() {
    effect(() => {
      const anime = this.selected();
      const language = this.languageService.language();
      if (!anime) {
        this.translatedSynopsis.set('');
        return;
      }

      this.translateSynopsis(anime.synopsis, language);
    });

    effect(() => {
      const language = this.languageService.language();
      const episodeOptions = this.episodeOptions();
      this.translateEpisodeTitles(episodeOptions, language);
    });

    effect(() => {
      const account = this.account();
      if (!account) {
        this.libraryEntries.set([]);
        return;
      }

      this.loadLibraryEntries(account.id);
    });

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
    if (this.requestedSelection.trim()) {
      void this.router.navigate(['/animes', this.requestedSelection.trim()]);
      return;
    }

    this.selectedYear.set(ALL_FILTER_VALUE);
    this.defaultYearFilterActive.set(false);
    this.sortMode.set(DEFAULT_SORT_MODE);

    if (this.isAnimeSortMode(this.requestedSortMode)) {
      this.sortMode.set(this.requestedSortMode);
    }

    this.loadFilterOptions();
    this.loadCatalogTotal();
    this.loadCurrentPage(1);
  }

  ngOnDestroy(): void {
    this.cancelPendingSearch();
    this.cancelPendingSuggestions();
    this.cancelPendingBackgroundFade();
    this.cancelPreviewRailAnimationFrames();
  }

  setQuery(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.query.set(query);
    if (query.trim()) {
      this.selectedYear.set(ALL_FILTER_VALUE);
      this.selectedSeason.set(ALL_FILTER_VALUE);
    } else if (this.defaultYearFilterActive()) {
      this.selectedYear.set(ALL_FILTER_VALUE);
    }
    this.searchSuggestionsOpen.set(false);
    this.searchSuggestions.set([]);
    this.scheduleSearch();
  }

  openAnimeSearchSuggestions(): void {
    this.searchSuggestionsOpen.set(false);
  }

  closeAnimeSearchSuggestions(): void {
    this.searchSuggestionsOpen.set(false);
  }

  openFirstAnimeSuggestion(): void {
    const [anime] = this.searchSuggestions();
    if (anime) {
      this.openAnimeSuggestion(anime);
    }
  }

  openAnimeSuggestion(anime: PopularAnime): void {
    this.searchSuggestionsOpen.set(false);
    this.query.set('');
    this.searchSuggestions.set([]);
    void this.router.navigate(['/animes', anime.slug]);
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

  setSeason(season: string): void {
    this.selectedSeason.set(season || ALL_FILTER_VALUE);
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

  selectSortMode(sortMode: AnimeSortMode, event: Event): void {
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

  selectSeason(season: string, event: Event): void {
    event.stopPropagation();
    this.closeFilterMenus();
    this.setSeason(season);
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

  setSortMode(sortMode: AnimeSortMode): void {
    this.sortMode.set(sortMode);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: sortMode === DEFAULT_SORT_MODE ? null : sortMode },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.loadCurrentPage(1);
  }

  resetFilters(): void {
    this.query.set('');
    this.searchSuggestions.set([]);
    this.searchSuggestionsOpen.set(false);
    this.selectedGenre.set(ALL_GENRES_VALUE);
    this.selectedType.set(ALL_FILTER_VALUE);
    this.selectedStatus.set(ALL_FILTER_VALUE);
    this.defaultYearFilterActive.set(false);
    this.selectedYear.set(ALL_FILTER_VALUE);
    this.selectedSeason.set(ALL_FILTER_VALUE);
    this.selectedMinScore.set(ALL_FILTER_VALUE);
    this.sortMode.set(DEFAULT_SORT_MODE);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.loadCurrentPage(1);
  }

  clearAllFilters(): void {
    this.query.set('');
    this.searchSuggestions.set([]);
    this.searchSuggestionsOpen.set(false);
    this.selectedGenre.set(ALL_GENRES_VALUE);
    this.selectedType.set(ALL_FILTER_VALUE);
    this.selectedStatus.set(ALL_FILTER_VALUE);
    this.defaultYearFilterActive.set(false);
    this.selectedYear.set(ALL_FILTER_VALUE);
    this.selectedSeason.set(ALL_FILTER_VALUE);
    this.selectedMinScore.set(ALL_FILTER_VALUE);
    this.sortMode.set(DEFAULT_SORT_MODE);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.loadCurrentPage(1);
  }

  removeFilterChip(key: CatalogFilterChipKey): void {
    switch (key) {
      case 'query':
        this.query.set('');
        this.searchSuggestions.set([]);
        this.searchSuggestionsOpen.set(false);
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
      case 'season':
        this.setSeason(ALL_FILTER_VALUE);
        return;
      case 'score':
        this.setMinScore(ALL_FILTER_VALUE);
        return;
      case 'sort':
        this.setSortMode(DEFAULT_SORT_MODE);
        return;
    }
  }

  previewAnime(anime: PopularAnime): void {
    this.prepareAnimeNeonColor(anime);
    this.previewedAnime.set(anime);
  }

  clearPreviewAnime(anime: PopularAnime): void {
    if (this.previewedAnime()?.slug === anime.slug) {
      this.previewedAnime.set(null);
    }
  }

  neonRgbForAnime(anime: PopularAnime): string {
    return this.animeNeonColors()[anime.slug] ?? this.fallbackNeonRgbForAnime(anime);
  }

  prepareAnimeNeonColor(anime: PopularAnime): void {
    if (this.animeNeonColors()[anime.slug] || this.neonColorRequests.has(anime.slug)) {
      return;
    }

    this.neonColorRequests.add(anime.slug);

    this.animeCatalogService.getDominantImageColor(anime.imageUrl).subscribe({
      next: (rgb) => {
        this.setAnimeNeonColor(anime.slug, rgb ?? this.fallbackNeonRgbForAnime(anime));
      },
      error: () => {
        this.setAnimeNeonColor(anime.slug, this.fallbackNeonRgbForAnime(anime));
        this.neonColorRequests.delete(anime.slug);
      },
      complete: () => {
        this.neonColorRequests.delete(anime.slug);
      },
    });
  }

  selectAnime(anime: PopularAnime): void {
    this.selected.set(anime);
    this.feedback.set('');
    this.errorMessage.set('');
    this.watchStatus.set('WATCHING');
    this.watchedEpisodes.set(isMovieAnime(anime) ? 0 : anime.episodes > 0 ? 1 : 0);
    this.applyExistingEntry(anime);
    this.loadEpisodeOptions(anime);
  }

  setWatchStatus(status: WatchStatus): void {
    const anime = this.selected();
    if (anime && isMovieAnime(anime)) {
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
      this.completeSelectedAnime();
      return;
    }

    if (anime && status === 'WATCHING' && this.hasWatchedAllEpisodes(anime)) {
      const inProgressEpisode = this.completedEpisodeValue(anime) - 1;
      if (inProgressEpisode <= 0) {
        this.watchStatus.set('PLANNED');
        this.watchedEpisodes.set(0);
        this.errorMessage.set(this.languageService.t('anime.watchingNeedsEpisode'));
        return;
      }

      this.watchedEpisodes.set(inProgressEpisode);
    }
  }

  setWatchedEpisodes(event: Event): void {
    const anime = this.selected();
    if (anime && isMovieAnime(anime)) {
      return;
    }

    if (this.watchStatus() === 'COMPLETED') {
      return;
    }

    const input = event.target as HTMLInputElement;
    const rawValue = Number(input.value);
    const maxEpisodes = anime ? this.maxEpisodesFor(anime) : UNKNOWN_EPISODE_LIMIT;
    const value = Number.isFinite(rawValue) ? Math.max(0, Math.min(rawValue, maxEpisodes)) : 0;
    if (anime && value > 0 && this.hasWatchedAllEpisodes(anime, value)) {
      this.watchStatus.set('COMPLETED');
    } else if (value > 0 && this.watchStatus() === 'PLANNED') {
      this.watchStatus.set('WATCHING');
    } else if (value <= 0 && this.watchStatus() === 'WATCHING') {
      this.watchStatus.set('PLANNED');
    }

    this.watchedEpisodes.set(value);
    input.value = String(value);
  }

  setWatchedEpisode(value: number): void {
    const anime = this.selected();
    if (anime && isMovieAnime(anime)) {
      return;
    }

    if (this.watchStatus() === 'COMPLETED') {
      return;
    }

    const maxEpisodes = anime ? this.maxEpisodesFor(anime) : UNKNOWN_EPISODE_LIMIT;
    const nextValue = Math.max(0, Math.min(Number(value), maxEpisodes));
    if (anime && nextValue > 0 && this.hasWatchedAllEpisodes(anime, nextValue)) {
      this.watchStatus.set('COMPLETED');
    } else if (nextValue > 0 && this.watchStatus() === 'PLANNED') {
      this.watchStatus.set('WATCHING');
    } else if (nextValue <= 0 && this.watchStatus() === 'WATCHING') {
      this.watchStatus.set('PLANNED');
    }

    this.watchedEpisodes.set(nextValue);
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

  addSelected(): void {
    const account = this.account();
    const anime = this.selected();
    if (!account || !anime || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.feedback.set('');
    this.errorMessage.set('');

    this.animethequeService.save(account.id, this.toAnimethequeRequest(anime)).subscribe({
      next: (entry) => {
        this.upsertLibraryEntry(entry);
        this.trackAnimeLibrarySave(anime, entry);
        this.feedback.set(this.languageService.t('anime.added', { title: anime.title }));
        this.saving.set(false);
      },
      error: () => {
        this.errorMessage.set(this.languageService.t('anime.addError'));
        this.saving.set(false);
      },
    });
  }

  formatEpisodes(anime: PopularAnime): string {
    if (isMovieAnime(anime)) {
      return 'Film';
    }

    if (anime.seasons.length > 1) {
      const seasonCount = this.languageService.t('anime.seasonCount', { count: anime.seasons.length });
      const episodeCount =
        anime.episodes > 0
          ? this.languageService.t('anime.episodeTotal', { count: anime.episodes })
          : this.languageService.t('anime.episodesUnknown');
      return `${seasonCount} • ${episodeCount}`;
    }

    if (anime.episodes <= 0) {
      return this.languageService.t('anime.episodesUnknown');
    }

    return this.languageService.t('anime.episodeCount', { count: anime.episodes });
  }

  formatEpisodeLimit(anime: PopularAnime): string {
    if (isMovieAnime(anime)) {
      return 'Change le statut sur Terminé quand le film est vu.';
    }

    if (this.episodesLoading()) {
      return this.languageService.t('anime.loadingEpisodes');
    }

    return anime.episodes > 0
      ? this.languageService.t('anime.lastCompletedEpisodeHint', { count: anime.episodes })
      : this.languageService.t('anime.lastCompletedEpisodeHintUnknown');
  }

  formatAnimeFacts(anime: PopularAnime): string {
    return isMovieAnime(anime) ? animeTypeLabel(anime.type) : this.formatEpisodes(anime);
  }

  formatCardScore(score: number | null): string {
    return score === null ? '' : score.toFixed(2).replace(/\.?0+$/, '');
  }

  hasCardScore(anime: PopularAnime): boolean {
    return anime.score !== null;
  }

  missingScoreLabel(): string {
    return 'Non noté';
  }

  isRankingView(): boolean {
    return this.sortMode() === 'rank-asc';
  }

  formatSortModeLabel(sortMode: AnimeSortMode): string {
    const option = this.sortOptions.find((currentOption) => currentOption.value === sortMode);
    return option ? this.languageService.t(option.labelKey) : '';
  }

  rankingLabel(anime: PopularAnime, index: number): string {
    const rank = anime.rank ?? (this.page() - 1) * this.pageSize() + index + 1;
    return `#${rank.toLocaleString('fr-FR')}`;
  }

  formatCardType(anime: PopularAnime): string {
    return this.formatDisplayType(this.primaryDisplayType(anime));
  }

  formatDisplayType(type: string): string {
    switch (type.toLowerCase()) {
      case 'movie':
      case 'film':
        return 'Film';
      case 'tv special':
        return 'TV';
      case 'special':
        return 'Special';
      case 'serie':
      case 'série':
        return 'TV';
      default:
        return type || 'Anime';
    }
  }

  formatCardYear(anime: PopularAnime): string {
    const year = anime.year ?? this.firstSeasonYear(anime);
    if (year) {
      return String(year);
    }

    return anime.status === 'Not yet aired' ? 'À venir' : 'Date à confirmer';
  }

  sortModeLabel(sortMode = this.sortMode()): string {
    const option = this.sortOptions.find((currentOption) => currentOption.value === sortMode) ?? this.sortOptions[0];
    return this.languageService.t(option.labelKey);
  }

  typeFilterLabel(type = this.selectedType()): string {
    return type === ALL_FILTER_VALUE ? 'Tous' : type;
  }

  statusFilterLabel(status = this.selectedStatus()): string {
    return status === ALL_FILTER_VALUE ? 'Tous' : status;
  }

  yearFilterLabel(year = this.selectedYear()): string {
    return year === ALL_FILTER_VALUE ? 'Toutes' : year;
  }

  seasonFilterLabel(season = this.selectedSeason()): string {
    if (season === ALL_FILTER_VALUE) {
      return 'Toutes';
    }

    return this.seasonFilterOptions.find((option) => option.value === season)?.label ?? season;
  }

  minScoreFilterLabel(score = this.selectedMinScore()): string {
    if (score === ALL_FILTER_VALUE) {
      return 'Tous';
    }

    return this.minScoreFilterOptions.find((option) => option.value === score)?.label ?? score;
  }

  formatGenreLabel(genre: string): string {
    return GENRE_LABELS_FR[genre] ?? genre;
  }

  formatRankingGenres(anime: PopularAnime): string {
    return anime.genres
      .slice(0, 4)
      .map((genre) => this.formatGenreLabel(genre))
      .join(' | ');
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

  formatSuggestionSubtitle(anime: PopularAnime): string {
    const parts = [animeTypeLabel(anime.type), this.formatEpisodes(anime)];
    if (anime.score !== null) {
      parts.push(this.formatScore(anime.score));
    }

    return parts.join(' - ');
  }

  formatSeason(anime: PopularAnime): string {
    if (anime.seasons.length > 1) {
      const seasonCount = this.languageService.t('anime.seasonCount', { count: anime.seasons.length });
      return anime.year
        ? `${seasonCount} · ${this.languageService.t('anime.sinceYear', { year: anime.year })}`
        : seasonCount;
    }

    const parts = [this.formatSeasonName(anime.season), anime.year?.toString()].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '';
  }

  formatSeasonLine(season: PopularAnimeSeason, index: number): string {
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

  formatScore(score: number | null): string {
    return score === null ? this.languageService.t('common.unrated') : `${score.toFixed(2)}/10`;
  }

  statusLabelKey(status: WatchStatus): string {
    return `status.${status}`;
  }

  isAnimeCompleted(anime: PopularAnime): boolean {
    return this.findLibraryEntryForAnime(anime)?.status === 'COMPLETED';
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

  private loadCurrentPage(page: number, query = this.query().trim()): void {
    if (page === 1 && this.isPreviewState(query)) {
      this.loadPreview();
      return;
    }

    this.loadPage(page, query);
  }

  private loadPreview(): void {
    const requestId = ++this.searchRequestId;
    this.restartPreviewRailAnimation(false);
    this.loading.set(true);
    this.errorMessage.set('');

    this.animeCatalogService.getPreviewAnime(PREVIEW_ANIME_COUNT).subscribe({
      next: (result) => {
        if (requestId !== this.searchRequestId) {
          return;
        }

        const previewItems = this.mergeAnimeItems([], result.items).slice(0, PREVIEW_ANIME_COUNT);
        this.animes.set(previewItems);
        this.page.set(1);
        this.pageSize.set(PREVIEW_ANIME_COUNT);
        this.totalItems.set(previewItems.length);
        this.hasNextPage.set(false);
        this.loading.set(false);
        this.restartPreviewRailAnimation(true);
      },
      error: () => {
        if (requestId !== this.searchRequestId) {
          return;
        }

        this.errorMessage.set(this.languageService.t('anime.loadError'));
        this.loading.set(false);
      },
    });
  }

  private loadPage(page: number, query = this.query().trim()): void {
    const requestId = ++this.searchRequestId;
    this.restartPreviewRailAnimation(false);
    this.loading.set(true);
    this.errorMessage.set('');

    this.animeCatalogService.searchAnime(query, page, this.sortMode(), this.currentCatalogFilters(query)).subscribe({
      next: (result) => {
        if (requestId !== this.searchRequestId) {
          return;
        }

        const mergedItems = this.mergeAnimeItems([], result.items);
        this.animes.set(mergedItems);
        this.page.set(result.page || page);
        this.pageSize.set(result.pageSize || this.pageSize());
        this.totalItems.set(result.totalItems || mergedItems.length);
        this.hasNextPage.set(result.hasNextPage);
        this.loading.set(false);

        const selected = this.selected();
        if (selected) {
          const updatedSelected = mergedItems.find((anime) => anime.slug === selected.slug);
          if (updatedSelected) {
            this.selected.set(updatedSelected);
            if (updatedSelected.episodes !== selected.episodes || updatedSelected.seasons.length !== selected.seasons.length) {
              this.loadEpisodeOptions(updatedSelected);
            }
          }
        }

      },
      error: () => {
        if (requestId !== this.searchRequestId) {
          return;
        }

        this.errorMessage.set(this.languageService.t('anime.loadError'));
        this.loading.set(false);
      },
    });
  }

  private loadFilterOptions(): void {
    this.animeCatalogService.getFilterOptions().subscribe({
      next: (options) => {
        this.filterOptions.set(options);
      },
      error: () => {
        this.filterOptions.set(null);
      },
    });
  }

  private loadCatalogTotal(): void {
    this.animeCatalogService.getAnimeCatalogTotal().subscribe({
      next: (total) => {
        this.catalogTotalItems.set(total);
      },
      error: () => {
        this.catalogTotalItems.set(0);
      },
    });
  }

  private currentCatalogFilters(query = this.query().trim()): AnimeCatalogFilters {
    const ignoreDateFilters = query.trim().length > 0;

    return {
      genre: this.selectedGenre() === ALL_GENRES_VALUE ? '' : this.selectedGenre(),
      type: this.selectedType() === ALL_FILTER_VALUE ? '' : this.selectedType(),
      status: this.selectedStatus() === ALL_FILTER_VALUE ? '' : this.selectedStatus(),
      year: ignoreDateFilters || this.selectedYear() === ALL_FILTER_VALUE ? '' : this.selectedYear(),
      season: ignoreDateFilters || this.selectedSeason() === ALL_FILTER_VALUE ? '' : this.selectedSeason(),
      minScore: this.selectedMinScore() === ALL_FILTER_VALUE ? '' : this.selectedMinScore(),
    };
  }

  private isPreviewState(query = this.query().trim()): boolean {
    return (
      query.trim().length === 0 &&
      this.selectedGenre() === ALL_GENRES_VALUE &&
      this.selectedType() === ALL_FILTER_VALUE &&
      this.selectedStatus() === ALL_FILTER_VALUE &&
      this.selectedYear() === ALL_FILTER_VALUE &&
      this.selectedSeason() === ALL_FILTER_VALUE &&
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
        if (this.previewMode() && this.animes().length > 0) {
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

  private scheduleSearch(): void {
    this.cancelPendingSearch();
    this.searchDebounceId = setTimeout(() => {
      this.searchDebounceId = null;
      const query = this.query().trim();
      this.trackAnimeSearch(query);
      this.loadCurrentPage(1, query);
    }, 350);
  }

  private cancelPendingSearch(): void {
    if (this.searchDebounceId !== null) {
      clearTimeout(this.searchDebounceId);
      this.searchDebounceId = null;
    }
  }

  private trackAnimeSearch(query: string): void {
    if (query.length < 2 || query === this.lastTrackedSearchQuery) {
      return;
    }

    this.lastTrackedSearchQuery = query;
    this.analytics.trackEvent('anime_search', {
      route: '/animes',
      query,
    });
  }

  private trackAnimeLibrarySave(anime: PopularAnime, entry: AnimethequeEntry): void {
    const properties = {
      route: '/animes',
      anime_id: anime.id,
      anime_title: anime.title,
      status: entry.status,
      watched_episodes: entry.watchedEpisodes,
    };

    this.analytics.trackEvent('anime_add_to_library', properties);
    this.analytics.trackEvent('anime_progress_update', properties);
    if (entry.status === 'COMPLETED') {
      this.analytics.trackEvent('anime_mark_completed', properties);
    }
  }

  private scheduleSuggestions(): void {
    this.cancelPendingSuggestions();
    const query = this.query().trim();
    if (query.length < 2) {
      this.searchSuggestions.set([]);
      this.suggestionsLoading.set(false);
      return;
    }

    this.suggestionDebounceId = setTimeout(() => {
      this.suggestionDebounceId = null;
      this.loadSearchSuggestions(query);
    }, 260);
  }

  private loadSearchSuggestions(query: string): void {
    const requestId = ++this.suggestionRequestId;
    this.suggestionsLoading.set(true);

    this.animeCatalogService.searchAnimeSuggestions(query).subscribe({
      next: (suggestions) => {
        if (requestId !== this.suggestionRequestId || this.query().trim() !== query) {
          return;
        }

        this.searchSuggestions.set(suggestions);
        this.suggestionsLoading.set(false);
      },
      error: () => {
        if (requestId !== this.suggestionRequestId) {
          return;
        }

        this.searchSuggestions.set([]);
        this.suggestionsLoading.set(false);
      },
    });
  }

  private cancelPendingSuggestions(): void {
    if (this.suggestionDebounceId !== null) {
      clearTimeout(this.suggestionDebounceId);
      this.suggestionDebounceId = null;
    }
  }

  private setAnimeNeonColor(slug: string, rgb: string): void {
    this.animeNeonColors.update((colors) => ({ ...colors, [slug]: rgb }));
  }

  private fallbackNeonRgbForAnime(anime: PopularAnime): string {
    const key = anime.slug || anime.title;
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

  private loadEpisodeOptions(anime: PopularAnime): void {
    if (isMovieAnime(anime)) {
      this.episodeOptions.set([]);
      this.translatedEpisodeTitles.set({});
      this.episodesLoading.set(false);
      this.watchedEpisodes.set(this.watchStatus() === 'COMPLETED' ? 1 : 0);
      return;
    }

    const fallbackOptions = this.createFallbackEpisodeOptions(anime);
    this.episodeOptions.set(fallbackOptions);
    this.episodesLoading.set(true);

    this.animeCatalogService.getEpisodeOptions(anime).subscribe({
      next: (options) => {
        if (this.selected()?.slug !== anime.slug) {
          return;
        }

        const finalOptions = options.length > 0 ? [this.noEpisodeOption(), ...options] : fallbackOptions;
        this.episodeOptions.set(finalOptions);
        this.episodesLoading.set(false);
        if (this.watchStatus() === 'COMPLETED') {
          this.completeSelectedAnime();
        } else {
          this.watchedEpisodes.set(Math.min(Math.max(0, this.watchedEpisodes()), this.maxEpisodesFor(anime)));
        }
      },
      error: () => {
        if (this.selected()?.slug === anime.slug) {
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
        const selected = this.selected();
        if (selected) {
          this.applyExistingEntry(selected);
        }
      },
      error: () => {
        this.libraryEntries.set([]);
      },
    });
  }

  private applyExistingEntry(anime: PopularAnime): void {
    const entry = this.findLibraryEntryForAnime(anime);
    if (!entry) {
      return;
    }

    const status = this.normalizedEntryStatus(anime, entry);
    this.watchStatus.set(status);
    if (isMovieAnime(anime)) {
      this.watchedEpisodes.set(status === 'COMPLETED' || entry.watchedEpisodes > 0 ? 1 : 0);
      return;
    }

    const maxEpisodes = anime.episodes > 0 ? anime.episodes : Math.max(entry.totalEpisodes, this.maxEpisodesFor(anime));
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
    const status = this.normalizedWatchStatus(anime);
    const watchedEpisodes =
      isMovieAnime(anime)
        ? status === 'COMPLETED'
          ? 1
          : 0
        : status === 'COMPLETED'
        ? this.completedEpisodeValue(anime)
        : Math.min(this.watchedEpisodes(), this.maxEpisodesFor(anime));
    const existingEntry = this.findLibraryEntryForAnime(anime);

    return {
      animeSlug: existingEntry?.animeSlug ?? anime.slug,
      title: anime.title,
      coverUrl: anime.imageUrl,
      status,
      watchedEpisodes,
      totalEpisodes: isMovieAnime(anime) ? Math.max(1, anime.episodes) : anime.episodes,
      mediaType: anime.type,
      score: null,
      favorite: existingEntry?.favorite ?? false,
      notes: existingEntry?.notes ?? '',
    };
  }

  private normalizedWatchStatus(anime: PopularAnime): WatchStatus {
    if (!isMovieAnime(anime) && this.hasWatchedAllEpisodes(anime)) {
      return 'COMPLETED';
    }

    if (!isMovieAnime(anime) && this.watchStatus() === 'WATCHING' && this.watchedEpisodes() <= 0) {
      return 'PLANNED';
    }

    if (!isMovieAnime(anime) && this.watchStatus() === 'PLANNED' && this.watchedEpisodes() > 0) {
      return 'WATCHING';
    }

    return this.watchStatus();
  }

  private normalizedEntryStatus(anime: PopularAnime, entry: AnimethequeEntry): WatchStatus {
    if (entry.status !== 'WATCHING') {
      return entry.status;
    }

    const watchedEpisodes = Math.max(0, Number(entry.watchedEpisodes || 0));
    const totalEpisodes = Math.max(0, Number(entry.totalEpisodes || 0), Number(anime.episodes || 0));
    if (watchedEpisodes <= 0) {
      return 'PLANNED';
    }

    return totalEpisodes > 0 && watchedEpisodes >= totalEpisodes ? 'COMPLETED' : 'WATCHING';
  }

  private findLibraryEntryForAnime(anime: PopularAnime): AnimethequeEntry | undefined {
    const animeSlugs = new Set([anime.slug, ...anime.seasons.map((season) => season.slug)]);
    const animeTitles = new Set([anime.title, ...anime.seasons.map((season) => season.title)].map((title) => this.normalizeTitle(title)));

    return this.libraryEntries().find((entry) => {
      if (animeSlugs.has(entry.animeSlug)) {
        return true;
      }

      return animeTitles.has(this.normalizeTitle(entry.title));
    });
  }

  private maxEpisodesFor(anime: PopularAnime): number {
    const loadedMax = this.episodeOptions()
      .map((option) => option.value)
      .reduce((max, value) => Math.max(max, value), 0);

    if (anime.episodes > 0) {
      return anime.episodes;
    }

    return loadedMax > 0 ? loadedMax : UNKNOWN_EPISODE_LIMIT;
  }

  private completedEpisodeValue(anime: PopularAnime): number {
    if (anime.episodes > 0) {
      return anime.episodes;
    }

    const loadedMax = this.episodeOptions()
      .map((option) => option.value)
      .reduce((max, value) => Math.max(max, value), 0);

    return loadedMax > 0 ? loadedMax : this.watchedEpisodes();
  }

  private hasWatchedAllEpisodes(anime: PopularAnime, watchedEpisodes = this.watchedEpisodes()): boolean {
    const loadedMax = this.episodeOptions()
      .map((option) => option.value)
      .reduce((max, value) => Math.max(max, value), 0);
    const totalEpisodes = anime.episodes > 0 ? anime.episodes : loadedMax;

    return totalEpisodes > 0 && watchedEpisodes >= totalEpisodes;
  }

  private completeSelectedAnime(): void {
    const anime = this.selected();
    if (!anime) {
      return;
    }

    this.watchedEpisodes.set(this.completedEpisodeValue(anime));
  }

  private createFallbackEpisodeOptions(anime: PopularAnime): AnimeEpisodeOption[] {
    const seasons = anime.seasons.length > 0 ? anime.seasons : [];
    const options: AnimeEpisodeOption[] = [this.noEpisodeOption()];
    let offset = 0;

    if (seasons.length > 0) {
      for (const [index, season] of seasons.entries()) {
        const totalEpisodes = Math.max(0, season.episodes);
        options.push(...this.createFallbackSeasonEpisodeOptions(totalEpisodes, offset, index + 1));
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

  private createFallbackSeasonEpisodeOptions(totalEpisodes: number, offset: number, seasonNumber: number): AnimeEpisodeOption[] {
    return Array.from({ length: totalEpisodes }, (_, index) => {
      const episode = index + 1;
      return {
        value: offset + episode,
        title: '',
        label: this.languageService.t('anime.episode', { count: episode }),
        seasonTitle: '',
        seasonNumber,
        seasonEpisode: episode,
      };
    });
  }

  private mergeAnimeItems(existing: PopularAnime[], incoming: PopularAnime[]): PopularAnime[] {
    const bySlug = new Map<string, PopularAnime>();

    for (const anime of existing) {
      bySlug.set(anime.slug, anime);
    }

    for (const anime of incoming) {
      const current = bySlug.get(anime.slug);
      bySlug.set(anime.slug, current ? this.mergeAnimeSeries(current, anime) : anime);
    }

    return Array.from(bySlug.values());
  }

  private mergeAnimeSeries(current: PopularAnime, incoming: PopularAnime): PopularAnime {
    const seasonMap = new Map(current.seasons.map((season) => [season.slug, season]));
    for (const season of incoming.seasons) {
      seasonMap.set(season.slug, season);
    }

    const seasons = Array.from(seasonMap.values()).sort((left, right) => this.compareSeason(left, right));
    const episodes = seasons.reduce((total, season) => total + Math.max(0, season.episodes), 0);
    const years = seasons.map((season) => season.year).filter((year): year is number => year !== null);

    return {
      ...current,
      episodes,
      season: seasons.length > 1 ? null : current.season,
      year: years.length > 0 ? Math.min(...years) : current.year,
      genres: Array.from(new Set([...current.genres, ...incoming.genres])),
      studios: Array.from(new Set([...current.studios, ...incoming.studios])),
      seasons,
    };
  }

  private compareSeason(left: PopularAnimeSeason, right: PopularAnimeSeason): number {
    const leftYear = left.year ?? 9999;
    const rightYear = right.year ?? 9999;
    if (leftYear !== rightYear) {
      return leftYear - rightYear;
    }

    return this.seasonOrder(left.season) - this.seasonOrder(right.season);
  }

  private seasonOrder(season: string | null): number {
    switch (season) {
      case 'winter':
        return 1;
      case 'spring':
        return 2;
      case 'summer':
        return 3;
      case 'fall':
        return 4;
      default:
        return 5;
    }
  }

  private compareAnimeTitle(left: PopularAnime, right: PopularAnime): number {
    return left.title.localeCompare(right.title, 'fr', { sensitivity: 'base' });
  }

  private sortAnimeList(list: PopularAnime[], sortMode: AnimeSortMode): PopularAnime[] {
    return [...list].sort((left, right) => {
      switch (sortMode) {
        case 'title-desc':
          return this.compareAnimeTitle(right, left);
        case 'rank-asc':
          return (left.rank ?? 999999) - (right.rank ?? 999999) || this.compareAnimeTitle(left, right);
        case 'popularity-asc':
          return (left.popularity ?? 999999) - (right.popularity ?? 999999) || this.compareAnimeTitle(left, right);
        case 'score-desc':
          return (right.score ?? -1) - (left.score ?? -1) || this.compareAnimeTitle(left, right);
        case 'episodes-desc':
          return right.episodes - left.episodes || this.compareAnimeTitle(left, right);
        case 'title-asc':
        default:
          return this.compareAnimeTitle(left, right);
      }
    });
  }

  private isAnimeSortMode(value: string): value is AnimeSortMode {
    return ['popularity-asc', 'title-asc', 'title-desc', 'episodes-desc', 'score-desc', 'rank-asc'].includes(value);
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

  private primaryDisplayType(anime: PopularAnime): string {
    if (isMovieAnime(anime)) {
      return 'Film';
    }

    const seasonType = anime.seasons.find((season) => season.type)?.type;
    return seasonType || anime.type;
  }

  private matchesSeasonFilter(anime: PopularAnime, season: string): boolean {
    return anime.season === season || anime.seasons.some((animeSeason) => animeSeason.season === season);
  }

  private firstSeasonYear(anime: PopularAnime): number | null {
    const years = anime.seasons
      .map((season) => season.year)
      .filter((year): year is number => year !== null);

    return years.length > 0 ? Math.min(...years) : null;
  }

  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private findRequestedAnime(animes: PopularAnime[]): PopularAnime | undefined {
    const requestedSelection = this.requestedSelection.trim().toLowerCase();
    if (!requestedSelection) {
      return undefined;
    }

    return animes.find((anime) => this.matchesSelection(anime, requestedSelection));
  }

  private matchesSelection(anime: PopularAnime, requestedSelection: string): boolean {
    if (anime.slug.toLowerCase() === requestedSelection) {
      return true;
    }

    if (this.seriesSlugForTitle(anime.title) === requestedSelection) {
      return true;
    }

    if (anime.titleJapanese && this.seriesSlugForTitle(`${anime.title} ${anime.titleJapanese}`) === requestedSelection) {
      return true;
    }

    return anime.seasons.some(
      (season) =>
        season.slug.toLowerCase() === requestedSelection || this.seriesSlugForTitle(season.title) === requestedSelection,
    );
  }

  private seriesSlugForTitle(title: string): string {
    return `series-${this.normalizeTitle(title).replace(/\s+/g, '-')}`;
  }

  private formatSeasonName(season: string | null): string {
    switch (season) {
      case 'winter':
        return this.languageService.t('season.winter');
      case 'spring':
        return this.languageService.t('season.spring');
      case 'summer':
        return this.languageService.t('season.summer');
      case 'fall':
        return this.languageService.t('season.fall');
      default:
        return '';
    }
  }

  private translateSynopsis(synopsis: string, language: 'fr' | 'en'): void {
    if (language === 'en') {
      this.translatedSynopsis.set(synopsis);
      this.translatingSynopsis.set(false);
      return;
    }

    this.translatingSynopsis.set(true);
    this.languageService.translateText(synopsis, 'en', 'fr').subscribe({
      next: (translation) => {
        if (this.selected()?.synopsis === synopsis && this.languageService.language() === language) {
          this.translatedSynopsis.set(translation);
          this.translatingSynopsis.set(false);
        }
      },
      error: () => {
        this.translatedSynopsis.set(synopsis);
        this.translatingSynopsis.set(false);
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
