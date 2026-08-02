import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Observable,
  catchError,
  concatMap,
  forkJoin,
  from,
  map,
  of,
  retry,
  shareReplay,
  startWith,
  switchMap,
  timer,
  timeout,
  toArray,
} from 'rxjs';

import { environment } from '../../environments/environment';
import {
  AnimeCatalogFilterOptions,
  AnimeCatalogFilters,
  AnimeEpisodeOption,
  PopularAnime,
  PopularAnimePage,
  PopularAnimeSeason,
} from '../models/anime.model';
import {
  MADOKA_FRANCHISE_TITLE,
  MADOKA_MAIN_ANIME_ID,
  MADOKA_MOVIE_COLLECTION_SLUG,
  buildMadokaMovieCollection,
  isMadokaCanonicalFollowupMovieId,
  isMadokaMovieId,
  isMadokaMovieOnlyGroup,
  isMadokaRecapMovieId,
} from '../utils/anime-franchise-overrides.util';

interface JikanNamedResource {
  name?: string;
}

interface JikanImageSet {
  image_url?: string;
  large_image_url?: string;
}

interface JikanAnime {
  mal_id: number;
  title?: string;
  title_english?: string | null;
  title_japanese?: string | null;
  images?: {
    jpg?: JikanImageSet;
    webp?: JikanImageSet;
  };
  trailer?: {
    url?: string | null;
    embed_url?: string | null;
    youtube_id?: string | null;
  };
  synopsis?: string | null;
  type?: string | null;
  episodes?: number | null;
  status?: string | null;
  score?: number | null;
  rank?: number | null;
  popularity?: number | null;
  season?: string | null;
  year?: number | null;
  aired?: {
    from?: string | null;
    prop?: {
      from?: {
        year?: number | null;
      } | null;
    } | null;
  } | null;
  genres?: JikanNamedResource[];
  studios?: JikanNamedResource[];
}

interface JikanAnimeResponse {
  data?: JikanAnime[];
  pagination?: {
    has_next_page?: boolean;
    items?: {
      total?: number;
      per_page?: number;
    };
  };
}

interface JikanAnimeDetailsResponse {
  data?: JikanAnime;
}

interface BackendAnimeCatalogEntry {
  malId: number;
  slug: string;
  title: string;
  titleEnglish?: string | null;
  titleJapanese?: string | null;
  imageUrl?: string | null;
  backgroundUrl?: string | null;
  synopsis?: string | null;
  type?: string | null;
  episodes?: number | null;
  status?: string | null;
  score?: number | null;
  rank?: number | null;
  popularity?: number | null;
  season?: string | null;
  year?: number | null;
  genres?: string[] | null;
  studios?: string[] | null;
  trailerUrl?: string | null;
}

interface BackendAnimeCatalogPage {
  items?: BackendAnimeCatalogEntry[];
  hasNextPage?: boolean;
  totalItems?: number;
}

interface BackendAnimeCatalogFilterOptions {
  genres?: string[];
  types?: string[];
  statuses?: string[];
  years?: number[];
}

interface BackendAnimeImageColor {
  rgb?: string | null;
}

interface JikanEpisode {
  mal_id: number;
  title?: string | null;
  title_romanji?: string | null;
  title_japanese?: string | null;
}

interface JikanEpisodesResponse {
  data?: JikanEpisode[];
  pagination?: {
    has_next_page?: boolean;
    current_page?: number;
    last_visible_page?: number;
  };
}

interface AniListEpisode {
  title?: string | null;
}

interface AniListEpisodesResponse {
  data?: {
    Media?: {
      streamingEpisodes?: AniListEpisode[] | null;
    } | null;
  };
}

