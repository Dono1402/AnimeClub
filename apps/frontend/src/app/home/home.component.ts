import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, Subscription, catchError, finalize, forkJoin, map, of } from 'rxjs';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { Account } from '../models/account.model';
import { PopularAnime, PopularAnimePage } from '../models/anime.model';
import { AnimethequeEntry } from '../models/animetheque.model';
import { MangaLibraryEntry } from '../models/manga.model';
import { PublicProfile } from '../models/public-profile.model';
import { FollowFeedEntry, FollowFeedLikeResponse } from '../models/social.model';
import { AnimeCatalogService } from '../services/anime-catalog.service';
import { AnimethequeService } from '../services/animetheque.service';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';

type HeroSlide = {
  title: string;
  subtitle: string;
  synopsis: string;
  image: string;
  link: string;
  tags: string[];
  copyright: string;
};

type HomeLibraryCard = {
  id: number;
  title: string;
  subtitle: string;
  image: string;
  route: string[];
  watched: number;
  total: number;
  progress: number;
};

type HomeAnimeCard = {
  id: number;
  title: string;
  subtitle: string;
  image: string;
  route: string[];
  score: number | null;
};

type HomeSpotlightKind = 'catchup' | 'sequel' | 'hidden' | 'profile';

type HomeSpotlightCard = HomeAnimeCard & {
  badge: string;
  reason: string;
  kind: HomeSpotlightKind;
};

type HomeActivityCard = {
  id: string;
  profile: PublicProfile;
  profileName: string;
  avatarUrl: string | null;
  initials: string;
  action: string;
  title: string;
  subtitle: string;
  image: string;
  route: string[];
  queryParams: Record<string, string> | null;
  timeLabel: string;
  isNew: boolean;
  activityType: 'ANIME' | 'MANGA';
  activityEntryId: number | null;
  liked: boolean;
  likes: number;
  justLiked: boolean;
};

type HomeCollectionCard = {
  title: string;
  subtitle: string;
  image: string;
  route: string[];
  queryParams: Record<string, string> | null;
};

