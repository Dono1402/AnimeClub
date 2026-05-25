import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { CharacterCatalogEntry } from '../models/character.model';
import { CharacterCatalogService } from '../services/character-catalog.service';

const CHARACTER_PAGE_SIZE = 100;
const POPULAR_CHARACTER_LIMIT = 16;
const ALL_FILTER_VALUE = 'all';
const DEFAULT_SORT_VALUE: CharacterSort = 'popular';
const RECENT_STORAGE_KEY = 'animeclub:characters:recently-consulted';

type CharacterFilterMenu = 'universe' | 'role' | 'popularity' | 'sort';
type ActiveFilterKey = CharacterFilterMenu | 'query';
type CharacterSort = 'popular' | 'alphabetical' | 'recent';

interface FilterOption {
  value: string;
  label: string;
}

interface ActiveFilterChip {
  key: ActiveFilterKey;
  label: string;
  removable: boolean;
}

interface SidebarRoleOption {
  value: string;
  label: string;
  count: number;
  tone: string;
}

interface UniverseSummary {
  value: string;
  label: string;
  count: number;
  favorites: number;
  imageUrl: string;
}

interface CommunityActivityItem {
  actor: string;
  actionBefore: string;
  actionAfter: string;
  character: CharacterCatalogEntry;
  characterName: string;
  slug: string;
  imageUrl: string;
  timeLabel: string;
}

@Component({
  selector: 'app-characters-page',
  standalone: true,
  imports: [RouterLink, MenuBarComponent],
  templateUrl: './characters-page.component.html',
  styleUrl: './characters-page.component.scss',
})
export class CharactersPageComponent implements OnInit, OnDestroy {
  private readonly characterCatalogService = inject(CharacterCatalogService);
  private searchDebounceId: ReturnType<typeof setTimeout> | null = null;
  private searchRequestId = 0;
  private popularRequestId = 0;
  private readonly accentColorRequests = new Set<string>();
  private readonly fallbackAccentPalette = [
    '255, 91, 132',
    '178, 112, 255',
    '87, 192, 255',
    '255, 186, 95',
    '255, 120, 104',
    '91, 232, 210',
    '233, 123, 255',
  ];

  readonly backgroundImageUrl = 'assets/characters/back2.png';
  readonly characters = signal<CharacterCatalogEntry[]>([]);
  readonly popularCharactersSource = signal<CharacterCatalogEntry[]>([]);
  readonly recentCharacters = signal<CharacterCatalogEntry[]>([]);
  readonly characterAccentColors = signal<Record<string, string>>({});
  readonly query = signal('');
  readonly loading = signal(false);
  readonly popularLoading = signal(false);
  readonly errorMessage = signal('');
  readonly page = signal(1);
  readonly hasNextPage = signal(false);
  readonly totalItems = signal(0);
  readonly selectedUniverse = signal(ALL_FILTER_VALUE);
  readonly selectedRole = signal(ALL_FILTER_VALUE);
  readonly selectedPopularity = signal(ALL_FILTER_VALUE);
  readonly selectedSort = signal<CharacterSort>(DEFAULT_SORT_VALUE);
  readonly openFilterMenu = signal<CharacterFilterMenu | null>(null);
  readonly advancedFiltersOpen = signal(false);
  readonly showAllUniverses = signal(false);
  readonly communityExpanded = signal(false);
  readonly activeCardMenu = signal<string | null>(null);

  readonly popularityOptions: FilterOption[] = [
    { value: ALL_FILTER_VALUE, label: 'Toutes' },
    { value: '10000', label: '10K+' },
    { value: '5000', label: '5K+' },
    { value: '1000', label: '1K+' },
  ];

  readonly sortOptions: FilterOption[] = [
    { value: 'popular', label: 'Popularité' },
    { value: 'alphabetical', label: 'Nom A-Z' },
    { value: 'recent', label: 'Dernière synchro' },
  ];

