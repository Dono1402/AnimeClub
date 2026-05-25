import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { Subscription, catchError, finalize, forkJoin, of } from 'rxjs';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { AnimethequeEntry, AnimethequeEntryRequest, WatchStatus } from '../models/animetheque.model';
import { MangaLibraryEntry, MangaLibraryEntryRequest } from '../models/manga.model';
import { PublicProfile } from '../models/public-profile.model';
import { FollowFeedEntry, FollowFeedLikeResponse } from '../models/social.model';
import { AnimethequeService } from '../services/animetheque.service';
import { AuthService } from '../services/auth.service';
import { MangaLibraryService } from '../services/manga-library.service';
import { ProfileService } from '../services/profile.service';
import { isMovieEntry } from '../utils/anime-format.util';

type SocialTab = 'following' | 'followers';
type FollowFeedFilter = 'all' | 'anime' | 'manga' | 'watching' | 'completed' | 'liked';
type FeedSort = 'recent' | 'popular' | 'progress' | 'profile';
type LibrarySaveState = 'saving' | 'saved' | 'error';

type FollowFeedItem = FollowFeedEntry & {
  justLiked?: boolean;
};

interface FeedFilterOption {
  value: FollowFeedFilter;
  label: string;
}

interface FeedSortOption {
  value: FeedSort;
  label: string;
}

interface FollowTrend {
  key: string;
  type: 'ANIME' | 'MANGA';
  title: string;
  coverUrl: string;
  adds: number;
  latestAt: string;
  route: string[];
  queryParams: { selection: string } | null;
}

const FEED_FILTERS: FeedFilterOption[] = [
  { value: 'all', label: 'Tout' },
  { value: 'anime', label: 'Animés' },
  { value: 'manga', label: 'Manga' },
  { value: 'watching', label: 'En cours' },
  { value: 'completed', label: 'Terminés' },
  { value: 'liked', label: 'Aimés' },
];

const FEED_SORTS: FeedSortOption[] = [
  { value: 'recent', label: 'Les plus récentes' },
  { value: 'popular', label: 'Les plus aimées' },
  { value: 'progress', label: 'Progression' },
  { value: 'profile', label: 'Par profil' },
];

const STATUS_LABELS: Record<WatchStatus, string> = {
  PLANNED: 'À voir',
  WATCHING: 'En cours',
  COMPLETED: 'Terminé',
  PAUSED: 'En pause',
  DROPPED: 'Abandonné',
};

const SUGGESTION_LIMIT_STEP = 3;
const PRESENCE_REFRESH_INTERVAL_MS = 15000;

@Component({
  selector: 'app-following-feed',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MenuBarComponent],
  templateUrl: './following-feed.component.html',
  styleUrl: './following-feed.component.scss',
})
export class FollowingFeedComponent implements OnInit, OnDestroy {
  private readonly animethequeService = inject(AnimethequeService);
  private readonly authService = inject(AuthService);
  private readonly mangaLibraryService = inject(MangaLibraryService);
  private readonly profileService = inject(ProfileService);
  private readonly route = inject(ActivatedRoute);

  readonly following = signal<PublicProfile[]>([]);
  readonly followers = signal<PublicProfile[]>([]);
  readonly publicProfiles = signal<PublicProfile[]>([]);
  readonly friends = signal<PublicProfile[]>([]);
  readonly ownAnimeEntries = signal<AnimethequeEntry[]>([]);
  readonly ownMangaEntries = signal<MangaLibraryEntry[]>([]);
  readonly feed = signal<FollowFeedItem[]>([]);
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly feedback = signal('');
  readonly actionFeedback = signal('');
  readonly activeTab = signal<SocialTab>('following');
  readonly feedFilter = signal<FollowFeedFilter>('all');
  readonly feedSort = signal<FeedSort>('recent');
  readonly profileSearch = signal('');
  readonly suggestionLimit = signal(SUGGESTION_LIMIT_STEP);
  readonly addAlsoStates = signal<Record<string, LibrarySaveState>>({});
  readonly followPendingIds = signal<Set<number>>(new Set());
  readonly presenceNow = signal(Date.now());
  readonly feedFilters = FEED_FILTERS;
  readonly feedSorts = FEED_SORTS;