type SpotlightProfileContext = {
  active: boolean;
  libraryKeys: Set<string>;
  libraryBaseKeys: Set<string>;
  genreScores: Map<string, number>;
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, MenuBarComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly animethequeService = inject(AnimethequeService);
  private readonly animeCatalogService = inject(AnimeCatalogService);
  private readonly profileService = inject(ProfileService);
  private readonly heroAutoplayDelayMs = 4000;
  private readonly activityFeedRefreshMs = 10000;
  private heroAutoplayTimerId: number | null = null;
  private activityFeedTimerId: number | null = null;
  private readonly subscriptions = new Subscription();
  private knownActivityIds = new Set<string>();
  private pendingActivityLikeKeys = new Set<string>();
  private likeAnimationTimerIds = new Map<string, number>();
  private catalogSpotlightPool: PopularAnime[] = [];
  private weeklyRankingSpotlightPool: PopularAnime[] = [];
  private popularSpotlightPool: PopularAnime[] = [];
  private scoredSpotlightPool: PopularAnime[] = [];
  private profileLibraryEntries: AnimethequeEntry[] = [];
  private profileGenreScores = new Map<string, number>();
  private profileSpotlightRequestId = 0;

  readonly heroSlides: HeroSlide[] = [
    {
      title: 'MADOKA MAGICA',
      subtitle: 'Walpurgisnacht: Rising arrive bientôt',
      synopsis:
        "Après les événements de Rebellion, l'histoire de Madoka et Homura reprend dans un nouveau chapitre inédit. Le retour tant attendu des Puella Magi est annoncé au Japon pour le 28 août 2026.",
      image: 'assets/home-hero/madoka-walpurgisnacht-rising-hero.jpg',
      link: '/animes/mal-48820',
      tags: ['Film', 'Suite', '28 août 2026'],
      copyright: '© Magica Quartet / Aniplex, Madoka Project',
    },
    {
      title: 'FRIEREN',
      subtitle: 'Le voyage continue au-delà des souvenirs',
      synopsis:
        "Frieren, Fern et Stark reprennent leur route vers le nord. Entre nouvelles rencontres et souvenirs laissés par Himmel, leur voyage révèle combien le temps transforme les liens et les promesses.",
      image: 'assets/home-hero/frieren-season-2-hero.jpg',
      link: '/animes/mal-59978',
      tags: ['Saison 2', 'Fantasy', '2026'],
      copyright: '© Kanehito Yamada, Tsukasa Abe / Shogakukan',
    },
    {
      title: 'Call of the Night',
      subtitle: 'La nuit commence vraiment',
      synopsis:
        "Ko Yamori erre dans les rues pour fuir son quotidien et croise Nazuna, une vampire libre et imprévisible. Pour devenir comme elle, il devra comprendre ce que signifie tomber amoureux.",
      image: 'assets/home-hero/call-of-the-night-hero.jpg',
      link: '/animes/mal-50346',
      tags: ['VO', 'Romance', 'HD'],
      copyright: '© Kotoyama / Shogakukan',
    },
    {
      title: 'Kaiju N°8',
      subtitle: "Monstres géants, unité d'élite",
      synopsis:
        "Kafka Hibino rêve de rejoindre les forces anti-kaiju. Après un incident impossible, il obtient une puissance monstrueuse qui pourrait faire de lui l'arme la plus dangereuse du front.",
      image: 'assets/home-hero/kaiju-no-8-hero.jpg',
      link: '/animes/mal-52588',
      tags: ['VO', 'Action', 'HD'],
      copyright: '© Naoya Matsumoto / Shueisha',
    },
    {
      title: 'Wind Breaker',
      subtitle: 'La baston comme langage',
      synopsis:
        "Haruka débarque dans un lycée réputé pour ses combattants. Il cherche le sommet, mais découvre une bande qui protège son quartier avec les poings et un code bien à elle.",
      image: 'assets/home-hero/wind-breaker-hero.jpg',
      link: '/animes/mal-54900',
      tags: ['VO', 'Baston', 'HD'],
      copyright: '© Satoru Nii / Kodansha',
    },
    {
      title: 'Blue Lock',
      subtitle: 'La sélection des attaquants',
      synopsis:
        "Trois cents joueurs sont enfermés dans un centre d'entraînement brutal pour créer l'attaquant ultime. Ici, l'ego compte autant que le talent.",
      image: 'assets/home-hero/blue-lock-hero.jpg',
      link: '/animes/mal-49596',
      tags: ['VO', 'Sport', 'HD'],
      copyright: '© Muneyuki Kaneshiro, Yusuke Nomura / Kodansha',
    },
    {
      title: 'Oshi No Ko',
      subtitle: "L'envers brutal des idoles",
      synopsis:
        "Derrière les lumières de la scène, l'industrie du divertissement cache mensonges, pression et vengeance. Une série brillante, sombre et très addictive.",
      image: 'assets/home-hero/oshi-no-ko-hero.jpg',
      link: '/animes/mal-52034',
      tags: ['VO', 'Drame', 'HD'],
      copyright: '© Aka Akasaka, Mengo Yokoyari / Shueisha',
    },
  ];

  readonly activeHeroIndex = signal(0);
  readonly activeHero = computed(() => this.heroSlides[this.activeHeroIndex()] ?? this.heroSlides[0]);
  readonly account = signal<Account | null>(this.authService.currentAccount());
  readonly continueCards = signal<HomeLibraryCard[]>([]);
  readonly topWeekCards = signal<HomeAnimeCard[]>([]);
  readonly followingActivityCards = signal<HomeActivityCard[]>([]);
  readonly spotlightCards = signal<HomeSpotlightCard[]>([]);
  readonly spotlightHeading = signal('Sélections du moment');
  readonly catalogLoading = signal(true);
  readonly personalLoading = signal(false);
  readonly collectionCards: HomeCollectionCard[] = [
    {
      title: 'Nouveautés printemps',
      subtitle: 'Séries récentes',
      image: 'assets/home-hero/dan-da-dan-hero.jpg',
      route: ['/animes'],
      queryParams: { sort: 'popularity-asc' },
    },
    {
      title: 'Chefs-d’œuvre incontournables',
      subtitle: 'Classiques et mieux notés',
      image: 'assets/home-hero/oshi-no-ko-hero.jpg',
      route: ['/animes'],
      queryParams: { sort: 'rank-asc' },
    },
    {
      title: 'Univers sombres',
      subtitle: 'Action, mystère, tension',
      image: 'assets/home-hero/dorohedoro-hero.jpg',
      route: ['/animes'],
      queryParams: { genre: 'Action' },
    },
    {
      title: 'Voyages & découvertes',
      subtitle: 'Aventure et grands mondes',
      image: 'assets/home-hero/blue-lock-hero.jpg',
      route: ['/animes'],
      queryParams: { genre: 'Adventure' },
    },
  ];

  constructor() {
    this.startHeroAutoplay();
  }

  ngOnInit(): void {
    this.loadCatalogSections();
    this.subscriptions.add(
      this.authService.account$.subscribe((account) => {
        this.account.set(account);
        this.loadPersonalSections(account);
      }),
    );
  }

  ngOnDestroy(): void {
    this.stopHeroAutoplay();
    this.stopActivityFeedRefresh();
    this.clearActivityLikeAnimationTimers();
    this.subscriptions.unsubscribe();
  }

  heroBackground(slide: HeroSlide): string {
    return `url("${slide.image}")`;
  }

  selectHero(index: number): void {
    if (index < 0 || index >= this.heroSlides.length) {
      return;
    }

    this.activeHeroIndex.set(index);
    this.restartHeroAutoplay();
  }

  previousHero(): void {
    this.activeHeroIndex.update((index) => (index - 1 + this.heroSlides.length) % this.heroSlides.length);
    this.restartHeroAutoplay();
  }

  nextHero(): void {
    this.advanceHero();
    this.restartHeroAutoplay();
  }

  scoreLabel(score: number | null): string {
    return score === null ? '' : score.toLocaleString('fr-BE', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  }

  toggleActivityLike(event: Event, card: HomeActivityCard): void {
    event.preventDefault();
    event.stopPropagation();

    const account = this.account();
    if (!account || card.activityEntryId === null) {
      return;
    }

    const activityEntryId = card.activityEntryId;
    const likeKey = this.activityLikeKey(card.activityType, activityEntryId);
    if (this.pendingActivityLikeKeys.has(likeKey)) {
      return;
    }

    const previousLiked = card.liked;
    const previousLikes = card.likes;
    const nextLiked = !card.liked;
    const nextLikes = Math.max(0, card.likes + (nextLiked ? 1 : -1));

    this.pendingActivityLikeKeys.add(likeKey);
    this.applyActivityLikeState(card.activityType, activityEntryId, nextLiked, nextLikes, nextLiked);

    this.subscriptions.add(
      this.profileService
        .toggleFollowingFeedLike(account.id, { type: card.activityType, entryId: activityEntryId })
        .pipe(
          catchError(() => {
            this.applyActivityLikeState(card.activityType, activityEntryId, previousLiked, previousLikes, false);
            return of(null as FollowFeedLikeResponse | null);
          }),
          finalize(() => this.pendingActivityLikeKeys.delete(likeKey)),
        )
        .subscribe((response) => {
          if (!response) {
            return;
          }

          this.applyActivityLikeState(
            response.type,
            response.entryId,
            response.likedByCurrentAccount,
            response.likesCount,
            response.likedByCurrentAccount,
          );
        }),
    );
  }

  private advanceHero(): void {
    this.activeHeroIndex.update((index) => (index + 1) % this.heroSlides.length);
  }

  private startHeroAutoplay(): void {
    if (typeof window === 'undefined' || this.heroSlides.length < 2 || this.heroAutoplayTimerId !== null) {
      return;
    }

    this.heroAutoplayTimerId = window.setInterval(() => this.advanceHero(), this.heroAutoplayDelayMs);
  }

  private stopHeroAutoplay(): void {
    if (typeof window === 'undefined' || this.heroAutoplayTimerId === null) {
      return;
    }

    window.clearInterval(this.heroAutoplayTimerId);
    this.heroAutoplayTimerId = null;
  }

  private restartHeroAutoplay(): void {
    this.stopHeroAutoplay();
    this.startHeroAutoplay();
  }

  private loadCatalogSections(): void {
    this.catalogLoading.set(true);
    this.subscriptions.add(
      this.animeCatalogService
        .getWeeklyAnimeRanking(10)
        .pipe(catchError(() => of(this.emptyAnimePage(1))))
        .subscribe((topRanking) => {
          this.weeklyRankingSpotlightPool = topRanking.items;
          this.topWeekCards.set(topRanking.items.slice(0, 10).map((anime) => this.toAnimeCard(anime)));
          this.refreshCatalogSpotlightPool();
          this.catalogLoading.set(false);
        }),
    );

    this.subscriptions.add(
      forkJoin({
        popular: this.animeCatalogService
          .getPopularAnime(1, 'popularity-asc', {}, false)
          .pipe(catchError(() => of(this.emptyAnimePage(1)))),
        scored: this.animeCatalogService
          .getPopularAnime(1, 'score-desc', {}, false)
          .pipe(catchError(() => of(this.emptyAnimePage(1)))),
      }).subscribe(({ popular, scored }) => {
        this.popularSpotlightPool = popular.items;
        this.scoredSpotlightPool = scored.items;
        this.refreshCatalogSpotlightPool();
      }),
    );
  }

  private refreshCatalogSpotlightPool(): void {
    this.catalogSpotlightPool = [
      ...this.weeklyRankingSpotlightPool,
      ...this.popularSpotlightPool,
      ...this.scoredSpotlightPool,
    ];
    this.refreshSpotlightCards();
  }

  private loadPersonalSections(account: Account | null): void {
    this.stopActivityFeedRefresh();
    if (!account) {
      this.profileSpotlightRequestId++;
      this.profileLibraryEntries = [];
      this.profileGenreScores = new Map<string, number>();
      this.continueCards.set([]);
      this.followingActivityCards.set([]);
      this.refreshSpotlightCards();
      this.personalLoading.set(false);
      this.knownActivityIds.clear();
      this.pendingActivityLikeKeys.clear();
      this.clearActivityLikeAnimationTimers();
      return;
    }

    this.knownActivityIds.clear();
    this.personalLoading.set(true);
    this.subscriptions.add(
      forkJoin({
        library: this.animethequeService.list(account.id).pipe(catchError(() => of([] as AnimethequeEntry[]))),
        feed: this.profileService.followingFeed(account.id).pipe(catchError(() => of([] as FollowFeedEntry[]))),
      }).subscribe(({ library, feed }) => {
        this.profileLibraryEntries = library;
        this.continueCards.set(this.toContinueCards(library));
        this.setActivityCards(feed, false);
        this.refreshSpotlightCards();
        this.loadProfileSpotlightFacts(library);
        this.personalLoading.set(false);
        this.startActivityFeedRefresh(account);
      }),
    );
  }

  private toContinueCards(entries: AnimethequeEntry[]): HomeLibraryCard[] {
    return [...entries]
      .filter((entry) => this.isActiveAnimeProgress(entry))
      .sort((left, right) => this.timeValue(right.updatedAt) - this.timeValue(left.updatedAt))
      .slice(0, 5)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        subtitle: this.nextEpisodeLabel(entry),
        image: entry.coverUrl,
        route: this.animeEntryRoute(entry),
        watched: Math.max(0, Number(entry.watchedEpisodes || 0)),
        total: Math.max(0, Number(entry.totalEpisodes || 0)),
        progress: this.libraryProgress(entry),
      }));
  }

  private toAnimeCard(anime: PopularAnime): HomeAnimeCard {
    return {
      id: anime.id,
      title: anime.title,
      subtitle: [anime.year || null, anime.genres[0] || anime.type || null].filter(Boolean).join(' · '),
      image: anime.backgroundUrl || anime.imageUrl,
      route: ['/animes', anime.slug],
      score: anime.score,
    };
  }

  private refreshSpotlightCards(): void {
    const context = this.spotlightProfileContext();
    this.spotlightHeading.set(context.active ? 'Sélections pour vous' : 'Sélections du moment');
    this.spotlightCards.set(this.toSpotlightCards(this.catalogSpotlightPool, context));
  }

  private toSpotlightCards(animes: PopularAnime[], context: SpotlightProfileContext): HomeSpotlightCard[] {
    const candidates = this.uniqueSpotlightCandidates(animes).filter((anime) => !this.isInProfileLibrary(anime, context));
    const selected: HomeSpotlightCard[] = [];
    const usedIds = new Set<number>();

    if (context.active) {
      this.addSpotlightCards(selected, usedIds, candidates, 'sequel', 2, context, true);
      this.addSpotlightCards(selected, usedIds, candidates, 'profile', 4, context);
    } else {
      this.addSpotlightCards(selected, usedIds, candidates, 'sequel', 1, context);
      this.addSpotlightCards(selected, usedIds, candidates, 'catchup', 3, context);
      this.addSpotlightCards(selected, usedIds, candidates, 'hidden', 4, context);
    }

    this.addSpotlightCards(selected, usedIds, candidates, 'catchup', 5, context);
    this.addSpotlightCards(selected, usedIds, candidates, 'sequel', 5, context);
    this.addSpotlightCards(selected, usedIds, candidates, 'hidden', 5, context);

    return selected.slice(0, 5);
  }

  private uniqueSpotlightCandidates(animes: PopularAnime[]): PopularAnime[] {
    const seen = new Set<string>();

    return animes.filter((anime) => {
      const key = anime.slug || this.normalizeSpotlightText(anime.title);
      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return Boolean(anime.imageUrl || anime.backgroundUrl);
    });
  }

  private addSpotlightCards(
    selected: HomeSpotlightCard[],
    usedIds: Set<number>,
    candidates: PopularAnime[],
    kind: HomeSpotlightKind,
    targetCount: number,
    context: SpotlightProfileContext,
    requireProfileSequel = false,
  ): void {
    if (selected.length >= targetCount) {
      return;
    }

    const picks = candidates
      .filter(
        (anime) =>
          !usedIds.has(anime.id) &&
          this.matchesSpotlightKind(anime, kind, context) &&
          (!requireProfileSequel || this.profileSeriesAffinity(anime, context) > 0),
      )
      .sort((left, right) => this.spotlightScore(right, kind, context) - this.spotlightScore(left, kind, context));

    for (const anime of picks) {
      if (selected.length >= targetCount) {
        return;
      }

      selected.push(this.toSpotlightCard(anime, kind, context));
      usedIds.add(anime.id);
    }
  }

  private toSpotlightCard(anime: PopularAnime, kind: HomeSpotlightKind, context: SpotlightProfileContext): HomeSpotlightCard {
    return {
      ...this.toAnimeCard(anime),
      badge: this.spotlightBadge(kind),
      reason: this.spotlightReason(anime, kind, context),
      kind,
    };
  }

  private matchesSpotlightKind(anime: PopularAnime, kind: HomeSpotlightKind, context: SpotlightProfileContext): boolean {
    if (kind === 'sequel') {
      return this.isSequelSpotlight(anime);
    }

    if (kind === 'profile') {
      return this.profileGenreAffinity(anime, context) > 0 || this.profileSeriesAffinity(anime, context) > 0;
    }

    if (kind === 'hidden') {
      return this.isHiddenSpotlight(anime);
    }

    return this.isCatchupSpotlight(anime);
  }

  private spotlightBadge(kind: HomeSpotlightKind): string {
    if (kind === 'sequel') {
      return 'Suite';
    }

    if (kind === 'profile') {
      return 'Pour vous';
    }

    if (kind === 'hidden') {
      return 'Hors radar';
    }

    return 'À rattraper';
  }

  private spotlightReason(anime: PopularAnime, kind: HomeSpotlightKind, context: SpotlightProfileContext): string {
    if (kind === 'sequel') {
      if (context.active && this.profileSeriesAffinity(anime, context) > 0) {
        return 'Suite liée à votre Animethèque';
      }

      return 'Nouvelle suite à surveiller';
    }

    if (kind === 'profile') {
      return this.profileSeriesAffinity(anime, context) > 0
        ? 'Dans la continuité de vos séries'
        : 'Proche de votre Animethèque';
    }

    if (kind === 'hidden') {
      return 'Moins exposé, bon potentiel';
    }

    return (anime.score ?? 0) >= 8.5 ? 'Valeur sûre du catalogue' : 'Très bon point d’entrée';
  }

  private spotlightScore(anime: PopularAnime, kind: HomeSpotlightKind, context: SpotlightProfileContext): number {
    const score = anime.score ?? 0;
    const rank = anime.rank && anime.rank > 0 ? 10000 / anime.rank : 0;
    const popularity = anime.popularity && anime.popularity > 0 ? 1000 / anime.popularity : 0;
    const currentYear = new Date().getFullYear();
    const recency = anime.year ? Math.max(0, 8 - Math.abs(currentYear - anime.year)) : 0;
    const profileAffinity = this.profileGenreAffinity(anime, context);
    const seriesAffinity = this.profileSeriesAffinity(anime, context);

    if (kind === 'sequel') {
      return seriesAffinity * 320 + recency * 140 + score * 80 + rank * 0.2;
    }

    if (kind === 'profile') {
      return seriesAffinity * 260 + profileAffinity * 120 + score * 80 + rank * 0.35 + recency * 12;
    }

    if (kind === 'hidden') {
      const hiddenBoost = anime.popularity && anime.popularity >= 800 ? 65 : 0;
      return score * 100 + rank * 0.5 + hiddenBoost + profileAffinity * 35;
    }

    return score * 100 + rank + popularity + profileAffinity * 45;
  }

  private isSequelSpotlight(anime: PopularAnime): boolean {
    const title = this.normalizeSpotlightText(`${anime.title} ${anime.titleJapanese ?? ''}`);

    return (
      /\b(?:season|saison)\s*(?:2|3|4|5|6|7|8|9|ii|iii|iv|v|vi|vii|viii|ix)\b/.test(title) ||
      /\b(?:2nd|3rd|4th|5th|6th|7th|8th|9th)\s+season\b/.test(title) ||
      /\b(?:part|cour)\s*(?:2|3)\b/.test(title) ||
      /(?:^|\s|:)(?:ii|iii|iv|v|vi|vii|viii|ix)\b/.test(title)
    );
  }

  private isCatchupSpotlight(anime: PopularAnime): boolean {
    return (anime.score ?? 0) >= 8 || Boolean(anime.rank && anime.rank <= 750);
  }

  private isHiddenSpotlight(anime: PopularAnime): boolean {
    return !this.isSequelSpotlight(anime) && (anime.score ?? 0) >= 7.5 && Boolean(!anime.popularity || anime.popularity >= 800);
  }

  private normalizeSpotlightText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private loadProfileSpotlightFacts(entries: AnimethequeEntry[]): void {
    const requestId = ++this.profileSpotlightRequestId;
    const references = this.profileReferenceEntries(entries);

    if (!references.length) {
      this.profileGenreScores = new Map<string, number>();
      this.refreshSpotlightCards();
      return;
    }

    this.subscriptions.add(
      forkJoin(
        references.map((entry) =>
          this.findCatalogAnimeForEntry(entry).pipe(
            map((anime) => ({ entry, anime })),
            catchError(() => of({ entry, anime: null as PopularAnime | null })),
          ),
        ),
      ).subscribe((results) => {
        if (requestId !== this.profileSpotlightRequestId) {
          return;
        }

        this.profileGenreScores = this.toProfileGenreScores(results);
        this.refreshSpotlightCards();
      }),
    );
  }

  private profileReferenceEntries(entries: AnimethequeEntry[]): AnimethequeEntry[] {
    return [...entries]
      .filter((entry) => entry.status !== 'DROPPED')
      .sort((left, right) => this.profileEntryScore(right) - this.profileEntryScore(left))
      .slice(0, 8);
  }

  private profileEntryScore(entry: AnimethequeEntry): number {
    const statusScore =
      entry.status === 'WATCHING'
        ? 70
        : entry.status === 'COMPLETED'
          ? 55
          : entry.status === 'PLANNED'
            ? 35
            : entry.status === 'PAUSED'
              ? 20
              : 0;
    const favoriteScore = entry.favorite ? 80 : 0;
    const progressScore = entry.watchedEpisodes > 0 ? 35 : 0;
    const recencyScore = Math.min(40, Math.max(0, (this.timeValue(entry.updatedAt) - Date.now() + 1000 * 60 * 60 * 24 * 30) / 86400000));

    return statusScore + favoriteScore + progressScore + recencyScore;
  }

  private findCatalogAnimeForEntry(entry: AnimethequeEntry): Observable<PopularAnime | null> {
    const slug = entry.parentAnimeSlug || entry.animeSlug || entry.seasonSlug || '';
    const malId = this.malIdFromSlug(slug);
    if (malId !== null) {
      return this.animeCatalogService.getAnimeById(malId);
    }

    const selection = entry.parentTitle || entry.title || entry.seasonTitle || '';
    return selection.trim() ? this.animeCatalogService.getPopularAnimeBySelection(selection, 2) : of(null);
  }

  private malIdFromSlug(slug: string): number | null {
    const match = /^mal-(\d+)$/.exec(slug);
    return match ? Number(match[1]) : null;
  }

  private toProfileGenreScores(results: { entry: AnimethequeEntry; anime: PopularAnime | null }[]): Map<string, number> {
    const scores = new Map<string, number>();

    for (const result of results) {
      if (!result.anime) {
        continue;
      }

      const weight = this.profileEntryInterestWeight(result.entry);
      for (const genre of result.anime.genres) {
        const key = this.normalizeSpotlightText(genre);
        if (!key) {
          continue;
        }

        scores.set(key, (scores.get(key) ?? 0) + weight);
      }
    }

    return scores;
  }

  private profileEntryInterestWeight(entry: AnimethequeEntry): number {
    let weight = 1;

    if (entry.favorite) {
      weight += 2.5;
    }

    if (entry.status === 'WATCHING') {
      weight += 2;
    } else if (entry.status === 'COMPLETED') {
      weight += 1.5;
    } else if (entry.status === 'PLANNED') {
      weight += 0.5;
    }

    if (entry.watchedEpisodes > 0) {
      weight += 1;
    }

    return weight;
  }

  private spotlightProfileContext(): SpotlightProfileContext {
    const libraryKeys = new Set<string>();
    const libraryBaseKeys = new Set<string>();
    const active = Boolean(this.account() && this.profileLibraryEntries.length);

    if (!active) {
      return {
        active: false,
        libraryKeys,
        libraryBaseKeys,
        genreScores: new Map<string, number>(),
      };
    }

    for (const entry of this.profileLibraryEntries) {
      this.addLibrarySlugKey(libraryKeys, entry.animeSlug);
      this.addLibrarySlugKey(libraryKeys, entry.parentAnimeSlug);
      this.addLibrarySlugKey(libraryKeys, entry.seasonSlug);
      this.addLibraryTitleKey(libraryKeys, entry.title);
      this.addLibraryTitleKey(libraryKeys, entry.parentTitle);
      this.addLibraryTitleKey(libraryKeys, entry.seasonTitle);
      this.addLibraryBaseKey(libraryBaseKeys, entry.title);
      this.addLibraryBaseKey(libraryBaseKeys, entry.parentTitle);
      this.addLibraryBaseKey(libraryBaseKeys, entry.seasonTitle);
    }

    return {
      active,
      libraryKeys,
      libraryBaseKeys,
      genreScores: this.profileGenreScores,
    };
  }

  private addLibrarySlugKey(keys: Set<string>, slug: string | null | undefined): void {
    if (slug?.trim()) {
      keys.add(`slug:${slug.trim()}`);
    }
  }

  private addLibraryTitleKey(keys: Set<string>, title: string | null | undefined): void {
    const key = title ? this.normalizeSpotlightText(title) : '';
    if (key) {
      keys.add(`title:${key}`);
    }
  }

  private addLibraryBaseKey(keys: Set<string>, title: string | null | undefined): void {
    const key = title ? this.spotlightBaseTitle(title) : '';
    if (key) {
      keys.add(key);
    }
  }

  private isInProfileLibrary(anime: PopularAnime, context: SpotlightProfileContext): boolean {
    if (!context.active) {
      return false;
    }

    return context.libraryKeys.has(`slug:${anime.slug}`) || context.libraryKeys.has(`title:${this.normalizeSpotlightText(anime.title)}`);
  }

  private profileGenreAffinity(anime: PopularAnime, context: SpotlightProfileContext): number {
    if (!context.active || context.genreScores.size === 0) {
      return 0;
    }

    return anime.genres.reduce((total, genre) => total + (context.genreScores.get(this.normalizeSpotlightText(genre)) ?? 0), 0);
  }

  private profileSeriesAffinity(anime: PopularAnime, context: SpotlightProfileContext): number {
    if (!context.active || context.libraryBaseKeys.size === 0) {
      return 0;
    }

    const candidateBase = this.spotlightBaseTitle(anime.title);
    if (!candidateBase) {
      return 0;
    }

    for (const libraryBase of context.libraryBaseKeys) {
      if (candidateBase === libraryBase) {
        return 1;
      }

      if (
        libraryBase.length >= 6 &&
        candidateBase.length >= 6 &&
        (candidateBase.startsWith(`${libraryBase} `) || libraryBase.startsWith(`${candidateBase} `))
      ) {
        return 0.7;
      }
    }

    return 0;
  }

  private spotlightBaseTitle(value: string): string {
    const normalized = this.normalizeSpotlightText(value)
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b(?:2nd|3rd|4th|5th|6th|7th|8th|9th)\s+season\b.*$/, '')
      .replace(/\b(?:season|saison)\s*(?:\d+|ii|iii|iv|v|vi|vii|viii|ix)\b.*$/, '')
      .replace(/\b(?:part|cour)\s*\d+\b.*$/, '')
      .replace(/\s*[-:]\s*(?:season|saison|part|cour|movie|the movie|ova|ona|special|sp)\b.*$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    return normalized || this.normalizeSpotlightText(value);
  }

  private toActivityCard(item: FollowFeedEntry, isNew: boolean): HomeActivityCard {
    const isManga = item.type === 'MANGA';
    const animeEntry = item.entry;
    const mangaEntry = item.mangaEntry;
    const image = isManga ? mangaEntry?.coverUrl ?? '' : animeEntry?.coverUrl ?? '';
    const title = isManga ? mangaEntry?.title ?? 'Manga' : animeEntry?.title ?? 'Anime';
    const id = this.activityId(item);
    const activityEntryId = Number(item.activityEntryId ?? (isManga ? mangaEntry?.id : animeEntry?.id) ?? 0) || null;

    return {
      id,
      profile: item.profile,
      profileName: item.profile.displayName || item.profile.pseudo,
      avatarUrl: this.profileService.assetUrl(item.profile.profilePictureUrl),
      initials: (item.profile.displayName || item.profile.pseudo || 'A').slice(0, 1).toUpperCase(),
      action: isManga ? this.mangaActivityAction(mangaEntry) : this.animeActivityAction(animeEntry),
      title,
      subtitle: isManga ? this.mangaProgressLabel(mangaEntry) : this.animeProgressLabel(animeEntry),
      image,
      route: isManga ? ['/manga'] : animeEntry ? this.animeEntryRoute(animeEntry) : ['/animes'],
      queryParams: isManga && mangaEntry ? { selection: mangaEntry.mangaSlug } : null,
      timeLabel: this.timeAgo(item.updatedAt),
      isNew,
      activityType: item.type,
      activityEntryId,
      liked: Boolean(item.likedByCurrentAccount),
      likes: Math.max(0, Number(item.likesCount ?? 0)),
      justLiked: false,
    };
  }

  private activityId(item: FollowFeedEntry): string {
    return `${item.profile.id}-${item.type}-${item.entry?.id ?? item.mangaEntry?.id ?? 'empty'}-${item.updatedAt}`;
  }

  private setActivityCards(feed: FollowFeedEntry[], animateNewItems: boolean): void {
    const nextIds = new Set(feed.slice(0, 8).map((item) => this.activityId(item)));
    const newIds = animateNewItems
      ? new Set(Array.from(nextIds).filter((id) => !this.knownActivityIds.has(id)))
      : new Set<string>();

    this.followingActivityCards.set(feed.slice(0, 8).map((item) => this.toActivityCard(item, newIds.has(this.activityId(item)))));
    this.knownActivityIds = nextIds;

    if (newIds.size > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => {
        this.followingActivityCards.update((cards) => cards.map((card) => ({ ...card, isNew: false })));
      }, 1800);
    }
  }

  private startActivityFeedRefresh(account: Account): void {
    if (typeof window === 'undefined' || this.activityFeedTimerId !== null) {
      return;
    }

    this.activityFeedTimerId = window.setInterval(() => this.refreshActivityFeed(account), this.activityFeedRefreshMs);
  }

  private stopActivityFeedRefresh(): void {
    if (typeof window === 'undefined' || this.activityFeedTimerId === null) {
      return;
    }

    window.clearInterval(this.activityFeedTimerId);
    this.activityFeedTimerId = null;
  }

  private refreshActivityFeed(account: Account): void {
    this.subscriptions.add(
      this.profileService
        .followingFeed(account.id)
        .pipe(catchError(() => of([] as FollowFeedEntry[])))
        .subscribe((feed) => this.setActivityCards(feed, true)),
    );
  }

  private applyActivityLikeState(
    activityType: 'ANIME' | 'MANGA',
    activityEntryId: number,
    liked: boolean,
    likes: number,
    animate: boolean,
  ): void {
    this.followingActivityCards.update((cards) =>
      cards.map((card) =>
        card.activityType === activityType && card.activityEntryId === activityEntryId
          ? { ...card, liked, likes: Math.max(0, Number(likes || 0)), justLiked: animate && liked }
          : card,
      ),
    );

    if (animate && liked) {
      this.clearActivityLikeAnimation(activityType, activityEntryId);
    }
  }

  private clearActivityLikeAnimation(activityType: 'ANIME' | 'MANGA', activityEntryId: number): void {
    if (typeof window === 'undefined') {
      return;
    }

    const key = this.activityLikeKey(activityType, activityEntryId);
    const existingTimerId = this.likeAnimationTimerIds.get(key);
    if (existingTimerId !== undefined) {
      window.clearTimeout(existingTimerId);
    }

    const timerId = window.setTimeout(() => {
      this.followingActivityCards.update((cards) =>
        cards.map((card) =>
          card.activityType === activityType && card.activityEntryId === activityEntryId
            ? { ...card, justLiked: false }
            : card,
        ),
      );
      this.likeAnimationTimerIds.delete(key);
    }, 620);

    this.likeAnimationTimerIds.set(key, timerId);
  }

  private activityLikeKey(activityType: 'ANIME' | 'MANGA', activityEntryId: number): string {
    return `${activityType}-${activityEntryId}`;
  }

  private clearActivityLikeAnimationTimers(): void {
    if (typeof window !== 'undefined') {
      this.likeAnimationTimerIds.forEach((timerId) => window.clearTimeout(timerId));
    }

    this.likeAnimationTimerIds.clear();
  }

  private animeEntryRoute(entry: AnimethequeEntry): string[] {
    if (entry.trackingMode === 'SEASON' && entry.parentAnimeSlug && entry.seasonSlug) {
      return ['/animes', entry.parentAnimeSlug, 'seasons', entry.seasonSlug];
    }

    return ['/animes', entry.parentAnimeSlug || entry.animeSlug];
  }

  private animeActivityAction(entry: AnimethequeEntry | null): string {
    if (!entry) {
      return 'a mis à jour sa liste';
    }

    if (entry.status === 'COMPLETED' || this.hasCompletedAnimeProgress(entry)) {
      return 'a terminé';
    }

    if (entry.status === 'WATCHING' || entry.watchedEpisodes > 0) {
      return 'a commencé';
    }

    return 'a ajouté à son Animethèque';
  }

  private mangaActivityAction(entry: MangaLibraryEntry | null): string {
    if (!entry) {
      return 'a mis à jour sa Mangathèque';
    }

    if (entry.status === 'COMPLETED') {
      return 'a terminé';
    }

    if (entry.status === 'WATCHING' || entry.readVolumes > 0) {
      return 'a commencé';
    }

    return 'a ajouté à sa Mangathèque';
  }

  private animeProgressLabel(entry: AnimethequeEntry | null): string {
    if (!entry) {
      return '';
    }

    const total = entry.totalEpisodes > 0 ? entry.totalEpisodes : '?';
    return `${entry.watchedEpisodes} / ${total} épisodes vus`;
  }

  private mangaProgressLabel(entry: MangaLibraryEntry | null): string {
    if (!entry) {
      return '';
    }

    const total = entry.totalVolumes > 0 ? entry.totalVolumes : '?';
    return `${entry.readVolumes} / ${total} tomes lus`;
  }

  private nextEpisodeLabel(entry: AnimethequeEntry): string {
    const total = entry.totalEpisodes > 0 ? entry.totalEpisodes : 0;
    if (total > 0 && entry.watchedEpisodes >= total) {
      return 'Terminé';
    }

    const nextEpisode = Math.max(1, entry.watchedEpisodes + 1);
    return total > 0 ? `Épisode ${nextEpisode} sur ${total}` : `Épisode ${nextEpisode}`;
  }

  private libraryProgress(entry: AnimethequeEntry): number {
    if (entry.totalEpisodes <= 0) {
      return entry.watchedEpisodes > 0 ? 12 : 0;
    }

    return Math.max(0, Math.min(100, Math.round((entry.watchedEpisodes / entry.totalEpisodes) * 100)));
  }

  private isActiveAnimeProgress(entry: AnimethequeEntry): boolean {
    if (this.hasCompletedAnimeProgress(entry)) {
      return false;
    }

    return entry.status === 'WATCHING' || (entry.watchedEpisodes > 0 && entry.status !== 'COMPLETED');
  }

  private hasCompletedAnimeProgress(entry: AnimethequeEntry): boolean {
    const totalEpisodes = Math.max(0, Number(entry.totalEpisodes || 0));
    const watchedEpisodes = Math.max(0, Number(entry.watchedEpisodes || 0));
    return totalEpisodes > 0 && watchedEpisodes >= totalEpisodes;
  }

  private timeAgo(value: string | null | undefined): string {
    const timestamp = this.timeValue(value);
    if (!timestamp) {
      return '';
    }

    const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
    if (minutes < 60) {
      return `il y a ${minutes} min`;
    }

    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return `il y a ${hours} h`;
    }

    const days = Math.round(hours / 24);
    return `il y a ${days} j`;
  }

  private timeValue(value: string | null | undefined): number {
    const time = Date.parse(value ?? '');
    return Number.isFinite(time) ? time : 0;
  }

  private emptyAnimePage(page: number): PopularAnimePage {
    return {
      items: [],
      hasNextPage: false,
      totalItems: 0,
      page,
      pageSize: 0,
    };
  }
}