  private readonly availableCharacters = computed(() => {
    const charactersById = new Map<string, CharacterCatalogEntry>();

    for (const character of [...this.popularCharactersSource(), ...this.characters()]) {
      charactersById.set(this.characterIdentity(character), character);
    }

    return Array.from(charactersById.values());
  });

  readonly universeSummaries = computed<UniverseSummary[]>(() => {
    const summaries = new Map<string, UniverseSummary>();

    for (const character of this.availableCharacters()) {
      const label = character.sourceAnimeTitle?.trim();
      if (!label) {
        continue;
      }

      const existing = summaries.get(label);
      const imageUrl = character.sourceAnimeImageUrl?.trim() || this.imageFor(character);

      if (existing) {
        existing.count += 1;
        existing.favorites += character.favorites ?? 0;
        if (!existing.imageUrl && imageUrl) {
          existing.imageUrl = imageUrl;
        }
      } else {
        summaries.set(label, {
          value: label,
          label,
          count: 1,
          favorites: character.favorites ?? 0,
          imageUrl,
        });
      }
    }

    return Array.from(summaries.values()).sort((first, second) => {
      if (second.count !== first.count) {
        return second.count - first.count;
      }

      return second.favorites - first.favorites;
    });
  });

  readonly visibleUniverses = computed(() =>
    this.showAllUniverses() ? this.universeSummaries() : this.universeSummaries().slice(0, 5),
  );

  readonly universeOptions = computed<FilterOption[]>(() => [
    { value: ALL_FILTER_VALUE, label: 'Tous' },
    ...this.universeSummaries()
      .slice()
      .sort((first, second) => first.label.localeCompare(second.label, 'fr'))
      .map((universe) => ({ value: universe.value, label: universe.label })),
  ]);

  readonly roleOptions = computed<FilterOption[]>(() => {
    const roles = new Map<string, string>();

    for (const character of this.availableCharacters()) {
      const role = character.role?.trim();
      if (role) {
        roles.set(this.roleClass(character), this.roleLabelValue(role));
      }
    }

    return [
      { value: ALL_FILTER_VALUE, label: 'Tous' },
      ...Array.from(roles.entries())
        .sort(([, firstLabel], [, secondLabel]) => firstLabel.localeCompare(secondLabel, 'fr'))
        .map(([value, label]) => ({ value, label })),
    ];
  });

  readonly sidebarRoleOptions = computed<SidebarRoleOption[]>(() => [
    {
      value: 'main',
      label: 'Principal',
      count: this.countCharactersForRole('main'),
      tone: 'main',
    },
    {
      value: 'supporting',
      label: 'Secondaire',
      count: this.countCharactersForRole('supporting'),
      tone: 'supporting',
    },
    {
      value: 'antagonist',
      label: 'Antagoniste',
      count: this.countCharactersForRole('antagonist'),
      tone: 'antagonist',
    },
    {
      value: 'mascot',
      label: 'Mascotte',
      count: this.countCharactersForRole('mascot'),
      tone: 'mascot',
    },
  ]);

  readonly filteredCharacters = computed(() => this.sortCharacters(
    this.characters()
      .filter((character) => this.hasDisplayImage(character))
      .filter((character) => this.matchesSelectedFilters(character)),
  ));

  readonly topCharacters = computed(() => this.availableCharacters()
    .filter((character) => this.hasDisplayImage(character))
    .sort((first, second) => (second.favorites ?? 0) - (first.favorites ?? 0))
    .slice(0, 5));

  readonly featuredCharacter = computed(() => {
    const filteredTop = this.sortCharacters(
      this.availableCharacters()
        .filter((character) => this.hasDisplayImage(character))
        .filter((character) => this.matchesSelectedFilters(character)),
    );

    return filteredTop[0] ?? null;
  });

  readonly gridCharacters = computed(() => {
    const featuredIdentity = this.featuredCharacter()
      ? this.characterIdentity(this.featuredCharacter() as CharacterCatalogEntry)
      : null;

    return this.filteredCharacters()
      .filter((character) => this.characterIdentity(character) !== featuredIdentity)
      .slice(0, 10);
  });