  private readonly subscriptions = new Subscription();
  private pendingLikeKeys = new Set<string>();
  private likeAnimationTimerIds = new Map<string, number>();
  private presenceRefreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly activeProfiles = computed(() => (this.activeTab() === 'followers' ? this.followers() : this.following()));
  readonly filteredActiveProfiles = computed(() => {
    const query = this.normalizeSearch(this.profileSearch());
    const profiles = this.activeProfiles();

    if (!query) {
      return profiles;
    }

    return profiles.filter((profile) => this.profileMatchesSearch(profile, query));
  });
  readonly activeProfilesTitle = computed(() => {
    const profiles = this.activeProfiles();
    const filtered = this.filteredActiveProfiles();
    const label = this.activeTab() === 'followers' ? 'abonnés' : 'suivis';

    if (this.profileSearch().trim()) {
      return `${filtered.length}/${profiles.length} ${label}`;
    }

    return `${profiles.length} ${label}`;
  });
  readonly activeEmptyMessage = computed(() => {
    if (this.profileSearch().trim()) {
      return 'Aucun profil ne correspond à cette recherche.';
    }

    return this.activeTab() === 'followers'
      ? 'Personne ne suit encore ton profil.'
      : 'Tu ne suis encore personne. Utilise les suggestions à droite pour démarrer.';
  });
  readonly filteredFeed = computed(() => {
    const filtered = this.feed().filter((item) => this.matchesFeedFilter(item, this.feedFilter()));
    return this.sortFeedItems(filtered, this.feedSort());
  });
  readonly feedEmptyMessage = computed(() => {
    if (this.feed().length === 0) {
      return 'Aucune activité récente chez tes suivis.';
    }

    if (this.feedFilter() === 'liked') {
      return 'Aucune activité aimée pour le moment.';
    }

    return 'Aucune activité pour ce filtre.';
  });
  readonly onlineProfilesCount = computed(() => {
    this.presenceNow();
    return this.uniqueProfiles([...this.following(), ...this.followers()]).filter((profile) => this.profileIsOnline(profile)).length;
  });
  readonly latestActivityLabel = computed(() => {
    const [firstActivity] = this.sortFeedItems(this.feed(), 'recent');
    return firstActivity ? this.updatedAtLabel(firstActivity) : 'Aucune';
  });
  readonly trendItems = computed(() => this.computeTrends(this.feed()).slice(0, 3));
  readonly suggestedProfiles = computed(() => this.computeSuggestedProfiles().slice(0, this.suggestionLimit()));
  readonly hasMoreSuggestions = computed(() => this.computeSuggestedProfiles().length > this.suggestionLimit());
  readonly friendIds = computed(() => new Set(this.friends().map((profile) => profile.id)));