const SERIES_ALIASES: { match: RegExp; title: string }[] = [
  { match: /^attack on titan/i, title: 'Attack on Titan' },
  { match: /^assassination classroom/i, title: 'Assassination Classroom' },
  { match: /^boku no hero academia/i, title: 'My Hero Academia' },
  { match: /^blue exorcist/i, title: 'Blue Exorcist' },
  { match: /^bungo stray dogs/i, title: 'Bungo Stray Dogs' },
  { match: /^classroom of the elite/i, title: 'Classroom of the Elite' },
  { match: /^clannad/i, title: 'Clannad' },
  { match: /^demon slayer/i, title: 'Demon Slayer: Kimetsu no Yaiba' },
  { match: /^puella magi madoka magica/i, title: MADOKA_FRANCHISE_TITLE },
  { match: /^a certain scientific railgun/i, title: 'A Certain Scientific Railgun' },
  { match: /^akb0048/i, title: 'AKB0048' },
  { match: /^aria the (animation|natural|origination|avvenire|crepuscolo|benedizione)/i, title: 'Aria' },
  { match: /^baki the grappler/i, title: 'Baki the Grappler' },
  { match: /^basilisk/i, title: 'Basilisk' },
  { match: /^bbk\/brnk/i, title: 'BBK/BRNK' },
  { match: /^beatless/i, title: 'Beatless' },
  { match: /^berserk(?: \(2016\)|: season ii)/i, title: 'Berserk (2016)' },
  { match: /^blue dragon/i, title: 'Blue Dragon' },
  { match: /^blue lock/i, title: 'Blue Lock' },
  { match: /^durarara/i, title: 'Durarara!!' },
  { match: /^diabolik lovers/i, title: 'Diabolik Lovers' },
  { match: /^encouragement of climb/i, title: 'Encouragement of Climb' },
  { match: /^fairy tail/i, title: 'Fairy Tail' },
  { match: /^farming life in another world/i, title: 'Farming Life in Another World' },
  { match: /^fire force/i, title: 'Fire Force' },
  { match: /^fighting spirit/i, title: 'Fighting Spirit' },
  { match: /^(frieren|sousou no frieren)/i, title: "Frieren: Beyond Journey's End" },
  { match: /^food wars/i, title: 'Food Wars! Shokugeki no Soma' },
  { match: /^gintama/i, title: 'Gintama' },
  { match: /^ghost in the shell: stand alone complex(?!: tachikomatic)/i, title: 'Ghost in the Shell: Stand Alone Complex' },
  { match: /^hell girl/i, title: 'Hell Girl' },
  { match: /^higurashi/i, title: 'Higurashi: When They Cry' },
  { match: /^hidamari sketch/i, title: 'Hidamari Sketch' },
  { match: /^horimiya/i, title: 'Horimiya' },
  { match: /^jujutsu kaisen/i, title: 'Jujutsu Kaisen' },
  { match: /^kaguya-sama/i, title: 'Kaguya-sama: Love is War' },
  { match: /^king of braves gaogaigar/i, title: 'King of Braves GaoGaiGar' },
  { match: /^konosuba/i, title: "KonoSuba: God's Blessing on This Wonderful World!" },
  { match: /^kuroko'?s basketball/i, title: "Kuroko's Basketball" },
  { match: /^magi: the (labyrinth|kingdom) of magic/i, title: 'Magi' },
  { match: /^little women/i, title: 'Little Women' },
  { match: /^my hero academia/i, title: 'My Hero Academia' },
  { match: /^made in abyss/i, title: 'Made in Abyss' },
  { match: /^mushoku tensei/i, title: 'Mushoku Tensei: Jobless Reincarnation' },
  { match: /^mushi-?shi/i, title: 'Mushi-Shi' },
  { match: /^my teen romantic comedy snafu/i, title: 'My Teen Romantic Comedy SNAFU' },
  { match: /^non non biyori/i, title: 'Non Non Biyori' },
  { match: /^noragami/i, title: 'Noragami' },
  { match: /^is it wrong to try to pick up girls in a dungeon/i, title: 'Is It Wrong to Try to Pick Up Girls in a Dungeon?' },
  { match: /^sword art online/i, title: 'Sword Art Online' },
  { match: /^haikyu/i, title: 'Haikyu!!' },
  { match: /^high school dxd/i, title: 'High School DxD' },
  { match: /^one punch man/i, title: 'One Punch Man' },
  { match: /^overlord/i, title: 'Overlord' },
  { match: /^psycho-pass/i, title: 'Psycho-Pass' },
  { match: /^rascal does not dream/i, title: 'Rascal Does Not Dream' },
  { match: /^seishun buta yarou/i, title: 'Rascal Does Not Dream' },
  { match: /^peter grill and the philosopher's time/i, title: "Peter Grill and the Philosopher's Time" },
  { match: /^phi-brain/i, title: 'Phi-Brain: Puzzle of God' },
  {
    match:
      /^pok(?:e|\u00e9)mon(?:$|: advanced$|: diamond and pearl$|: black & white(?:: (?:rival destinies|adventures in unova(?: and beyond)?))?$| the series: (?:xy|xyz|sun & moon)$| journeys: the series$| horizons: the series$|: to be a pok(?:e|\u00e9)mon master$)/i,
    title: 'Pok\u00e9mon',
  },
  { match: /^rozen maiden/i, title: 'Rozen Maiden' },
  { match: /^ring ni kakero 1/i, title: 'Ring ni Kakero 1' },
  { match: /^saki(?:: the nationals)?$/i, title: 'Saki' },
  { match: /^sengoku basara: samurai kings/i, title: 'Sengoku Basara: Samurai Kings' },
  { match: /^shadowverse flame/i, title: 'Shadowverse Flame' },
  { match: /^shounen ashibe: go! go! goma-chan/i, title: 'Shounen Ashibe: Go! Go! Goma-chan' },
  { match: /^someday's dreamers/i, title: "Someday's Dreamers" },
  { match: /^spy\s*x\s*family/i, title: 'Spy x Family' },
  { match: /^star blazers/i, title: 'Star Blazers' },
  { match: /^the quintessential quintuplets/i, title: 'The Quintessential Quintuplets' },
  { match: /^gotoubun no hanayome/i, title: 'The Quintessential Quintuplets' },
  { match: /^mob psycho 100/i, title: 'Mob Psycho 100' },
  { match: /^tokyo ghoul/i, title: 'Tokyo Ghoul' },
  { match: /^the devil is a part-timer/i, title: 'The Devil is a Part-Timer!' },
  { match: /^the faraway paladin/i, title: 'The Faraway Paladin' },
  { match: /^the promised neverland/i, title: 'The Promised Neverland' },
  { match: /^the prince of tennis/i, title: 'The Prince of Tennis' },
  { match: /^the rising of the shield hero/i, title: 'The Rising of the Shield Hero' },
  { match: /^the seven deadly sins/i, title: 'The Seven Deadly Sins' },
  { match: /^the world god only knows/i, title: 'The World God Only Knows' },
  { match: /^tower of druaga/i, title: 'Tower of Druaga' },
  { match: /^trapped in a dating sim/i, title: 'Trapped in a Dating Sim' },
  { match: /^nanatsu no taizai/i, title: 'The Seven Deadly Sins' },
  { match: /^that time i got reincarnated as a slime/i, title: 'That Time I Got Reincarnated as a Slime' },
  { match: /^terra formars/i, title: 'Terra Formars' },
  { match: /^tokyo revengers/i, title: 'Tokyo Revengers' },
  { match: /^re:zero/i, title: 'Re:Zero' },
  { match: /^utawarerumono/i, title: 'Utawarerumono' },
  { match: /^wagnaria/i, title: 'Wagnaria!!' },
  { match: /^code geass/i, title: 'Code Geass' },
  { match: /^jojo/i, title: "JoJo's Bizarre Adventure" },
  { match: /^dr\.?\s*stone/i, title: 'Dr. Stone' },
  { match: /^black clover/i, title: 'Black Clover' },
  { match: /^bleach/i, title: 'Bleach' },
  { match: /^yashahime/i, title: 'Yashahime: Princess Half-Demon' },
  { match: /^yowamushi pedal/i, title: 'Yowamushi Pedal' },
  { match: /^naruto/i, title: 'Naruto' },
  { match: /^dragon ball/i, title: 'Dragon Ball' },
];

const ALLOWED_ANIME_TYPES = new Set(['tv', 'movie', 'ova', 'ona', 'special', 'tv special']);
const ANIME_PAGE_SIZE = 9;
const ANIME_RANKING_PAGE_SIZE = 9;
const ANIME_PREVIEW_POOL_SIZE = 100;
type AnimeCatalogSortMode = 'popularity-asc' | 'title-asc' | 'title-desc' | 'episodes-desc' | 'score-desc' | 'rank-asc';

@Injectable({ providedIn: 'root' })
export class AnimeCatalogService {
  private readonly http = inject(HttpClient);
  private readonly backendAnimeCatalogUrl = `${environment.apiUrl}/anime-catalog`;
  private readonly animeUrl = 'https://api.jikan.moe/v4/anime';
  private readonly topAnimeUrl = 'https://api.jikan.moe/v4/top/anime';
  private readonly anilistUrl = 'https://graphql.anilist.co';
  private readonly anilistEpisodeTitleCache = new Map<number, Observable<Map<number, string>>>();

  getPopularAnime(
    page: number,
    sortMode: AnimeCatalogSortMode = 'popularity-asc',
    filters: AnimeCatalogFilters = {},
    enrichMissingFacts = true,
  ): Observable<PopularAnimePage> {
    const hasFilters = this.hasCatalogFilters(filters);
    if (sortMode === 'rank-asc' && !hasFilters) {
      return this.getJikanTopAnime(page);
    }

    const jikanSort = this.jikanSortFor(sortMode);
    return this.getBackendAnimePage('', page, sortMode, filters, true, ANIME_PAGE_SIZE, enrichMissingFacts).pipe(
      switchMap((result) =>
        result.items.length > 0 || result.totalItems > 0
          ? of(result)
          : this.getJikanPopularAnime(page, jikanSort.orderBy, jikanSort.sort, filters),
      ),
      catchError(() => this.getJikanPopularAnime(page, jikanSort.orderBy, jikanSort.sort, filters)),
    );
  }

  searchAnime(
    query: string,
    page: number,
    sortMode: AnimeCatalogSortMode = 'popularity-asc',
    filters: AnimeCatalogFilters = {},
  ): Observable<PopularAnimePage> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return this.getPopularAnime(page, sortMode, filters);
    }

    const hasFilters = this.hasCatalogFilters(filters);
    if (sortMode === 'rank-asc' && !hasFilters) {
      return this.searchJikanAnime(cleanQuery, page, 'rank', 'asc', filters);
    }

    const jikanSort = this.jikanSortFor(sortMode);
    return this.getBackendAnimePage(cleanQuery, page, sortMode, filters).pipe(
      switchMap((result) =>
        result.items.length > 0 || result.totalItems > 0
          ? of(result)
          : this.searchJikanAnime(cleanQuery, page, jikanSort.orderBy, jikanSort.sort, filters),
      ),
      catchError(() => this.searchJikanAnime(cleanQuery, page, jikanSort.orderBy, jikanSort.sort, filters)),
    );
  }

  getAnimeCatalogTotal(): Observable<number> {
    return this.getBackendAnimePage('', 1, 'title-asc', {}).pipe(
      switchMap((result) =>
        result.totalItems > 0
          ? of(result.totalItems)
          : this.getJikanPopularAnime(1, 'title', 'asc', {}).pipe(map((page) => page.totalItems)),
      ),
      catchError(() => this.getJikanPopularAnime(1, 'title', 'asc', {}).pipe(map((page) => page.totalItems))),
    );
  }

  getPreviewAnime(count = 15): Observable<PopularAnimePage> {
    const cleanCount = Math.max(1, Math.min(count, 25));
    const poolSize = Math.max(cleanCount, ANIME_PREVIEW_POOL_SIZE);

    return this.getBackendAnimePage('', 1, 'popularity-asc', {}, true, poolSize, false).pipe(
      switchMap((result) =>
        result.items.length > 0
          ? of(this.toRandomPreviewPage(result, cleanCount))
          : this.getJikanPopularAnime(1, 'popularity', 'asc', {}, Math.min(poolSize, 25)).pipe(
              map((page) => this.toRandomPreviewPage(page, cleanCount)),
            ),
      ),
      catchError(() =>
        this.getJikanPopularAnime(1, 'popularity', 'asc', {}, Math.min(poolSize, 25)).pipe(
          map((page) => this.toRandomPreviewPage(page, cleanCount)),
        ),
      ),
    );
  }

  getWeeklyAnimeRanking(count = 10): Observable<PopularAnimePage> {
    const cleanCount = Math.max(1, Math.min(count, 25));
    const params = new HttpParams().set('limit', cleanCount);

    return this.http.get<BackendAnimeCatalogEntry[]>(`${this.backendAnimeCatalogUrl}/weekly-ranking`, { params }).pipe(
      map((entries) => {
        const items = (entries ?? [])
          .map((anime) => this.mapBackendAnime(anime))
          .filter((anime) => this.isAllowedAnimeType(anime.type))
          .map((anime) => this.withSeasons(anime));

        return {
          items,
          hasNextPage: false,
          totalItems: items.length,
          page: 1,
          pageSize: cleanCount,
        };
      }),
      catchError(() =>
        of({
          items: [],
          hasNextPage: false,
          totalItems: 0,
          page: 1,
          pageSize: cleanCount,
        }),
      ),
    );
  }

  getTopRankedAnime(count = 10): Observable<PopularAnimePage> {
    const cleanCount = Math.max(1, Math.min(count, 25));
    const topPoolSize = 25;

    return forkJoin([
      this.getJikanTopAnimeRawPage(1, topPoolSize),
      this.getJikanTopAnimeRawPage(2, topPoolSize),
    ]).pipe(
      map((pages) => this.toRankedAnimePage(pages.flatMap((page) => page.items), cleanCount)),
      switchMap((page) =>
        page.items.length > 0
          ? of(page)
          : this.getBackendAnimePage('', 1, 'rank-asc', {}, true, topPoolSize, false).pipe(
              map((fallbackPage) => this.toRankedAnimePage(fallbackPage.items, cleanCount)),
            ),
      ),
      catchError(() =>
        this.getBackendAnimePage('', 1, 'rank-asc', {}, true, topPoolSize, false).pipe(
          map((fallbackPage) => this.toRankedAnimePage(fallbackPage.items, cleanCount)),
        ),
      ),
    );
  }

  getFilterOptions(): Observable<AnimeCatalogFilterOptions> {
    return this.http.get<BackendAnimeCatalogFilterOptions>(`${this.backendAnimeCatalogUrl}/filters`).pipe(
      map((options) => ({
        genres: this.uniqueStrings(options.genres),
        types: this.uniqueStrings(options.types),
        statuses: this.uniqueStrings(options.statuses),
        years: (options.years ?? [])
          .map((year) => Number(year))
          .filter((year) => Number.isFinite(year) && year > 0)
          .sort((left, right) => right - left),
      })),
      catchError(() => of({ genres: [], types: [], statuses: [], years: [] })),
    );
  }

  searchAnimeSuggestions(query: string, limit = 5): Observable<PopularAnime[]> {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      return of([]);
    }

    const cleanLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 5));
    const params = new HttpParams().set('query', cleanQuery).set('limit', cleanLimit);
    return this.http.get<BackendAnimeCatalogEntry[]>(`${this.backendAnimeCatalogUrl}/suggestions`, { params }).pipe(
      map((items) =>
        this.groupAnimeSeries(
          (items ?? [])
            .map((anime) => this.mapBackendAnime(anime))
            .filter((anime) => this.isAllowedAnimeType(anime.type)),
        ).slice(0, cleanLimit),
      ),
      switchMap((items) => (items.length > 0 ? of(items) : this.searchJikanAnimeSuggestions(cleanQuery))),
      catchError(() => this.searchJikanAnimeSuggestions(cleanQuery)),
    );
  }

  getAnimeById(id: number): Observable<PopularAnime | null> {
    return this.http.get<BackendAnimeCatalogEntry>(`${this.backendAnimeCatalogUrl}/mal/${id}`).pipe(
      map((anime) => this.withSeasons(this.mapBackendAnime(anime))),
      catchError(() => this.getJikanAnimeById(id)),
    );
  }

  private getAnimeByRouteSlug(slug: string): Observable<PopularAnime | null> {
    return this.http
      .get<BackendAnimeCatalogEntry>(`${this.backendAnimeCatalogUrl}/slug/${encodeURIComponent(slug)}`)
      .pipe(
        timeout({ first: 5000 }),
        map((anime) => this.withSeasons(this.mapBackendAnime(anime))),
        catchError(() => of(null)),
      );
  }

  getDominantImageColor(imageUrl: string): Observable<string | null> {
    const cleanImageUrl = imageUrl.trim();
    if (!cleanImageUrl) {
      return of(null);
    }

    const params = new HttpParams().set('url', cleanImageUrl);
    return this.http.get<BackendAnimeImageColor>(`${this.backendAnimeCatalogUrl}/image-color`, { params }).pipe(
      map((response) => this.cleanRgbValue(response.rgb)),
      catchError(() => of(null)),
    );
  }

  private hasCatalogFilters(filters: AnimeCatalogFilters): boolean {
    return Boolean(
      filters.genre?.trim() ||
        filters.type?.trim() ||
        filters.status?.trim() ||
        filters.year?.trim() ||
        filters.season?.trim() ||
        filters.minScore?.trim(),
    );
  }

  private cleanRgbValue(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const channels = value.split(',').map((channel) => Number(channel.trim()));
    if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
      return null;
    }

    return channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel)))).join(', ');
  }

  private emptyAnimePage(page: number): PopularAnimePage {
    return {
      items: [],
      hasNextPage: false,
      totalItems: 0,
      page,
      pageSize: ANIME_PAGE_SIZE,
    };
  }

  private uniqueStrings(values: string[] | undefined): string[] {
    return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
      left.localeCompare(right, 'fr', { sensitivity: 'base' }),
    );
  }

  private jikanSortFor(sortMode: AnimeCatalogSortMode): { orderBy: string; sort: string } {
    switch (sortMode) {
      case 'title-desc':
        return { orderBy: 'title', sort: 'desc' };
      case 'rank-asc':
        return { orderBy: 'rank', sort: 'asc' };
      case 'score-desc':
        return { orderBy: 'score', sort: 'desc' };
      case 'episodes-desc':
        return { orderBy: 'episodes', sort: 'desc' };
      case 'popularity-asc':
      case 'title-asc':
      default:
        return sortMode === 'title-asc'
          ? { orderBy: 'title', sort: 'asc' }
          : { orderBy: 'popularity', sort: 'asc' };
    }
  }

  private applyJikanFilters(params: HttpParams, filters: AnimeCatalogFilters): HttpParams {
    let nextParams = params;
    const year = this.cleanYearFilter(filters.year);
    const type = this.jikanTypeFilter(filters.type);
    const status = this.jikanStatusFilter(filters.status);
    const minScore = this.cleanMinScoreFilter(filters.minScore);

    if (year) {
      nextParams = nextParams.set('start_date', `${year}-01-01`).set('end_date', `${year}-12-31`);
    }
    if (type) {
      nextParams = nextParams.set('type', type);
    }
    if (status) {
      nextParams = nextParams.set('status', status);
    }
    if (minScore !== null) {
      nextParams = nextParams.set('min_score', String(minScore));
    }

    return nextParams;
  }

  private cleanYearFilter(value: string | undefined): number | null {
    const year = Number(value?.trim());
    return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null;
  }

  private cleanMinScoreFilter(value: string | undefined): number | null {
    const score = Number(value?.trim());
    return Number.isFinite(score) ? Math.max(0, Math.min(score, 10)) : null;
  }

  private jikanTypeFilter(value: string | undefined): string {
    switch (this.normalizeJikanFilterValue(value)) {
      case 'film':
      case 'movie':
        return 'movie';
      case 'tv':
      case 'serie':
        return 'tv';
      case 'ova':
        return 'ova';
      case 'ona':
        return 'ona';
      case 'special':
        return 'special';
      default:
        return '';
    }
  }

  private jikanStatusFilter(value: string | undefined): string {
    const normalized = this.normalizeJikanFilterValue(value);
    if (normalized.includes('termine') || normalized === 'complete' || normalized === 'finished airing') {
      return 'complete';
    }
    if (normalized.includes('diffusion') || normalized === 'airing' || normalized === 'currently airing') {
      return 'airing';
    }
    if (normalized.includes('venir') || normalized === 'upcoming' || normalized === 'not yet aired') {
      return 'upcoming';
    }

    return '';
  }

  private normalizeJikanFilterValue(value: string | undefined): string {
    return (value ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private getBackendAnimePage(
    query: string,
    page: number,
    sortMode: AnimeCatalogSortMode = 'title-asc',
    filters: AnimeCatalogFilters = {},
    groupSeries = true,
    pageSize = ANIME_PAGE_SIZE,
    enrichMissingFacts = true,
  ): Observable<PopularAnimePage> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize).set('sort', sortMode);
    if (query.trim()) {
      params = params.set('query', query.trim());
    }
    if (filters.genre?.trim()) {
      params = params.set('genre', filters.genre.trim());
    }
    if (filters.type?.trim()) {
      params = params.set('type', filters.type.trim());
    }
    if (filters.status?.trim()) {
      params = params.set('status', filters.status.trim());
    }
    if (filters.year?.trim()) {
      params = params.set('year', filters.year.trim());
    }
    if (filters.season?.trim()) {
      params = params.set('season', filters.season.trim());
    }
    if (filters.minScore?.trim()) {
      params = params.set('minScore', filters.minScore.trim());
    }

    return this.http.get<BackendAnimeCatalogPage>(this.backendAnimeCatalogUrl, { params }).pipe(
      switchMap((response) => {
        const rawItems = (response.items ?? [])
          .map((anime) => this.mapBackendAnime(anime))
          .filter((anime) => this.isAllowedAnimeType(anime.type));
        const items = groupSeries ? this.groupAnimeSeries(rawItems) : rawItems.map((anime) => this.withSeasons(anime));

        const pageResult: PopularAnimePage = {
          items,
          hasNextPage: response.hasNextPage ?? false,
          totalItems: response.totalItems ?? 0,
          page,
          pageSize,
        };

        if (!enrichMissingFacts || items.every((anime) => anime.year !== null && anime.score !== null)) {
          return of(pageResult);
        }

        return this.enrichMissingCatalogFacts(items).pipe(
          map((enrichedItems) => ({
            ...pageResult,
            items: enrichedItems,
          })),
          startWith(pageResult),
        );
      }),
    );
  }

  private getJikanPopularAnime(
    page: number,
    orderBy = 'popularity',
    sort = 'asc',
    filters: AnimeCatalogFilters = {},
    pageSize = ANIME_PAGE_SIZE,
    groupSeries = true,
  ): Observable<PopularAnimePage> {
    const cleanPageSize = Math.max(1, Math.min(pageSize, 25));
    let params = new HttpParams()
      .set('order_by', orderBy)
      .set('sort', sort)
      .set('sfw', 'true')
      .set('page', page)
      .set('limit', cleanPageSize);
    params = this.applyJikanFilters(params, filters);

    return this.http.get<JikanAnimeResponse>(this.animeUrl, { params }).pipe(
      retry({
        count: 3,
        delay: (_error, retryCount) => timer(retryCount * 1800),
      }),
      map((response) => ({
        items: this.catalogItemsForDisplay(
          (response.data ?? [])
            .filter((anime) => this.isAllowedAnimeType(anime.type))
            .map((anime) => this.mapAnime(anime)),
          groupSeries,
        ),
        hasNextPage: response.pagination?.has_next_page ?? false,
        totalItems: response.pagination?.items?.total ?? 0,
        page,
        pageSize: response.pagination?.items?.per_page ?? ANIME_PAGE_SIZE,
      })),
      catchError(() =>
        of({
          items: [],
          hasNextPage: false,
          totalItems: 0,
          page,
          pageSize: cleanPageSize,
        }),
      ),
    );
  }

  private toRandomPreviewPage(page: PopularAnimePage, count: number): PopularAnimePage {
    const items = this.shuffleAnime(page.items).slice(0, count);

    return {
      ...page,
      items,
      hasNextPage: false,
      totalItems: items.length,
      page: 1,
      pageSize: items.length || count,
    };
  }

  private shuffleAnime(items: PopularAnime[]): PopularAnime[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const targetIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[targetIndex]] = [shuffled[targetIndex], shuffled[index]];
    }

    return shuffled;
  }

  private getJikanTopAnime(page: number): Observable<PopularAnimePage> {
    const params = new HttpParams()
      .set('sfw', 'true')
      .set('page', page)
      .set('limit', ANIME_RANKING_PAGE_SIZE);

    return this.http.get<JikanAnimeResponse>(this.topAnimeUrl, { params }).pipe(
      retry({
        count: 3,
        delay: (_error, retryCount) => timer(retryCount * 1800),
      }),
      map((response) => ({
        items: this.catalogItemsForDisplay(
          (response.data ?? [])
            .filter((anime) => this.isAllowedAnimeType(anime.type))
            .map((anime) => this.mapAnime(anime)),
          true,
        ),
        hasNextPage: response.pagination?.has_next_page ?? false,
        totalItems: response.pagination?.items?.total ?? 0,
        page,
        pageSize: response.pagination?.items?.per_page ?? ANIME_PAGE_SIZE,
      })),
      catchError(() =>
        of({
          items: [],
          hasNextPage: false,
          totalItems: 0,
          page,
          pageSize: ANIME_PAGE_SIZE,
        }),
      ),
    );
  }

  private getJikanTopAnimeRawPage(page: number, pageSize: number): Observable<PopularAnimePage> {
    const cleanPageSize = Math.max(1, Math.min(pageSize, 25));
    const params = new HttpParams()
      .set('sfw', 'true')
      .set('page', page)
      .set('limit', cleanPageSize);

    return this.http.get<JikanAnimeResponse>(this.topAnimeUrl, { params }).pipe(
      retry({
        count: 3,
        delay: (_error, retryCount) => timer(retryCount * 1800),
      }),
      map((response) => ({
        items: (response.data ?? [])
          .filter((anime) => this.isAllowedAnimeType(anime.type))
          .map((anime) => this.mapAnime(anime)),
        hasNextPage: response.pagination?.has_next_page ?? false,
        totalItems: response.pagination?.items?.total ?? 0,
        page,
        pageSize: response.pagination?.items?.per_page ?? cleanPageSize,
      })),
      catchError(() =>
        of({
          items: [],
          hasNextPage: false,
          totalItems: 0,
          page,
          pageSize: cleanPageSize,
        }),
      ),
    );
  }

  private toRankedAnimePage(items: PopularAnime[], count: number): PopularAnimePage {
    const rankedItems = this.catalogItemsForDisplay(items, true)
      .map((anime) => this.withBestRankingFacts(anime))
      .sort((left, right) => this.compareAnimeRanking(left, right))
      .slice(0, count);

    return {
      items: rankedItems,
      hasNextPage: false,
      totalItems: rankedItems.length,
      page: 1,
      pageSize: count,
    };
  }

  private withBestRankingFacts(anime: PopularAnime): PopularAnime {
    const bestSeason = [...anime.seasons]
      .filter((season) => this.validRankingValue(season.rank) < Number.MAX_SAFE_INTEGER)
      .sort((left, right) => this.validRankingValue(left.rank) - this.validRankingValue(right.rank))[0];

    if (!bestSeason) {
      return anime;
    }

    return {
      ...anime,
      score: bestSeason.score ?? anime.score,
      rank: bestSeason.rank ?? anime.rank,
      year: anime.year ?? bestSeason.year,
    };
  }

  private compareAnimeRanking(left: PopularAnime, right: PopularAnime): number {
    const rankDelta = this.bestRankingValue(left) - this.bestRankingValue(right);
    if (rankDelta !== 0) {
      return rankDelta;
    }

    const scoreDelta = (right.score ?? -1) - (left.score ?? -1);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return left.title.localeCompare(right.title, 'fr', { sensitivity: 'base' });
  }

  private bestRankingValue(anime: PopularAnime): number {
    return Math.min(this.validRankingValue(anime.rank), ...anime.seasons.map((season) => this.validRankingValue(season.rank)));
  }

  private validRankingValue(rank: number | null | undefined): number {
    const numericRank = Number(rank);
    return Number.isFinite(numericRank) && numericRank > 0 ? numericRank : Number.MAX_SAFE_INTEGER;
  }

  private searchJikanAnime(
    cleanQuery: string,
    page: number,
    orderBy = 'popularity',
    sort = 'asc',
    filters: AnimeCatalogFilters = {},
    groupSeries = true,
    pageSize = ANIME_PAGE_SIZE,
  ): Observable<PopularAnimePage> {
    const cleanPageSize = Math.max(1, Math.min(pageSize, 25));
    let params = new HttpParams()
      .set('q', cleanQuery)
      .set('order_by', orderBy)
      .set('sort', sort)
      .set('sfw', 'true')
      .set('page', page)
      .set('limit', cleanPageSize);
    params = this.applyJikanFilters(params, filters);

    return this.http.get<JikanAnimeResponse>(this.animeUrl, { params }).pipe(
      retry({
        count: 3,
        delay: (_error, retryCount) => timer(retryCount * 1800),
      }),
      map((response) => {
        const rawItems = (response.data ?? [])
          .filter((anime) => this.isAllowedAnimeType(anime.type))
          .map((anime) => this.mapAnime(anime));

        return {
          items: groupSeries ? this.groupAnimeSeries(rawItems) : rawItems.map((anime) => this.withSeasons(anime)),
          hasNextPage: response.pagination?.has_next_page ?? false,
          totalItems: response.pagination?.items?.total ?? 0,
          page,
          pageSize: response.pagination?.items?.per_page ?? cleanPageSize,
        };
      }),
      catchError(() =>
        of({
          items: [],
          hasNextPage: false,
          totalItems: 0,
          page,
          pageSize: cleanPageSize,
        }),
      ),
    );
  }

  private searchJikanAnimeSuggestions(cleanQuery: string): Observable<PopularAnime[]> {
    const params = new HttpParams()
      .set('q', cleanQuery)
      .set('order_by', 'popularity')
      .set('sort', 'asc')
      .set('sfw', 'true')
      .set('page', 1)
      .set('limit', 25);

    return this.http.get<JikanAnimeResponse>(this.animeUrl, { params }).pipe(
      retry({
        count: 2,
        delay: (_error, retryCount) => timer(retryCount * 1200),
      }),
      map((response) =>
        this.groupAnimeSeries(
          (response.data ?? [])
            .filter((anime) => this.isAllowedAnimeType(anime.type))
            .map((anime) => this.mapAnime(anime)),
        )
          .sort((left, right) => (left.popularity ?? 999999) - (right.popularity ?? 999999)),
      ),
      catchError(() => of([])),
    );
  }

  private getJikanAnimeById(id: number): Observable<PopularAnime | null> {
    return this.http.get<JikanAnimeDetailsResponse>(`${this.animeUrl}/${id}`).pipe(
      retry({
        count: 2,
        delay: (_error, retryCount) => timer(retryCount * 1200),
      }),
      map((response) => {
        const anime = response.data;
        return anime && this.isAllowedAnimeType(anime.type) ? this.withSeasons(this.mapAnime(anime)) : null;
      }),
      catchError(() => of(null)),
    );
  }

  getPopularAnimeBySelection(selection: string, maxPages = 6): Observable<PopularAnime | null> {
    const normalizedSelection = selection.trim().toLowerCase();
    if (!normalizedSelection) {
      return of(null);
    }

    const directMalId = /^mal-(\d+)$/.exec(normalizedSelection)?.[1];
    if (directMalId) {
      return this.getAnimeById(Number(directMalId)).pipe(
        switchMap((anime) => (anime ? this.findGroupedAnimeForDetail(anime) : of(null))),
      );
    }

    if (normalizedSelection === MADOKA_MOVIE_COLLECTION_SLUG) {
      return this.findAnimeBySearchSelection(normalizedSelection);
    }

    return this.getAnimeByRouteSlug(normalizedSelection).pipe(
      switchMap((anime) => (anime ? this.findGroupedAnimeForDetail(anime) : of(null))),
    );
  }

  getEpisodeOptions(anime: PopularAnime): Observable<AnimeEpisodeOption[]> {
    const seasons = anime.seasons.length > 0 ? anime.seasons : [this.toSeason(anime)];
    let offset = 0;
    const seasonOffsets = seasons.map((season, index) => {
      const currentOffset = offset;
      offset += Math.max(0, season.episodes);
      return { season, offset: currentOffset, seasonNumber: index + 1 };
    });

    return from(seasonOffsets).pipe(
      concatMap(({ season, offset: currentOffset, seasonNumber }) =>
        this.loadSeasonEpisodeOptions(season, currentOffset, seasonNumber),
      ),
      toArray(),
      map((groups) => groups.flat()),
    );
  }

  getSeasonEpisodeOptions(season: PopularAnimeSeason, seasonNumber: number): Observable<AnimeEpisodeOption[]> {
    return this.loadSeasonEpisodeOptions(season, 0, seasonNumber);
  }

  private mapAnime(anime: JikanAnime): PopularAnime {
    const imageUrl =
      anime.images?.webp?.large_image_url ??
      anime.images?.jpg?.large_image_url ??
      anime.images?.webp?.image_url ??
      anime.images?.jpg?.image_url ??
      '';

    return {
      id: anime.mal_id,
      slug: `mal-${anime.mal_id}`,
      title: anime.title_english || anime.title || `Anime ${anime.mal_id}`,
      titleJapanese: anime.title_japanese ?? null,
      imageUrl,
      backgroundUrl: imageUrl,
      synopsis: this.cleanSynopsis(anime.synopsis, 'Aucun resume disponible pour le moment.'),
      type: anime.type ?? 'Anime',
      episodes: anime.episodes ?? 0,
      status: anime.status ?? 'Statut inconnu',
      score: anime.score ?? null,
      rank: anime.rank ?? null,
      popularity: anime.popularity ?? null,
      season: anime.season ?? null,
      year: this.resolveAnimeYear(anime),
      genres: (anime.genres ?? []).map((genre) => genre.name).filter((name): name is string => Boolean(name)),
      studios: (anime.studios ?? []).map((studio) => studio.name).filter((name): name is string => Boolean(name)),
      trailerUrl: this.mapTrailerUrl(anime.trailer),
      seasons: [
        {
          malId: anime.mal_id,
          slug: `mal-${anime.mal_id}`,
          title: anime.title_english || anime.title || `Anime ${anime.mal_id}`,
          titleJapanese: anime.title_japanese ?? null,
          synopsis: this.cleanSynopsis(anime.synopsis, 'Aucun resume disponible pour le moment.'),
          type: anime.type ?? 'Anime',
          imageUrl,
          trailerUrl: this.mapTrailerUrl(anime.trailer),
          episodes: anime.episodes ?? 0,
          status: anime.status ?? 'Statut inconnu',
          score: anime.score ?? null,
          rank: anime.rank ?? null,
          popularity: anime.popularity ?? null,
          season: anime.season ?? null,
          year: this.resolveAnimeYear(anime),
          genres: (anime.genres ?? []).map((genre) => genre.name).filter((name): name is string => Boolean(name)),
          studios: (anime.studios ?? []).map((studio) => studio.name).filter((name): name is string => Boolean(name)),
        },
      ],
    };
  }

  private mapBackendAnime(anime: BackendAnimeCatalogEntry): PopularAnime {
    const imageUrl = anime.imageUrl ?? '';
    return {
      id: anime.malId,
      slug: anime.slug || `mal-${anime.malId}`,
      title: anime.title || anime.titleEnglish || `Anime ${anime.malId}`,
      titleJapanese: anime.titleJapanese ?? null,
      imageUrl,
      backgroundUrl: anime.backgroundUrl || imageUrl,
      synopsis: this.cleanSynopsis(anime.synopsis, 'Aucun resume disponible pour le moment.'),
      type: anime.type ?? 'Anime',
      episodes: anime.episodes ?? 0,
      status: anime.status ?? 'Statut inconnu',
      score: anime.score ?? null,
      rank: anime.rank ?? null,
      popularity: anime.popularity ?? null,
      season: anime.season ?? null,
      year: anime.year ?? null,
      genres: anime.genres ?? [],
      studios: anime.studios ?? [],
      trailerUrl: anime.trailerUrl ?? null,
      seasons: [
        {
          malId: anime.malId,
          slug: anime.slug || `mal-${anime.malId}`,
          title: anime.title || anime.titleEnglish || `Anime ${anime.malId}`,
          titleJapanese: anime.titleJapanese ?? null,
          synopsis: this.cleanSynopsis(anime.synopsis, 'Aucun resume disponible pour le moment.'),
          type: anime.type ?? 'Anime',
          imageUrl,
          trailerUrl: anime.trailerUrl ?? null,
          episodes: anime.episodes ?? 0,
          status: anime.status ?? 'Statut inconnu',
          score: anime.score ?? null,
          rank: anime.rank ?? null,
          popularity: anime.popularity ?? null,
          season: anime.season ?? null,
          year: anime.year ?? null,
          genres: anime.genres ?? [],
          studios: anime.studios ?? [],
        },
      ],
    };
  }

  private isAllowedAnimeType(type: string | null | undefined): boolean {
    if (!type) {
      return true;
    }

    return ALLOWED_ANIME_TYPES.has(type.trim().toLowerCase());
  }

  private enrichMissingCatalogFacts(items: PopularAnime[]): Observable<PopularAnime[]> {
    const missingFactItems = items.filter((anime) => anime.year === null || anime.score === null).slice(0, 12);
    if (missingFactItems.length === 0) {
      return of(items);
    }

    return from(missingFactItems).pipe(
      concatMap((anime) =>
        timer(220).pipe(
          switchMap(() =>
            this.getJikanAnimeById(anime.id).pipe(
              map((details) => ({ slug: anime.slug, details })),
              catchError(() => of({ slug: anime.slug, details: null })),
            ),
          ),
        ),
      ),
      toArray(),
      map((results) => {
        const detailsBySlug = new Map(results.map((result) => [result.slug, result.details]));
        return items.map((anime) => {
          const details = detailsBySlug.get(anime.slug);
          const year = details?.year ?? anime.year;
          const score = details?.score ?? anime.score;
          if (!year && score === anime.score) {
            return anime;
          }

          return {
            ...anime,
            score,
            rank: anime.rank ?? details?.rank ?? null,
            popularity: anime.popularity ?? details?.popularity ?? null,
            year: year ?? null,
            seasons: anime.seasons.map((season) => ({
              ...season,
              score: season.score ?? score,
              rank: season.rank ?? details?.rank ?? null,
              popularity: season.popularity ?? details?.popularity ?? null,
              year: season.year ?? year ?? null,
            })),
          };
        });
      }),
    );
  }

  private groupAnimeSeries(items: PopularAnime[]): PopularAnime[] {
    const groups = new Map<string, PopularAnime[]>();

    for (const item of items) {
      const identity = this.seriesIdentity(item);
      const current = groups.get(identity.key) ?? [];
      current.push({ ...item, title: identity.title });
      groups.set(identity.key, current);
    }

    const groupedItems = Array.from(groups.values()).map((group) =>
      group.length > 1 ? this.mergeSeriesGroup(group) : this.withSeasons(group[0]),
    );
    const movieCollection = buildMadokaMovieCollection(items);
    if (!movieCollection) {
      return groupedItems;
    }

    const visibleItems = groupedItems.filter((item) => !isMadokaMovieOnlyGroup(item));
    const mainSeriesIndex = visibleItems.findIndex((item) =>
      item.seasons.some((season) => season.malId === MADOKA_MAIN_ANIME_ID),
    );
    visibleItems.splice(mainSeriesIndex >= 0 ? mainSeriesIndex + 1 : visibleItems.length, 0, movieCollection);
    return visibleItems;
  }

  private catalogItemsForDisplay(items: PopularAnime[], groupSeries: boolean): PopularAnime[] {
    return groupSeries ? this.groupAnimeSeries(items) : items.map((anime) => this.withSeasons(anime));
  }

  private findPopularAnimeBySelection(
    selection: string,
    page: number,
    maxPages: number,
  ): Observable<PopularAnime | null> {
    return this.getPopularAnime(page).pipe(
      switchMap((result) => {
        const anime = result.items.find((item) => this.matchesSelection(item, selection));
        if (anime || !result.hasNextPage || page >= maxPages) {
          return of(anime ?? null);
        }

        return this.findPopularAnimeBySelection(selection, page + 1, maxPages);
      }),
    );
  }

  private findAnimeBySearchSelection(selection: string): Observable<PopularAnime | null> {
    const query = this.searchQueryFromSelection(selection);
    if (!query) {
      return of(null);
    }

    return this.searchGroupedAnimePool(query).pipe(
      map((result) => {
        const items = this.catalogItemsForDisplay(result, true);
        return (
          this.preferredFranchiseGroupForSelection(items, selection) ??
          items.find((item) => this.matchesSelection(item, selection)) ??
          items[0] ??
          null
        );
      }),
      catchError(() => of(null)),
    );
  }

  private findGroupedAnimeForDetail(anime: PopularAnime): Observable<PopularAnime | null> {
    const identity = this.seriesIdentity(anime);
    const query = isMadokaMovieId(anime.id) ? MADOKA_FRANCHISE_TITLE : identity.title || anime.title;
    return this.searchGroupedAnimePool(query).pipe(
      map((items) => {
        const groupedItems = this.catalogItemsForDisplay([anime, ...items], true);
        const preferredGroup = isMadokaMovieId(anime.id)
          ? groupedItems.find((item) => item.slug === MADOKA_MOVIE_COLLECTION_SLUG)
          : null;
        return (
          preferredGroup ??
          groupedItems.find((item) => item.seasons.some((season) => season.malId === anime.id)) ??
          groupedItems.find((item) => this.matchesSelection(item, anime.slug.toLowerCase())) ??
          anime
        );
      }),
      catchError(() => of(anime)),
    );
  }

  private searchGroupedAnimePool(query: string, pageSize = 25): Observable<PopularAnime[]> {
    return this.getBackendAnimePage(query, 1, 'popularity-asc', {}, false, pageSize, false).pipe(
      switchMap((backendResult) =>
        backendResult.items.length > 0
          ? of(backendResult.items)
          : this.searchJikanAnime(query, 1, 'popularity', 'asc', {}, false, pageSize).pipe(map((page) => page.items)),
      ),
      catchError(() => this.searchJikanAnime(query, 1, 'popularity', 'asc', {}, false, pageSize).pipe(map((page) => page.items))),
    );
  }

  private preferredFranchiseGroupForSelection(items: PopularAnime[], selection: string): PopularAnime | null {
    const collection = items.find((item) => item.slug === MADOKA_MOVIE_COLLECTION_SLUG);
    if (!collection) {
      return null;
    }

    if (selection === MADOKA_MOVIE_COLLECTION_SLUG) {
      return collection;
    }

    return collection.seasons.some(
      (season) => season.slug.toLowerCase() === selection || this.seriesSlugForTitle(season.title) === selection,
    )
      ? collection
      : null;
  }

  private matchesSelection(anime: PopularAnime, selection: string): boolean {
    if (anime.slug.toLowerCase() === selection || this.seriesSlugForTitle(anime.title) === selection) {
      return true;
    }

    if (anime.titleJapanese && this.seriesSlugForTitle(`${anime.title} ${anime.titleJapanese}`) === selection) {
      return true;
    }

    return anime.seasons.some(
      (season) => season.slug.toLowerCase() === selection || this.seriesSlugForTitle(season.title) === selection,
    );
  }

  private seriesSlugForTitle(title: string): string {
    return `series-${this.slugify(title)}`;
  }

  private searchQueryFromSelection(selection: string): string {
    if (selection === MADOKA_MOVIE_COLLECTION_SLUG) {
      return MADOKA_FRANCHISE_TITLE;
    }

    const query = selection.replace(/^series-/, '').replace(/-/g, ' ').trim();
    const normalizedQuery = this.normalizeCatalogTitle(query);
    const alias = SERIES_ALIASES.find((entry) => {
      const normalizedAlias = this.normalizeCatalogTitle(entry.title);
      return (
        normalizedQuery === normalizedAlias ||
        normalizedQuery.startsWith(`${normalizedAlias} `) ||
        normalizedAlias.startsWith(`${normalizedQuery} `)
      );
    });

    return alias?.title ?? query;
  }

  private mergeSeriesGroup(group: PopularAnime[]): PopularAnime {
    const ordered = [...group].sort((left, right) => this.compareSeason(left, right));
    const primary = [...group].sort((left, right) => (left.popularity ?? 999999) - (right.popularity ?? 999999))[0];
    const followupItems = this.seasonFollowupItems(ordered);
    const seenSeasonKeys = new Set<string>();
    const seasons: PopularAnimeSeason[] = [];
    for (const anime of followupItems) {
      for (const season of anime.seasons.length > 0 ? anime.seasons : [this.toSeason(anime)]) {
        const key = season.slug || `mal-${season.malId}`;
        if (seenSeasonKeys.has(key)) {
          continue;
        }

        seenSeasonKeys.add(key);
        seasons.push(season);
      }
    }
    const episodes = seasons.reduce((total, season) => total + Math.max(0, season.episodes), 0);
    const years = seasons.map((season) => season.year).filter((year): year is number => year !== null);

    return {
      ...primary,
      slug: `series-${this.slugify(primary.title)}`,
      type: 'Série',
      episodes,
      status: group.some((anime) => anime.status.toLowerCase() === 'currently airing') ? 'Currently Airing' : 'Finished Airing',
      season: null,
      year: years.length > 0 ? Math.min(...years) : null,
      genres: this.unique(group.flatMap((anime) => anime.genres)),
      studios: this.unique(group.flatMap((anime) => anime.studios)),
      seasons,
    };
  }

  private loadSeasonEpisodeOptions(
    season: PopularAnimeSeason,
    offset: number,
    seasonNumber: number,
  ): Observable<AnimeEpisodeOption[]> {
    return this.getJikanSeasonEpisodes(season).pipe(
      map((episodes) => {
        if (episodes.length === 0) {
          return this.fallbackEpisodeOptions(season, offset, seasonNumber);
        }

        const options = episodes.map((episode) => this.toEpisodeOption(season, offset, seasonNumber, episode));
        const knownEpisodes = Math.max(0, season.episodes);
        if (knownEpisodes > options.length) {
          options.push(...this.fallbackEpisodeOptions(season, offset, seasonNumber, options.length + 1));
        }

        return options;
      }),
      switchMap((options) => this.fillMissingEpisodeTitles(season, options)),
      catchError(() => this.getAniListEpisodeOptions(season, offset, seasonNumber)),
    );
  }

  private getJikanSeasonEpisodes(
    season: PopularAnimeSeason,
    page = 1,
    loadedEpisodes: JikanEpisode[] = [],
  ): Observable<JikanEpisode[]> {
    const params = new HttpParams().set('page', page);

    return this.http.get<JikanEpisodesResponse>(`${this.animeUrl}/${season.malId}/episodes`, { params }).pipe(
      switchMap((response) => {
        const episodes = [...loadedEpisodes, ...(response.data ?? [])];
        const knownEpisodes = Math.max(0, season.episodes);
        const pagination = response.pagination;
        const hasNextPage = Boolean(pagination?.has_next_page);
        const lastVisiblePage = Math.max(page, pagination?.last_visible_page ?? page);
        const shouldLoadNext =
          hasNextPage &&
          page < lastVisiblePage &&
          page < 20 &&
          (knownEpisodes <= 0 || episodes.length < knownEpisodes);

        return shouldLoadNext
          ? timer(360).pipe(switchMap(() => this.getJikanSeasonEpisodes(season, page + 1, episodes)))
          : of(episodes);
      }),
    );
  }

  private toEpisodeOption(
    season: PopularAnimeSeason,
    offset: number,
    seasonNumber: number,
    episode: JikanEpisode,
  ): AnimeEpisodeOption {
    const seasonEpisode = episode.mal_id;
    const value = offset + seasonEpisode;
    const title = this.cleanEpisodeTitle(episode.title || episode.title_romanji || episode.title_japanese || '');

    return {
      value,
      title,
      label: title ? `Episode ${seasonEpisode} - ${title}` : `Episode ${seasonEpisode}`,
      seasonTitle: season.title,
      seasonNumber,
      seasonEpisode,
    };
  }

  private fallbackEpisodeOptions(
    season: PopularAnimeSeason,
    offset: number,
    seasonNumber: number,
    startEpisode = 1,
  ): AnimeEpisodeOption[] {
    const totalEpisodes = Math.max(0, season.episodes);
    return Array.from({ length: Math.max(0, totalEpisodes - startEpisode + 1) }, (_, index) => {
      const seasonEpisode = startEpisode + index;
      const value = offset + seasonEpisode;

      return {
        value,
        title: '',
        label: `Episode ${seasonEpisode}`,
        seasonTitle: season.title,
        seasonNumber,
        seasonEpisode,
      };
    });
  }

  private fillMissingEpisodeTitles(
    season: PopularAnimeSeason,
    options: AnimeEpisodeOption[],
  ): Observable<AnimeEpisodeOption[]> {
    if (options.length === 0 || options.every((option) => option.title)) {
      return of(options);
    }

    return this.getAniListEpisodeTitleMap(season).pipe(
      map((titles) =>
        options.map((option) => {
          if (option.title) {
            return option;
          }

          const title = titles.get(option.seasonEpisode) ?? '';
          return title ? { ...option, title, label: `Episode ${option.seasonEpisode} - ${title}` } : option;
        }),
      ),
      catchError(() => of(options)),
    );
  }

  private getAniListEpisodeOptions(
    season: PopularAnimeSeason,
    offset: number,
    seasonNumber: number,
  ): Observable<AnimeEpisodeOption[]> {
    const fallbackOptions = this.fallbackEpisodeOptions(season, offset, seasonNumber);

    return this.getAniListEpisodeTitleMap(season).pipe(
      map((titles) => {
        if (fallbackOptions.length > 0) {
          return fallbackOptions.map((option) => {
            const title = titles.get(option.seasonEpisode) ?? '';
            return title ? { ...option, title, label: `Episode ${option.seasonEpisode} - ${title}` } : option;
          });
        }

        return Array.from(titles.entries()).map(([seasonEpisode, title]) => ({
          value: offset + seasonEpisode,
          title,
          label: `Episode ${seasonEpisode} - ${title}`,
          seasonTitle: season.title,
          seasonNumber,
          seasonEpisode,
        }));
      }),
      catchError(() => of(fallbackOptions)),
    );
  }

  private getAniListEpisodeTitleMap(season: PopularAnimeSeason): Observable<Map<number, string>> {
    const cached = this.anilistEpisodeTitleCache.get(season.malId);
    if (cached) {
      return cached;
    }

    const query = `
      query ($malId: Int) {
        Media(idMal: $malId, type: ANIME) {
          streamingEpisodes {
            title
          }
        }
      }
    `;

    const request$ = this.http
      .post<AniListEpisodesResponse>(this.anilistUrl, {
        query,
        variables: { malId: season.malId },
      })
      .pipe(
        map((response) => {
          const titles = new Map<number, string>();
          for (const [index, episode] of (response.data?.Media?.streamingEpisodes ?? []).entries()) {
            const seasonEpisode = index + 1;
            const title = this.cleanAniListEpisodeTitle(episode.title ?? '', season, seasonEpisode);
            if (title) {
              titles.set(seasonEpisode, title);
            }
          }

          return titles;
        }),
        catchError(() => of(new Map<number, string>())),
        shareReplay(1),
      );

    this.anilistEpisodeTitleCache.set(season.malId, request$);
    return request$;
  }

  private seriesIdentity(anime: PopularAnime): { key: string; title: string } {
    if (!this.shouldGroupAsSeasonFollowup(anime)) {
      return { key: anime.slug, title: anime.title };
    }

    const alias = this.seriesAliasForTitle(anime.title);
    if (alias) {
      return { key: `series-${this.slugify(alias)}`, title: alias };
    }

    const normalizedTitle = this.baseSeriesTitle(anime.title);

    return {
      key: `series-${this.slugify(normalizedTitle || anime.title)}`,
      title: normalizedTitle || anime.title,
    };
  }

  private seriesAliasForTitle(title: string): string | null {
    return SERIES_ALIASES.find((entry) => entry.match.test(title))?.title ?? null;
  }

  private baseSeriesTitle(title: string): string {
    let normalizedTitle = title
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    normalizedTitle = this.stripSeriesSeasonSuffixes(normalizedTitle);

    const subtitleSplit = normalizedTitle.match(/^(.+?)\s*[:：]\s+(.+)$/);
    if (subtitleSplit && this.looksLikeSeasonSubtitle(subtitleSplit[2])) {
      normalizedTitle = subtitleSplit[1].trim();
    }

    normalizedTitle = normalizedTitle
      .replace(/\s*\([^)]*(?:season|part|cour|arc|special|ova|ona)[^)]*\)\s*$/i, '')
      .replace(/\s+(the\s+)?final\s+season.*$/i, '')
      .replace(/\s+(the\s+)?final\s+(?:chapters?|arc|part).*$/i, '')
      .replace(/\s+\d+(st|nd|rd|th)\s+season.*$/i, '')
      .replace(/\s+(?:second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+season.*$/i, '')
      .replace(/\s+season\s+\d+.*$/i, '')
      .replace(/\s+s\d+\b.*$/i, '')
      .replace(/\s+part\s+\d+.*$/i, '')
      .replace(/\s+cour\s+\d+.*$/i, '')
      .replace(/\s+specials?.*$/i, '')
      .replace(/\s+ova.*$/i, '')
      .replace(/\s+ona.*$/i, '')
      .replace(/\s+(?:ii|iii|iv|v|vi|vii|viii|ix|x)\s+(?:part|cour)\s+\d+.*$/i, '')
      .replace(/\s+(?:ii|iii|iv|v|vi|vii|viii|ix|x)\s*$/i, '')
      .trim();

    return normalizedTitle;
  }

  private stripSeriesSeasonSuffixes(title: string): string {
    return title
      .replace(/\s+(the\s+)?final\s+season.*$/i, '')
      .replace(/\s+(the\s+)?final\s+(?:chapters?|arc|part).*$/i, '')
      .replace(/\s+\d+(st|nd|rd|th)\s+season.*$/i, '')
      .replace(/\s+(?:second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+season.*$/i, '')
      .replace(/\s+season\s+\d+.*$/i, '')
      .replace(/\s+part\s+\d+.*$/i, '')
      .replace(/\s+cour\s+\d+.*$/i, '')
      .replace(/\s+(?:ii|iii|iv|v|vi|vii|viii|ix|x)\s+(?:part|cour)\s+\d+.*$/i, '')
      .replace(/\s*:\s*$/i, '')
      .trim();
  }

  private looksLikeSeasonSubtitle(subtitle: string): boolean {
    return /\b(?:season|part|cour|arc|final|chapter|train|district|village|kyoto|mugen|entertainment|swordsmith|war|invasion|underworld|return|returns|revival|commandments|wrath|judgement|judgment|second|third|fourth|ii|iii|iv|v)\b/i.test(
      subtitle,
    );
  }

  private shouldGroupAsSeasonFollowup(anime: PopularAnime): boolean {
    const normalizedType = this.normalizeMediaType(anime.type);
    if (normalizedType === 'serie') {
      return true;
    }

    if (normalizedType === 'tv') {
      return !this.isRelatedButNotMainFollowupTitle(anime.title);
    }

    return this.isCanonicalNonTvFollowup(anime);
  }

  private seasonFollowupItems(items: PopularAnime[]): PopularAnime[] {
    const tvItems = items.filter((item) => this.isTvFollowupType(item.type));
    return items.filter((item) => {
      if (this.isTvFollowupType(item.type)) {
        return true;
      }

      if (!this.isCanonicalNonTvFollowup(item)) {
        return false;
      }

      return !tvItems.some((tvItem) => this.isDuplicateArc(tvItem, item));
    });
  }

  private isTvFollowupType(type: string | null | undefined): boolean {
    const normalizedType = this.normalizeMediaType(type);
    return normalizedType === 'tv' || normalizedType === 'serie';
  }

  private isCanonicalNonTvFollowup(anime: PopularAnime): boolean {
    const sourceTitle = this.followupSourceTitle(anime);
    const normalizedType = this.normalizeMediaType(this.followupSourceType(anime));
    if (!['movie', 'film'].includes(normalizedType)) {
      return false;
    }

    if (isMadokaRecapMovieId(anime.id)) {
      return false;
    }

    if (isMadokaCanonicalFollowupMovieId(anime.id)) {
      return true;
    }

    if (this.isRelatedButNotMainFollowupTitle(sourceTitle)) {
      return false;
    }

    const text = this.normalizeCatalogTitle(`${sourceTitle} ${anime.synopsis}`);
    return (
      this.hasExplicitContinuationText(text) ||
      this.hasSeasonAnchoredNonTvTitle(sourceTitle) ||
      this.isKnownCanonicalNonTvFollowup(sourceTitle)
    );
  }

  private hasExplicitContinuationText(text: string): boolean {
    return (
      text.includes('direct sequel') ||
      text.includes('sequel to') ||
      text.includes('continues the story') ||
      text.includes('continuation of') ||
      text.includes('following the events') ||
      text.includes('after the events') ||
      text.includes('takes place after') ||
      text.includes('final chapter') ||
      text.includes('conclusion') ||
      text.includes('concludes')
    );
  }

  private hasSeasonAnchoredNonTvTitle(title: string): boolean {
    const normalizedTitle = this.normalizeCatalogTitle(title);
    if (/\b(?:case|movie|film|episode|ep) [0-9]+\b/.test(normalizedTitle)) {
      return false;
    }

    return (
      /\b(?:season|part|cour) [0-9]+\b/.test(normalizedTitle) ||
      /\b[0-9]+\b/.test(normalizedTitle)
    );
  }

  private isKnownCanonicalNonTvFollowup(title: string): boolean {
    const normalizedTitle = this.normalizeCatalogTitle(title);
    return (
      normalizedTitle.includes('dawn of the deep soul') ||
      normalizedTitle.includes('mugen train') ||
      normalizedTitle.includes('dreaming girl') ||
      normalizedTitle.includes('sister venturing out') ||
      normalizedTitle.includes('knapsack kid') ||
      normalizedTitle.includes('quintessential quintuplets movie') ||
      normalizedTitle.includes('ordinal scale') ||
      normalizedTitle.includes('infinity castle') ||
      normalizedTitle.includes('first inspector')
    );
  }

  private isDuplicateArc(tvItem: PopularAnime, nonTvItem: PopularAnime): boolean {
    const tvArc = this.followupArcKey(this.followupSourceTitle(tvItem), this.followupSourceJapaneseTitle(tvItem));
    const nonTvArc = this.followupArcKey(this.followupSourceTitle(nonTvItem), this.followupSourceJapaneseTitle(nonTvItem));
    if (!tvArc || !nonTvArc) {
      return false;
    }

    return this.tokenOverlap(tvArc, nonTvArc) >= 0.66;
  }

  private followupSourceTitle(anime: PopularAnime): string {
    return anime.seasons[0]?.title || anime.title;
  }

  private followupSourceJapaneseTitle(anime: PopularAnime): string {
    return anime.seasons[0]?.titleJapanese ?? anime.titleJapanese ?? '';
  }

  private followupSourceType(anime: PopularAnime): string {
    return anime.seasons[0]?.type || anime.type;
  }

  private followupArcKey(title: string, titleJapanese: string): string {
    const alias = this.seriesAliasForTitle(title) ?? this.seriesAliasForTitle(titleJapanese) ?? this.baseSeriesTitle(title);
    let value = this.normalizeCatalogTitle(title);
    const normalizedAlias = this.normalizeCatalogTitle(alias);
    if (normalizedAlias) {
      value = value.replace(normalizedAlias, ' ');
    }

    return value
      .replace(/\b(the|a|an|movie|film|season|part|cour|arc|tv|special|ova|ona|final|chapter|chapters)\b/g, ' ')
      .replace(/\b[0-9]+\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenOverlap(left: string, right: string): number {
    const leftTokens = new Set(left.split(' ').filter((token) => token.length > 2));
    const rightTokens = new Set(right.split(' ').filter((token) => token.length > 2));
    if (leftTokens.size === 0 || rightTokens.size === 0) {
      return 0;
    }

    const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    return shared / Math.min(leftTokens.size, rightTokens.size);
  }

  private isRelatedButNotMainFollowupTitle(title: string): boolean {
    const normalizedTitle = this.normalizeCatalogTitle(title);
    const paddedTitle = ` ${normalizedTitle} `;
    return (
      paddedTitle.includes(' recap ') ||
      paddedTitle.includes(' summary ') ||
      paddedTitle.includes(' compilation ') ||
      paddedTitle.includes(' special ') ||
      paddedTitle.includes(' specials ') ||
      paddedTitle.includes(' ova ') ||
      paddedTitle.includes(' ona ') ||
      paddedTitle.includes(' spin off ') ||
      paddedTitle.includes(' side story ') ||
      paddedTitle.includes(' another story ') ||
      paddedTitle.includes(' alternative ') ||
      paddedTitle.includes(' junior high ') ||
      paddedTitle.includes(' gaiden ') ||
      paddedTitle.includes(' sd ') ||
      paddedTitle.includes(' chibi ') ||
      paddedTitle.includes(' mini anime ') ||
      paddedTitle.includes(' omake ') ||
      paddedTitle.includes(' picture drama ') ||
      paddedTitle.includes(' theater ') ||
      paddedTitle.includes(' theatre ') ||
      paddedTitle.includes(' parody ') ||
      paddedTitle.includes(' petit ') ||
      normalizedTitle.includes('signs of holy war') ||
      normalizedTitle.includes('four knights of the apocalypse') ||
      normalizedTitle.includes('mokushiroku no yonkishi') ||
      normalizedTitle.includes('gun gale online') ||
      normalizedTitle.includes('vigilantes') ||
      normalizedTitle.includes('illegals') ||
      normalizedTitle.includes('rock lee') ||
      normalizedTitle.includes('lee no seishun') ||
      normalizedTitle.includes('explosion on this wonderful world') ||
      normalizedTitle.includes('slime diaries') ||
      normalizedTitle.includes('mr ginpachi') ||
      normalizedTitle.includes('zany class') ||
      normalizedTitle.includes('ginpachi sensei') ||
      normalizedTitle.includes('3 nen z gumi') ||
      normalizedTitle.includes('gintama on theater 2d') ||
      normalizedTitle.includes('yorinuki gintama san on theater 2d') ||
      normalizedTitle.includes('gintama movie 3')
    );
  }

  private normalizeMediaType(type: string | null | undefined): string {
    return this.normalizeCatalogTitle(type ?? '');
  }

  private normalizeCatalogTitle(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private withSeasons(anime: PopularAnime): PopularAnime {
    return anime.seasons.length > 0 ? anime : { ...anime, seasons: [this.toSeason(anime)] };
  }

  private resolveAnimeYear(anime: JikanAnime): number | null {
    if (anime.year) {
      return anime.year;
    }

    const propYear = anime.aired?.prop?.from?.year;
    if (propYear) {
      return propYear;
    }

    const fromYear = anime.aired?.from?.slice(0, 4);
    return fromYear && /^\d{4}$/.test(fromYear) ? Number(fromYear) : null;
  }

  private toSeason(anime: PopularAnime): PopularAnimeSeason {
    return {
      malId: anime.id,
      slug: anime.slug,
      title: anime.title,
      titleJapanese: anime.titleJapanese,
      synopsis: anime.synopsis,
      type: anime.type,
      imageUrl: anime.imageUrl,
      trailerUrl: anime.trailerUrl,
      episodes: anime.episodes,
      status: anime.status,
      score: anime.score,
      rank: anime.rank,
      popularity: anime.popularity,
      season: anime.season,
      year: anime.year,
      genres: anime.genres,
      studios: anime.studios,
    };
  }

  private compareSeason(left: PopularAnime, right: PopularAnime): number {
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

  private cleanEpisodeTitle(title: string): string {
    return title.trim();
  }

  private mapTrailerUrl(trailer: JikanAnime['trailer']): string | null {
    if (!trailer) {
      return null;
    }

    if (trailer.url) {
      return trailer.url;
    }

    if (trailer.embed_url) {
      return trailer.embed_url;
    }

    return trailer.youtube_id ? `https://www.youtube.com/watch?v=${trailer.youtube_id}` : null;
  }

  private cleanSynopsis(synopsis: string | null | undefined, fallback: string): string {
    const cleaned = (synopsis ?? fallback)
      .replace(/\s*\[(?:[^\]]*(?:MAL Rewrite|Written by|Rédigé par|Source:)[^\]]*)\]/gi, '')
      .replace(/\s*\((?:[^)]*(?:MAL Rewrite|Written by|Rédigé par|Source:)[^)]*)\)/gi, '')
      .replace(/[ \t]+\n/g, '\n')
      .trim();

    return cleaned || fallback;
  }

  private cleanAniListEpisodeTitle(rawTitle: string, season: PopularAnimeSeason, seasonEpisode: number): string {
    const title = this.cleanEpisodeTitle(rawTitle);
    if (!title) {
      return '';
    }

    const withoutEpisodePrefix = title
      .replace(new RegExp(`^${this.escapeRegex(season.title)}\\s*[-:–—]?\\s*`, 'i'), '')
      .replace(new RegExp(`^Episode\\s*${seasonEpisode}\\s*[-:–—]?\\s*`, 'i'), '')
      .replace(new RegExp(`^Ep\\.?\\s*${seasonEpisode}\\s*[-:–—]?\\s*`, 'i'), '')
      .replace(new RegExp(`^#?${seasonEpisode}\\s*[-:–—]?\\s*`, 'i'), '')
      .trim();

    return withoutEpisodePrefix || title;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private unique(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