  readonly communityActivity = computed<CommunityActivityItem[]>(() => {
    const characters = this.topCharacters().length > 0 ? this.topCharacters() : this.filteredCharacters().slice(0, 5);
    const actors = ['Luna', 'Akira', 'Yuki', 'Hana', 'Noa', 'Mika', 'Iris', 'Kenji'];
    const actions = [
      { before: 'a ajouté', after: 'à ses favoris' },
      { before: 'a commenté la fiche de', after: '' },
      { before: 'a recommandé', after: '' },
      { before: 'a ajouté', after: 'à sa liste de personnages' },
      { before: 'a consulté la fiche de', after: '' },
    ];
    const times = ['Il y a 5 min', 'Il y a 18 min', 'Il y a 34 min', 'Il y a 1 h', 'Il y a 2 h'];

    return characters.map((character, index) => {
      const action = actions[index % actions.length];
      return {
        actor: actors[index % actors.length],
        actionBefore: action.before,
        actionAfter: action.after,
        character,
        characterName: character.name,
        slug: character.slug,
        imageUrl: this.imageFor(character),
        timeLabel: times[index % times.length],
      };
    });
  });

  readonly visibleCommunityActivity = computed(() =>
    this.communityExpanded() ? this.communityActivity() : this.communityActivity().slice(0, 4),
  );

  readonly hasClientFilters = computed(() =>
    this.selectedUniverse() !== ALL_FILTER_VALUE
    || this.selectedRole() !== ALL_FILTER_VALUE
    || this.selectedPopularity() !== ALL_FILTER_VALUE,
  );

  readonly resultCount = computed(() =>
    this.hasClientFilters() ? this.filteredCharacters().length : this.totalItems(),
  );

  readonly linkedUniverseCount = computed(() => this.universeSummaries().length);

  readonly favoriteTotal = computed(() =>
    this.availableCharacters().reduce((total, character) => total + (character.favorites ?? 0), 0),
  );