  ngOnInit(): void {
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        const tab = params.get('tab');
        this.activeTab.set(tab === 'followers' || tab === 'abonnes' ? 'followers' : 'following');
      }),
    );
    this.load();
    this.startPresenceRefresh();
  }

  ngOnDestroy(): void {
    this.stopPresenceRefresh();
    this.clearLikeAnimationTimers();
    this.subscriptions.unsubscribe();
  }

  load(): void {
    const account = this.authService.currentAccount();
    if (!account) {
      this.loading.set(false);
      this.refreshing.set(false);
      this.feedback.set('Connecte-toi pour voir tes suivis.');
      return;
    }

    const hasVisibleContent = this.feed().length > 0 || this.following().length > 0 || this.followers().length > 0;
    this.loading.set(!hasVisibleContent);
    this.refreshing.set(hasVisibleContent);
    this.feedback.set('');
    this.actionFeedback.set('');

    this.subscriptions.add(
      forkJoin({
        following: this.profileService.following(account.id).pipe(catchError(() => of([] as PublicProfile[]))),
        followers: this.profileService.followers(account.id).pipe(catchError(() => of([] as PublicProfile[]))),
        feed: this.profileService
          .followingFeed(account.id)
          .pipe(catchError(() => of(null as FollowFeedEntry[] | null))),
        publicProfiles: this.profileService.getPublicProfiles().pipe(catchError(() => of([] as PublicProfile[]))),
        friends: this.profileService.friends(account.id).pipe(catchError(() => of([] as PublicProfile[]))),
        ownAnimeEntries: this.animethequeService.list(account.id).pipe(catchError(() => of([] as AnimethequeEntry[]))),
        ownMangaEntries: this.mangaLibraryService.list(account.id).pipe(catchError(() => of([] as MangaLibraryEntry[]))),
      })
        .pipe(
          finalize(() => {
            this.loading.set(false);
            this.refreshing.set(false);
          }),
        )
        .subscribe(({
          following,
          followers,
          feed,
          publicProfiles,
          friends,
          ownAnimeEntries,
          ownMangaEntries,
        }) => {
          this.following.set(following);
          this.followers.set(followers);
          this.publicProfiles.set(publicProfiles);
          this.friends.set(friends);
          this.ownAnimeEntries.set(ownAnimeEntries);
          this.ownMangaEntries.set(ownMangaEntries);

          if (feed === null) {
            this.feed.set([]);
            this.feedback.set('Impossible de charger le fil des suivis.');
            return;
          }

          this.feed.set(feed);
        }),
    );
  }

  private startPresenceRefresh(): void {
    this.stopPresenceRefresh();
    this.presenceRefreshTimer = setInterval(() => {
      this.presenceNow.set(Date.now());
      this.refreshSocialPresence();
    }, PRESENCE_REFRESH_INTERVAL_MS);
  }

  private stopPresenceRefresh(): void {
    if (!this.presenceRefreshTimer) {
      return;
    }

    clearInterval(this.presenceRefreshTimer);
    this.presenceRefreshTimer = null;
  }

  private refreshSocialPresence(): void {
    const account = this.authService.currentAccount();
    if (!account || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
      return;
    }

    this.subscriptions.add(
      forkJoin({
        following: this.profileService.following(account.id).pipe(catchError(() => of(this.following()))),
        followers: this.profileService.followers(account.id).pipe(catchError(() => of(this.followers()))),
        friends: this.profileService.friends(account.id).pipe(catchError(() => of(this.friends()))),
      }).subscribe(({ following, followers, friends }) => {
        this.following.set(following);
        this.followers.set(followers);
        this.friends.set(friends);
      }),
    );
  }

  setFeedFilter(filter: FollowFeedFilter): void {
    this.feedFilter.set(filter);
  }

  setFeedSort(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as FeedSort;
    this.feedSort.set(value);
  }

  setProfileSearch(event: Event): void {
    this.profileSearch.set((event.target as HTMLInputElement).value);
  }

  clearProfileSearch(): void {
    this.profileSearch.set('');
  }

  showMoreSuggestions(): void {
    this.suggestionLimit.update((value) => value + SUGGESTION_LIMIT_STEP);
  }

  showTrendingFeed(): void {
    this.feedFilter.set('all');
    this.feedSort.set('popular');
  }

  followSuggestion(profile: PublicProfile): void {
    const account = this.authService.currentAccount();
    if (!account || this.isFollowPending(profile.id) || this.isFollowing(profile)) {
      return;
    }

    this.actionFeedback.set('');
    this.followPendingIds.update((ids) => new Set(ids).add(profile.id));

    this.subscriptions.add(
      this.profileService
        .follow(account.id, profile.id)
        .pipe(
          catchError(() => {
            this.actionFeedback.set('Impossible de suivre ce profil pour le moment.');
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

          this.following.update((profiles) => this.uniqueProfiles([profile, ...profiles]));
          this.publicProfiles.update((profiles) =>
            profiles.map((candidate) =>
              candidate.id === profile.id
                ? { ...candidate, followersCount: state.followersCount, followingCount: state.followingCount }
                : candidate,
            ),
          );
          this.actionFeedback.set(`${this.displayName(profile)} est maintenant dans tes suivis.`);
        }),
    );
  }

  addAlso(event: Event, item: FollowFeedItem): void {
    event.preventDefault();
    event.stopPropagation();

    const account = this.authService.currentAccount();
    const key = this.libraryItemKey(item);
    if (!account || !key || this.isAddedAlso(item) || this.addAlsoState(item) === 'saving') {
      return;
    }

    this.addAlsoStates.update((states) => ({ ...states, [key]: 'saving' }));
    this.actionFeedback.set('');

    if (item.type === 'MANGA' && item.mangaEntry) {
      this.subscriptions.add(
        this.mangaLibraryService
          .save(account.id, this.toMangaLibraryRequest(item.mangaEntry))
          .pipe(
            catchError(() => {
              this.setAddAlsoState(key, 'error');
              this.actionFeedback.set("Ajout impossible pour ce manga.");
              return of(null as MangaLibraryEntry | null);
            }),
          )
          .subscribe((entry) => {
            if (!entry) {
              return;
            }

            this.ownMangaEntries.update((entries) => [entry, ...entries.filter((candidate) => candidate.mangaSlug !== entry.mangaSlug)]);
            this.setAddAlsoState(key, 'saved');
            this.actionFeedback.set(`${entry.title} a été ajouté à ta Mangathèque.`);
          }),
      );
      return;
    }

    if (!item.entry) {
      this.setAddAlsoState(key, 'error');
      return;
    }

    this.subscriptions.add(
      this.animethequeService
        .save(account.id, this.toAnimeLibraryRequest(item.entry))
        .pipe(
          catchError(() => {
            this.setAddAlsoState(key, 'error');
            this.actionFeedback.set("Ajout impossible pour cet animé.");
            return of(null as AnimethequeEntry | null);
          }),
        )
        .subscribe((entry) => {
          if (!entry) {
            return;
          }

          this.ownAnimeEntries.update((entries) => [entry, ...entries.filter((candidate) => candidate.animeSlug !== entry.animeSlug)]);
          this.setAddAlsoState(key, 'saved');
          this.actionFeedback.set(`${entry.title} a été ajouté à ton Animethèque.`);
        }),
    );
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

    return `@${profile.pseudo}`;
  }

  profileSocialLine(profile: PublicProfile): string {
    return this.countLabel(profile.followersCount, 'abonné', 'abonnés');
  }

  profileIsOnline(profile: PublicProfile): boolean {
    this.presenceNow();
    return Boolean(profile.online);
  }

  profilePresenceState(profile: PublicProfile): 'online' | 'offline' {
    return this.profileIsOnline(profile) ? 'online' : 'offline';
  }

  profileActivityLabel(profile: PublicProfile): string {
    if (this.profileIsOnline(profile)) {
      return 'En ligne';
    }

    if (!profile.lastActiveAt) {
      return 'Hors ligne';
    }

    return `Vu ${this.relativeTimeLabel(profile.lastActiveAt)}`;
  }

  canMessage(profile: PublicProfile): boolean {
    return this.friendIds().has(profile.id);
  }

  isFollowPending(profileId: number): boolean {
    return this.followPendingIds().has(profileId);
  }

  isFollowing(profile: PublicProfile): boolean {
    return this.following().some((followedProfile) => followedProfile.id === profile.id);
  }

  profileTabCount(tab: SocialTab): number {
    return tab === 'followers' ? this.followers().length : this.following().length;
  }

  feedFilterCount(filter: FollowFeedFilter): number {
    return this.feed().filter((item) => this.matchesFeedFilter(item, filter)).length;
  }

  itemKey(item: FollowFeedEntry): string {
    const entryId = item.type === 'MANGA' ? item.mangaEntry?.id : item.entry?.id;
    return `${item.profile.id}-${item.type}-${entryId ?? 'empty'}`;
  }

  itemRoute(item: FollowFeedEntry): string[] {
    if (item.type === 'MANGA') {
      return ['/manga'];
    }

    return item.entry ? this.animeRoute(item.entry) : ['/animes'];
  }

  itemQueryParams(item: FollowFeedEntry): { selection: string } | null {
    return item.type === 'MANGA' && item.mangaEntry ? { selection: item.mangaEntry.mangaSlug } : null;
  }

  itemCoverUrl(item: FollowFeedEntry): string {
    return item.type === 'MANGA' ? item.mangaEntry?.coverUrl ?? '' : item.entry?.coverUrl ?? '';
  }

  itemTitle(item: FollowFeedEntry): string {
    return item.type === 'MANGA' ? item.mangaEntry?.title ?? 'Manga' : item.entry?.title ?? 'Anime';
  }

  itemTypeLabel(item: FollowFeedEntry): string {
    return item.type === 'MANGA' ? 'Manga' : item.entry && isMovieEntry(item.entry) ? 'Film' : 'Anime';
  }

  itemStatusLabel(item: FollowFeedEntry): string {
    if (this.isFavoriteActivity(item)) {
      return 'Ajouté aux favoris';
    }

    const score = this.itemScore(item);
    if (score !== null) {
      return `Noté ${score}/10`;
    }

    const status = this.itemStatus(item);
    return status ? STATUS_LABELS[status] : 'Activité';
  }

  itemStatusClass(item: FollowFeedEntry): string {
    if (this.isFavoriteActivity(item)) {
      return 'status-favorite';
    }

    if (this.itemScore(item) !== null) {
      return 'status-rated';
    }

    return `status-${(this.itemStatus(item) ?? 'activity').toLowerCase()}`;
  }

  activityVerb(item: FollowFeedEntry): string {
    const status = this.itemStatus(item);
    const mediaLabel = item.type === 'MANGA' ? 'ce manga' : item.entry && isMovieEntry(item.entry) ? 'ce film' : 'cet animé';

    if (this.isFavoriteActivity(item)) {
      return `a ajouté ${mediaLabel} à ses favoris`;
    }

    const score = this.itemScore(item);
    if (score !== null) {
      return `a noté ${mediaLabel}`;
    }

    if (item.type === 'MANGA') {
      if (status === 'COMPLETED') {
        return 'a terminé ce manga';
      }

      if (status === 'PLANNED') {
        return 'prévoit de lire ce manga';
      }

      if (status === 'PAUSED') {
        return 'a mis ce manga en pause';
      }

      if (status === 'DROPPED') {
        return 'a abandonné ce manga';
      }

      return 'a commencé ce manga';
    }

    if (item.entry && isMovieEntry(item.entry)) {
      return status === 'COMPLETED' || item.entry.watchedEpisodes > 0
        ? 'a terminé ce film'
        : 'prévoit de voir ce film';
    }

    if (status === 'COMPLETED') {
      return 'a terminé cette série';
    }

    if (status === 'PLANNED') {
      return 'prévoit de voir cet animé';
    }

    if (status === 'PAUSED') {
      return 'a mis cet animé en pause';
    }

    if (status === 'DROPPED') {
      return 'a abandonné cet animé';
    }

    return 'a commencé cet animé';
  }

  progressLabel(item: FollowFeedEntry): string {
    if (item.type === 'MANGA' && item.mangaEntry) {
      return this.mangaProgressLabel(item.mangaEntry);
    }

    return item.entry ? this.animeProgressLabel(item.entry) : '';
  }

  activityEntryId(item: FollowFeedEntry): number | null {
    return Number(item.activityEntryId ?? (item.type === 'MANGA' ? item.mangaEntry?.id : item.entry?.id) ?? 0) || null;
  }

  likeCount(item: FollowFeedEntry): number {
    return Math.max(0, Number(item.likesCount ?? 0));
  }

  progressPercent(item: FollowFeedEntry): number {
    if (item.type === 'MANGA' && item.mangaEntry) {
      return this.ratioPercent(item.mangaEntry.readVolumes, item.mangaEntry.totalVolumes);
    }

    if (!item.entry) {
      return 0;
    }

    if (isMovieEntry(item.entry)) {
      return item.entry.status === 'COMPLETED' || item.entry.watchedEpisodes > 0 ? 100 : 0;
    }

    return this.ratioPercent(item.entry.watchedEpisodes, item.entry.totalEpisodes);
  }

  itemScore(item: FollowFeedEntry): number | null {
    const rawScore = item.type === 'MANGA' ? item.mangaEntry?.score : item.entry?.score;
    const score = Number(rawScore ?? 0);
    return score > 0 ? score : null;
  }

  isFavoriteActivity(item: FollowFeedEntry): boolean {
    return Boolean(item.type === 'MANGA' ? item.mangaEntry?.favorite : item.entry?.favorite);
  }

  addAlsoState(item: FollowFeedEntry): LibrarySaveState | null {
    const key = this.libraryItemKey(item);
    return key ? this.addAlsoStates()[key] ?? null : null;
  }

  isAddedAlso(item: FollowFeedEntry): boolean {
    if (item.type === 'MANGA' && item.mangaEntry) {
      return this.ownMangaEntries().some((entry) => entry.mangaSlug === item.mangaEntry?.mangaSlug);
    }

    if (!item.entry) {
      return false;
    }

    return this.ownAnimeEntries().some((entry) => entry.animeSlug === item.entry?.animeSlug);
  }

  addAlsoButtonLabel(item: FollowFeedEntry): string {
    if (this.isAddedAlso(item) || this.addAlsoState(item) === 'saved') {
      return 'Déjà ajouté';
    }

    if (this.addAlsoState(item) === 'saving') {
      return 'Ajout...';
    }

    if (this.addAlsoState(item) === 'error') {
      return 'Réessayer';
    }

    return 'Ajouter aussi';
  }

  toggleFeedLike(event: Event, item: FollowFeedItem): void {
    event.preventDefault();
    event.stopPropagation();

    const account = this.authService.currentAccount();
    const entryId = this.activityEntryId(item);
    if (!account || entryId === null) {
      return;
    }

    const likeKey = this.activityLikeKey(item.type, entryId);
    if (this.pendingLikeKeys.has(likeKey)) {
      return;
    }

    const previousLiked = Boolean(item.likedByCurrentAccount);
    const previousLikes = this.likeCount(item);
    const nextLiked = !previousLiked;
    const nextLikes = Math.max(0, previousLikes + (nextLiked ? 1 : -1));

    this.pendingLikeKeys.add(likeKey);
    this.applyLikeState(item.type, entryId, nextLiked, nextLikes, nextLiked);

    this.subscriptions.add(
      this.profileService
        .toggleFollowingFeedLike(account.id, { type: item.type, entryId })
        .pipe(
          catchError(() => {
            this.applyLikeState(item.type, entryId, previousLiked, previousLikes, false);
            return of(null as FollowFeedLikeResponse | null);
          }),
          finalize(() => this.pendingLikeKeys.delete(likeKey)),
        )
        .subscribe((response) => {
          if (!response) {
            return;
          }

          this.applyLikeState(
            response.type,
            response.entryId,
            response.likedByCurrentAccount,
            response.likesCount,
            response.likedByCurrentAccount,
          );
        }),
    );
  }

  updatedAtLabel(item: FollowFeedEntry): string {
    return this.relativeTimeLabel(item.updatedAt);
  }

  trendTimeLabel(trend: FollowTrend): string {
    return this.relativeTimeLabel(trend.latestAt);
  }

  private animeRoute(entry: AnimethequeEntry): string[] {
    if (entry.trackingMode === 'SEASON' && entry.parentAnimeSlug && entry.seasonSlug) {
      return ['/animes', entry.parentAnimeSlug, 'seasons', entry.seasonSlug];
    }

    return ['/animes', entry.parentAnimeSlug || entry.animeSlug];
  }

  private animeProgressLabel(entry: AnimethequeEntry): string {
    if (isMovieEntry(entry)) {
      return entry.status === 'COMPLETED' || entry.watchedEpisodes > 0 ? 'Film terminé' : 'Film non terminé';
    }

    const total = entry.totalEpisodes > 0 ? entry.totalEpisodes : '?';
    return `${entry.watchedEpisodes}/${total} épisodes`;
  }

  private mangaProgressLabel(entry: MangaLibraryEntry): string {
    const total = entry.totalVolumes > 0 ? entry.totalVolumes : '?';
    return `${entry.readVolumes}/${total} tomes`;
  }

  private itemStatus(item: FollowFeedEntry): WatchStatus | null {
    if (item.type === 'MANGA') {
      return item.mangaEntry?.status ?? null;
    }

    return item.entry?.status ?? null;
  }

  private matchesFeedFilter(item: FollowFeedEntry, filter: FollowFeedFilter): boolean {
    if (filter === 'all') {
      return true;
    }

    if (filter === 'anime') {
      return item.type === 'ANIME';
    }

    if (filter === 'manga') {
      return item.type === 'MANGA';
    }

    if (filter === 'liked') {
      return Boolean(item.likedByCurrentAccount);
    }

    const status = this.itemStatus(item);
    return filter === 'completed' ? status === 'COMPLETED' : status === 'WATCHING';
  }

  private sortFeedItems(items: FollowFeedItem[], sort: FeedSort): FollowFeedItem[] {
    const sorted = [...items];

    if (sort === 'popular') {
      return sorted.sort((left, right) =>
        this.likeCount(right) - this.likeCount(left) || this.updatedTimestamp(right) - this.updatedTimestamp(left),
      );
    }

    if (sort === 'progress') {
      return sorted.sort((left, right) =>
        this.progressPercent(right) - this.progressPercent(left) || this.updatedTimestamp(right) - this.updatedTimestamp(left),
      );
    }

    if (sort === 'profile') {
      return sorted.sort((left, right) =>
        this.displayName(left.profile).localeCompare(this.displayName(right.profile), 'fr') ||
        this.updatedTimestamp(right) - this.updatedTimestamp(left),
      );
    }

    return sorted.sort((left, right) => this.updatedTimestamp(right) - this.updatedTimestamp(left));
  }

  private computeTrends(items: FollowFeedItem[]): FollowTrend[] {
    const trends = new Map<string, FollowTrend>();

    items
      .filter((item) => item.type === 'ANIME')
      .forEach((item) => {
        if (!item.entry) {
          return;
        }

        const key = `${item.type}:${item.entry.parentAnimeSlug || item.entry.animeSlug}`;
        const existing = trends.get(key);
        const latestAt = existing && this.timestamp(existing.latestAt) > this.updatedTimestamp(item)
          ? existing.latestAt
          : item.updatedAt;

        trends.set(key, {
          key,
          type: item.type,
          title: item.entry.parentTitle || item.entry.title,
          coverUrl: item.entry.coverUrl,
          adds: (existing?.adds ?? 0) + 1,
          latestAt,
          route: this.animeRoute(item.entry),
          queryParams: null,
        });
      });

    return [...trends.values()].sort((left, right) =>
      right.adds - left.adds || this.timestamp(right.latestAt) - this.timestamp(left.latestAt),
    );
  }

  private computeSuggestedProfiles(): PublicProfile[] {
    const accountId = this.authService.currentAccount()?.id;
    const followingIds = new Set(this.following().map((profile) => profile.id));
    const knownTitles = new Set(
      this.trendItems()
        .map((trend) => this.normalizeSearch(trend.title))
        .filter(Boolean),
    );

    return this.publicProfiles()
      .filter((profile) => profile.id !== accountId && !followingIds.has(profile.id))
      .sort((left, right) =>
        this.profileSuggestionScore(right, knownTitles) - this.profileSuggestionScore(left, knownTitles) ||
        Number(this.profileIsOnline(right)) - Number(this.profileIsOnline(left)) ||
        right.followersCount - left.followersCount ||
        this.displayName(left).localeCompare(this.displayName(right), 'fr'),
      );
  }

  private profileSuggestionScore(profile: PublicProfile, knownTitles: Set<string>): number {
    const favorite = this.normalizeSearch(profile.favoriteAnime);
    const status = this.normalizeSearch(profile.profileStatus);
    const sharedFavorite = favorite && [...knownTitles].some((title) => title.includes(favorite) || favorite.includes(title));
    const sharedStatus = status && [...knownTitles].some((title) => status.includes(title));

    return (sharedFavorite ? 8 : 0) + (sharedStatus ? 3 : 0) + (this.profileIsOnline(profile) ? 2 : 0) + Math.min(5, profile.followersCount / 5);
  }

  private applyLikeState(
    type: 'ANIME' | 'MANGA',
    entryId: number,
    liked: boolean,
    likesCount: number,
    animate: boolean,
  ): void {
    this.feed.update((items) =>
      items.map((item) =>
        item.type === type && this.activityEntryId(item) === entryId
          ? {
              ...item,
              likedByCurrentAccount: liked,
              likesCount: Math.max(0, Number(likesCount || 0)),
              justLiked: animate && liked,
            }
          : item,
      ),
    );

    if (animate && liked) {
      this.clearLikeAnimation(type, entryId);
    }
  }

  private clearLikeAnimation(type: 'ANIME' | 'MANGA', entryId: number): void {
    if (typeof window === 'undefined') {
      return;
    }

    const key = this.activityLikeKey(type, entryId);
    const existingTimerId = this.likeAnimationTimerIds.get(key);
    if (existingTimerId !== undefined) {
      window.clearTimeout(existingTimerId);
    }

    const timerId = window.setTimeout(() => {
      this.feed.update((items) =>
        items.map((item) =>
          item.type === type && this.activityEntryId(item) === entryId ? { ...item, justLiked: false } : item,
        ),
      );
      this.likeAnimationTimerIds.delete(key);
    }, 620);

    this.likeAnimationTimerIds.set(key, timerId);
  }

  private activityLikeKey(type: 'ANIME' | 'MANGA', entryId: number): string {
    return `${type}-${entryId}`;
  }

  private clearLikeAnimationTimers(): void {
    if (typeof window !== 'undefined') {
      this.likeAnimationTimerIds.forEach((timerId) => window.clearTimeout(timerId));
    }

    this.likeAnimationTimerIds.clear();
  }

  private libraryItemKey(item: FollowFeedEntry): string | null {
    if (item.type === 'MANGA' && item.mangaEntry) {
      return `MANGA:${item.mangaEntry.mangaSlug}`;
    }

    if (item.type === 'ANIME' && item.entry) {
      return `ANIME:${item.entry.animeSlug}`;
    }

    return null;
  }

  private setAddAlsoState(key: string, state: LibrarySaveState): void {
    this.addAlsoStates.update((states) => ({ ...states, [key]: state }));
  }

  private toAnimeLibraryRequest(entry: AnimethequeEntry): AnimethequeEntryRequest {
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
      status: 'PLANNED',
      watchedEpisodes: 0,
      totalEpisodes: Math.max(0, Number(entry.totalEpisodes || 0)),
      score: null,
      favorite: false,
      notes: '',
    };
  }

  private toMangaLibraryRequest(entry: MangaLibraryEntry): MangaLibraryEntryRequest {
    return {
      mangaSlug: entry.mangaSlug,
      title: entry.title,
      coverUrl: entry.coverUrl,
      status: 'PLANNED',
      readChapters: 0,
      totalChapters: Math.max(0, Number(entry.totalChapters || 0)),
      readVolumes: 0,
      totalVolumes: Math.max(0, Number(entry.totalVolumes || 0)),
      score: null,
      favorite: false,
      notes: '',
      catalogType: entry.catalogType ?? null,
      catalogScore: entry.catalogScore ?? null,
      catalogYear: entry.catalogYear ?? null,
      catalogGenres: entry.catalogGenres ?? [],
      catalogAuthors: entry.catalogAuthors ?? [],
    };
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

  private relativeTimeLabel(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      return '';
    }

    const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) {
      return "à l'instant";
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `il y a ${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `il y a ${hours} h`;
    }

    const days = Math.floor(hours / 24);
    if (days === 1) {
      return 'hier';
    }

    if (days < 7) {
      return `il y a ${days} j`;
    }

    return new Intl.DateTimeFormat('fr-BE', {
      day: '2-digit',
      month: 'short',
    }).format(new Date(timestamp));
  }

  private ratioPercent(value: number, total: number): number {
    if (total <= 0) {
      return 0;
    }

    return Math.min(100, Math.max(0, (value / total) * 100));
  }

  private countLabel(count: number, singular: string, plural: string): string {
    const safeCount = Math.max(0, Number(count || 0));
    return `${safeCount} ${safeCount > 1 ? plural : singular}`;
  }

  private uniqueProfiles(profiles: PublicProfile[]): PublicProfile[] {
    return Array.from(new Map(profiles.map((profile) => [profile.id, profile])).values());
  }

  private updatedTimestamp(item: FollowFeedEntry): number {
    return this.timestamp(item.updatedAt);
  }

  private timestamp(value: string | null | undefined): number {
    const timestamp = Date.parse(value ?? '');
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
}