  readonly activeFilterChips = computed<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];

    if (this.query().trim()) {
      chips.push({ key: 'query', label: `Recherche : ${this.query().trim()}`, removable: true });
    }

    chips.push(
      {
        key: 'universe',
        label: `Univers : ${this.selectedUniverseLabel()}`,
        removable: this.selectedUniverse() !== ALL_FILTER_VALUE,
      },
      {
        key: 'role',
        label: `Rôle : ${this.selectedRoleLabel()}`,
        removable: this.selectedRole() !== ALL_FILTER_VALUE,
      },
      {
        key: 'popularity',
        label: `Popularité : ${this.selectedPopularityLabel()}`,
        removable: this.selectedPopularity() !== ALL_FILTER_VALUE,
      },
      {
        key: 'sort',
        label: `Tri : ${this.selectedSortLabel()}`,
        removable: this.selectedSort() !== DEFAULT_SORT_VALUE,
      },
    );

    return chips;
  });

  ngOnInit(): void {
    this.recentCharacters.set(this.readRecentCharacters());
    this.loadPage(1);
    this.loadPopularCharacters();
  }

  ngOnDestroy(): void {
    this.cancelPendingSearch();
  }

  @HostListener('document:click')
  closeFloatingControls(): void {
    this.openFilterMenu.set(null);
    this.activeCardMenu.set(null);
  }

  @HostListener('document:keydown.escape')
  closeOverlayControls(): void {
    this.openFilterMenu.set(null);
    this.advancedFiltersOpen.set(false);
    this.activeCardMenu.set(null);
  }

  setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.scheduleSearch();
  }

  clearQuery(): void {
    if (!this.query().trim()) {
      return;
    }

    this.query.set('');
    this.loadPage(1, '');
  }

  loadMore(): void {
    if (!this.hasNextPage() || this.loading()) {
      return;
    }

    this.loadPage(this.page() + 1, this.query().trim(), true);
  }

  toggleFilterMenu(menu: CharacterFilterMenu, event?: Event): void {
    event?.stopPropagation();
    this.openFilterMenu.set(this.openFilterMenu() === menu ? null : menu);
  }

  selectUniverse(value: string): void {
    this.selectedUniverse.set(value);
    this.openFilterMenu.set(null);
  }

  selectRole(value: string): void {
    this.selectedRole.set(value);
    this.openFilterMenu.set(null);
  }

  selectPopularity(value: string): void {
    this.selectedPopularity.set(value);
    this.openFilterMenu.set(null);
  }

  selectSort(value: string): void {
    if (value === 'alphabetical' || value === 'recent' || value === 'popular') {
      this.selectedSort.set(value);
    }
    this.openFilterMenu.set(null);
  }

  toggleAdvancedFilters(): void {
    this.advancedFiltersOpen.update((isOpen) => !isOpen);
    this.openFilterMenu.set(null);
  }

  toggleAllUniverses(): void {
    this.showAllUniverses.update((isVisible) => !isVisible);
  }

  toggleCommunityActivity(): void {
    this.communityExpanded.update((isExpanded) => !isExpanded);
  }

  showTopCharacters(): void {
    this.selectedSort.set('popular');
    this.selectedPopularity.set(ALL_FILTER_VALUE);
    this.scrollToCatalog();
  }

  resetFilters(): void {
    const hadQuery = this.query().trim().length > 0;

    this.query.set('');
    this.selectedUniverse.set(ALL_FILTER_VALUE);
    this.selectedRole.set(ALL_FILTER_VALUE);
    this.selectedPopularity.set(ALL_FILTER_VALUE);
    this.selectedSort.set(DEFAULT_SORT_VALUE);
    this.openFilterMenu.set(null);

    if (hadQuery) {
      this.loadPage(1, '');
    }
  }

  removeFilterChip(chip: ActiveFilterChip): void {
    if (!chip.removable) {
      return;
    }

    if (chip.key === 'query') {
      this.clearQuery();
    } else if (chip.key === 'universe') {
      this.selectedUniverse.set(ALL_FILTER_VALUE);
    } else if (chip.key === 'role') {
      this.selectedRole.set(ALL_FILTER_VALUE);
    } else if (chip.key === 'popularity') {
      this.selectedPopularity.set(ALL_FILTER_VALUE);
    } else {
      this.selectedSort.set(DEFAULT_SORT_VALUE);
    }
  }

  toggleCardMenu(event: Event, character: CharacterCatalogEntry): void {
    event.preventDefault();
    event.stopPropagation();

    const identity = this.characterIdentity(character);
    this.activeCardMenu.set(this.activeCardMenu() === identity ? null : identity);
  }

  isCardMenuOpen(character: CharacterCatalogEntry): boolean {
    return this.activeCardMenu() === this.characterIdentity(character);
  }

  markAsRecent(event: Event, character: CharacterCatalogEntry): void {
    event.preventDefault();
    event.stopPropagation();
    this.rememberCharacter(character);
    this.activeCardMenu.set(null);
  }

  rememberCharacter(character: CharacterCatalogEntry): void {
    const identity = this.characterIdentity(character);
    const nextCharacters = [
      character,
      ...this.recentCharacters().filter((recent) => this.characterIdentity(recent) !== identity),
    ].slice(0, 6);

    this.recentCharacters.set(nextCharacters);
    this.writeRecentCharacters(nextCharacters);
  }

  clearRecentCharacters(): void {
    this.recentCharacters.set([]);
    this.removeRecentCharacters();
  }

  selectedUniverseLabel(): string {
    return this.universeOptions().find((option) => option.value === this.selectedUniverse())?.label ?? 'Tous';
  }

  selectedRoleLabel(): string {
    return this.roleOptions().find((option) => option.value === this.selectedRole())?.label ?? 'Tous';
  }

  selectedPopularityLabel(): string {
    return this.popularityOptions.find((option) => option.value === this.selectedPopularity())?.label ?? 'Toutes';
  }

  selectedSortLabel(): string {
    return this.sortOptions.find((option) => option.value === this.selectedSort())?.label ?? 'Popularité';
  }

  formatNumber(value: number | null | undefined): string {
    return (value ?? 0).toLocaleString('fr-FR').replace(/\s/g, ' ');
  }

  favoriteShortLabel(value: number | null | undefined): string {
    const favorites = value ?? 0;
    if (favorites >= 1_000_000) {
      return `${this.trimDecimal(favorites / 1_000_000)}M`;
    }

    if (favorites >= 1_000) {
      return `${this.trimDecimal(favorites / 1_000)}K`;
    }

    return this.formatNumber(favorites);
  }

  rankLabel(index: number): string {
    return String(index + 1);
  }

  featuredRankLabel(character: CharacterCatalogEntry): string {
    const rankIndex = this.topCharacters().findIndex((candidate) =>
      this.characterIdentity(candidate) === this.characterIdentity(character),
    );

    return rankIndex >= 0 ? `${rankIndex + 1}e` : '98e';
  }

  sourceLabel(character: CharacterCatalogEntry): string {
    return character.sourceAnimeTitle?.trim() || 'Origine inconnue';
  }

  roleLabel(character: CharacterCatalogEntry): string {
    return this.roleLabelValue(character.role);
  }

  roleClass(character: CharacterCatalogEntry): string {
    const role = this.normalizeFilterValue(character.role ?? '');

    if (role === 'principal' || role === 'main') {
      return 'main';
    }

    if (role === 'secondaire' || role === 'supporting') {
      return 'supporting';
    }

    if (role.includes('antagonist') || role.includes('villain')) {
      return 'antagonist';
    }

    if (role.includes('antagoniste')) {
      return 'antagonist';
    }

    if (role.includes('mascot')) {
      return 'mascot';
    }

    if (role.includes('mascotte')) {
      return 'mascot';
    }

    return role || 'unknown';
  }

  imageFor(character: CharacterCatalogEntry | null | undefined): string {
    const image = character?.imageUrl?.trim() ?? '';
    return this.isDisplayImageUrl(image) ? image : '';
  }

  characterAccentRgb(character: CharacterCatalogEntry): string {
    const identity = this.characterIdentity(character);
    return this.characterAccentColors()[identity] ?? this.fallbackAccentRgbForCharacter(character);
  }

  prepareCharacterAccentColor(character: CharacterCatalogEntry): void {
    const identity = this.characterIdentity(character);
    if (this.characterAccentColors()[identity] || this.accentColorRequests.has(identity)) {
      return;
    }

    const image = this.imageFor(character);
    if (!image) {
      this.setCharacterAccentColor(identity, this.fallbackAccentRgbForCharacter(character));
      return;
    }

    this.accentColorRequests.add(identity);

    this.characterCatalogService.getDominantImageColor(image).subscribe({
      next: (rgb) => {
        this.setCharacterAccentColor(identity, rgb ?? this.fallbackAccentRgbForCharacter(character));
      },
      error: () => {
        this.setCharacterAccentColor(identity, this.fallbackAccentRgbForCharacter(character));
        this.accentColorRequests.delete(identity);
      },
      complete: () => {
        this.accentColorRequests.delete(identity);
      },
    });
  }

  descriptionPreview(character: CharacterCatalogEntry, maxLength = 160): string {
    const about = character.about?.replace(/\s+/g, ' ').trim();
    if (!about && character.sourceAnimeTitle) {
      return `Personnage de ${character.sourceAnimeTitle}.`;
    }

    if (!about) {
      return 'Aucune description disponible.';
    }

    return about.length > maxLength ? `${about.slice(0, maxLength).trim()}...` : about;
  }

  trackCharacter(_index: number, character: CharacterCatalogEntry): string {
    return character.slug || String(character.malId);
  }

  trackUniverse(_index: number, universe: UniverseSummary): string {
    return universe.value;
  }

  trackActivity(_index: number, activity: CommunityActivityItem): string {
    return `${activity.actor}-${activity.slug}-${activity.timeLabel}`;
  }

  private loadPage(page: number, query = this.query().trim(), append = false): void {
    const requestId = ++this.searchRequestId;
    this.loading.set(true);
    this.errorMessage.set('');

    this.characterCatalogService.listCharacters(query, page, CHARACTER_PAGE_SIZE).subscribe({
      next: (result) => {
        if (requestId !== this.searchRequestId) {
          return;
        }

        this.characters.set(append ? [...this.characters(), ...result.items] : result.items);
        this.page.set(result.page);
        this.hasNextPage.set(result.hasNextPage);
        this.totalItems.set(result.totalItems);
        this.loading.set(false);
      },
      error: () => {
        if (requestId !== this.searchRequestId) {
          return;
        }

        this.errorMessage.set('Impossible de charger les personnages.');
        this.loading.set(false);
      },
    });
  }

  private loadPopularCharacters(): void {
    const requestId = ++this.popularRequestId;
    this.popularLoading.set(true);

    this.characterCatalogService.getPopularCharacters(POPULAR_CHARACTER_LIMIT).subscribe({
      next: (characters) => {
        if (requestId !== this.popularRequestId) {
          return;
        }

        this.popularCharactersSource.set(characters);
        this.popularLoading.set(false);
      },
      error: () => {
        if (requestId !== this.popularRequestId) {
          return;
        }

        this.popularCharactersSource.set([]);
        this.popularLoading.set(false);
      },
    });
  }

  private scheduleSearch(): void {
    this.cancelPendingSearch();
    this.searchDebounceId = setTimeout(() => {
      this.searchDebounceId = null;
      this.loadPage(1, this.query().trim());
    }, 350);
  }

  private cancelPendingSearch(): void {
    if (this.searchDebounceId !== null) {
      clearTimeout(this.searchDebounceId);
      this.searchDebounceId = null;
    }
  }

  private matchesSelectedFilters(character: CharacterCatalogEntry): boolean {
    if (this.selectedUniverse() !== ALL_FILTER_VALUE && character.sourceAnimeTitle !== this.selectedUniverse()) {
      return false;
    }

    if (
      this.selectedRole() !== ALL_FILTER_VALUE
      && this.roleClass(character) !== this.selectedRole()
    ) {
      return false;
    }

    if (this.selectedPopularity() !== ALL_FILTER_VALUE) {
      const minimumFavorites = Number(this.selectedPopularity());
      return (character.favorites ?? 0) >= minimumFavorites;
    }

    return true;
  }

  private sortCharacters(characters: CharacterCatalogEntry[]): CharacterCatalogEntry[] {
    const sortedCharacters = [...characters];

    if (this.selectedSort() === 'alphabetical') {
      return sortedCharacters.sort((first, second) => first.name.localeCompare(second.name, 'fr'));
    }

    if (this.selectedSort() === 'recent') {
      return sortedCharacters.sort((first, second) => this.syncTime(second) - this.syncTime(first));
    }

    return sortedCharacters.sort((first, second) => (second.favorites ?? 0) - (first.favorites ?? 0));
  }

  private countCharactersForRole(role: string): number {
    return this.availableCharacters().filter((character) => this.roleClass(character) === role).length;
  }

  private hasDisplayImage(character: CharacterCatalogEntry): boolean {
    return Boolean(this.imageFor(character));
  }

  private characterIdentity(character: CharacterCatalogEntry): string {
    return character.slug || String(character.malId);
  }

  private setCharacterAccentColor(identity: string, rgb: string): void {
    this.characterAccentColors.update((colors) => ({ ...colors, [identity]: rgb }));
  }

  private fallbackAccentRgbForCharacter(character: CharacterCatalogEntry): string {
    const key = character.slug || character.name;
    const hash = Array.from(key).reduce((value, characterToken) => (
      (value * 31 + characterToken.charCodeAt(0)) >>> 0
    ), 0);
    return this.fallbackAccentPalette[hash % this.fallbackAccentPalette.length];
  }

  private isDisplayImageUrl(imageUrl: string): boolean {
    if (!imageUrl) {
      return false;
    }

    const normalizedUrl = imageUrl.toLowerCase();
    return !normalizedUrl.includes('questionmark') && !normalizedUrl.includes('apple-touch-icon');
  }

  private roleLabelValue(role: string | null | undefined): string {
    const normalizedRole = this.normalizeFilterValue(role ?? '');

    if (normalizedRole === 'main' || normalizedRole === 'principal') {
      return 'Principal';
    }

    if (normalizedRole === 'supporting' || normalizedRole === 'secondaire') {
      return 'Secondaire';
    }

    if (
      normalizedRole.includes('antagonist')
      || normalizedRole.includes('villain')
      || normalizedRole.includes('antagoniste')
    ) {
      return 'Antagoniste';
    }

    if (normalizedRole.includes('mascot') || normalizedRole.includes('mascotte')) {
      return 'Mascotte';
    }

    return role?.trim() || 'Personnage';
  }

  private normalizeFilterValue(value: string): string {
    return value.trim().toLowerCase();
  }

  private trimDecimal(value: number): string {
    return value.toFixed(1).replace('.0', '');
  }

  private syncTime(character: CharacterCatalogEntry): number {
    if (!character.lastSyncedAt) {
      return 0;
    }

    const time = new Date(character.lastSyncedAt).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  private scrollToCatalog(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.getElementById('characters-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private readRecentCharacters(): CharacterCatalogEntry[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    const rawValue = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    try {
      const parsedValue: unknown = JSON.parse(rawValue);
      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((item) => this.normalizeStoredCharacter(item as Partial<CharacterCatalogEntry>))
        .filter((item): item is CharacterCatalogEntry => item !== null)
        .slice(0, 6);
    } catch {
      return [];
    }
  }

  private writeRecentCharacters(characters: CharacterCatalogEntry[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(characters.map((character) => ({
      malId: character.malId,
      slug: character.slug,
      name: character.name,
      nameKanji: character.nameKanji,
      imageUrl: character.imageUrl,
      favorites: character.favorites,
      about: character.about,
      nicknames: character.nicknames,
      sourceAnimeMalId: character.sourceAnimeMalId,
      sourceAnimeTitle: character.sourceAnimeTitle,
      sourceAnimeSlug: character.sourceAnimeSlug,
      sourceAnimeImageUrl: character.sourceAnimeImageUrl,
      role: character.role,
      lastSyncedAt: character.lastSyncedAt,
    }))));
  }

  private removeRecentCharacters(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.removeItem(RECENT_STORAGE_KEY);
  }

  private normalizeStoredCharacter(item: Partial<CharacterCatalogEntry>): CharacterCatalogEntry | null {
    if (typeof item.slug !== 'string' || typeof item.name !== 'string') {
      return null;
    }

    return {
      malId: typeof item.malId === 'number' ? item.malId : 0,
      slug: item.slug,
      name: item.name,
      nameKanji: typeof item.nameKanji === 'string' ? item.nameKanji : null,
      imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : '',
      favorites: typeof item.favorites === 'number' ? item.favorites : null,
      about: typeof item.about === 'string' ? item.about : '',
      nicknames: Array.isArray(item.nicknames)
        ? item.nicknames.filter((nickname): nickname is string => typeof nickname === 'string')
        : [],
      sourceAnimeMalId: typeof item.sourceAnimeMalId === 'number' ? item.sourceAnimeMalId : null,
      sourceAnimeTitle: typeof item.sourceAnimeTitle === 'string' ? item.sourceAnimeTitle : null,
      sourceAnimeSlug: typeof item.sourceAnimeSlug === 'string' ? item.sourceAnimeSlug : null,
      sourceAnimeImageUrl: typeof item.sourceAnimeImageUrl === 'string' ? item.sourceAnimeImageUrl : null,
      role: typeof item.role === 'string' ? item.role : null,
      lastSyncedAt: typeof item.lastSyncedAt === 'string' ? item.lastSyncedAt : null,
    };
  }
}
