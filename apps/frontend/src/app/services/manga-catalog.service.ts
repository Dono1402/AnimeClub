import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, retry, timer } from 'rxjs';

import { FALLBACK_POPULAR_MANGA } from '../data/manga.data';
import {
  MangaCatalogFilterOptions,
  MangaCatalogFilters,
  MangaCatalogGenreOption,
  PopularManga,
  PopularMangaPage,
} from '../models/manga.model';

interface JikanNamedResource {
  mal_id?: number;
  name?: string;
}

interface JikanImageSet {
  image_url?: string;
  large_image_url?: string;
}

interface JikanManga {
  mal_id: number;
  title?: string;
  title_english?: string | null;
  title_japanese?: string | null;
  images?: {
    jpg?: JikanImageSet;
    webp?: JikanImageSet;
  };
  synopsis?: string | null;
  type?: string | null;
  chapters?: number | null;
  volumes?: number | null;
  status?: string | null;
  score?: number | null;
  rank?: number | null;
  popularity?: number | null;
  genres?: JikanNamedResource[];
  authors?: JikanNamedResource[];
  published?: {
    string?: string | null;
    from?: string | null;
    prop?: {
      from?: {
        year?: number | null;
      } | null;
    } | null;
  };
}

interface JikanMangaResponse {
  data?: JikanManga[];
  pagination?: {
    has_next_page?: boolean;
    items?: {
      total?: number;
      per_page?: number;
    };
  };
}

interface JikanMangaDetailResponse {
  data?: JikanManga;
}

interface JikanGenresResponse {
  data?: JikanNamedResource[];
}

const MANGA_PAGE_SIZE = 9;
const MANGA_RANKING_PAGE_SIZE = 9;
const MANGA_PREVIEW_POOL_SIZE = 25;
type MangaCatalogSortMode = 'popularity-asc' | 'title-asc' | 'title-desc' | 'volumes-desc' | 'score-desc' | 'rank-asc';

@Injectable({ providedIn: 'root' })
export class MangaCatalogService {
  private readonly http = inject(HttpClient);
  private readonly mangaUrl = 'https://api.jikan.moe/v4/manga';
  private readonly topMangaUrl = 'https://api.jikan.moe/v4/top/manga';
  private readonly mangaGenresUrl = 'https://api.jikan.moe/v4/genres/manga';

  getPopularManga(
    page: number,
    sortMode: MangaCatalogSortMode = 'popularity-asc',
    filters: MangaCatalogFilters = {},
  ): Observable<PopularMangaPage> {
    const hasFilters = this.hasCatalogFilters(filters);
    if (sortMode === 'rank-asc' && !hasFilters) {
      return this.getJikanTopManga(page);
    }

    const jikanSort = this.jikanSortFor(sortMode);
    return this.getJikanPopularManga(page, jikanSort.orderBy, jikanSort.sort, filters);
  }

  searchManga(
    query: string,
    page: number,
    sortMode: MangaCatalogSortMode = 'popularity-asc',
    filters: MangaCatalogFilters = {},
  ): Observable<PopularMangaPage> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return this.getPopularManga(page, sortMode, filters);
    }

    const jikanSort = this.jikanSortFor(sortMode);
    return this.searchJikanManga(cleanQuery, page, jikanSort.orderBy, jikanSort.sort, filters);
  }

  getMangaCatalogTotal(): Observable<number> {
    return this.getJikanPopularManga(1, 'title', 'asc', {}).pipe(map((page) => page.totalItems));
  }

  getPreviewManga(count = 15): Observable<PopularMangaPage> {
    const cleanCount = Math.max(1, Math.min(count, 25));
    const poolSize = Math.max(cleanCount, MANGA_PREVIEW_POOL_SIZE);

    return this.getJikanPopularManga(1, 'popularity', 'asc', {}, Math.min(poolSize, 25)).pipe(
      map((page) => this.toRandomPreviewPage(page, cleanCount)),
    );
  }

  getMangaBySlug(slug: string): Observable<PopularManga | null> {
    const cleanSlug = slug.trim().toLowerCase();
    const mangaId = this.mangaIdFromSlug(cleanSlug);
    if (mangaId === null) {
      return of(this.fallbackManga(cleanSlug));
    }

    return this.http.get<JikanMangaDetailResponse>(`${this.mangaUrl}/${mangaId}`).pipe(
      retry({
        count: 2,
        delay: (_error, retryCount) => timer(retryCount * 1400),
      }),
      map((response) => response.data ? this.mapManga(response.data) : this.fallbackManga(cleanSlug)),
      catchError(() => of(this.fallbackManga(cleanSlug))),
    );
  }

  getFilterOptions(): Observable<MangaCatalogFilterOptions> {
    return this.http.get<JikanGenresResponse>(this.mangaGenresUrl).pipe(
      retry({
        count: 2,
        delay: (_error, retryCount) => timer(retryCount * 1000),
      }),
      map((response) => ({
        genres: this.mapGenreOptions(response.data),
        types: ['Manga', 'Novel', 'Light Novel', 'One-shot', 'Doujinshi', 'Manhwa', 'Manhua'],
        statuses: ['Publishing', 'Finished', 'On Hiatus', 'Discontinued', 'Not yet published'],
        years: this.catalogYears(),
      })),
      catchError(() =>
        of({
          genres: [],
          types: ['Manga', 'Novel', 'Light Novel', 'One-shot', 'Doujinshi', 'Manhwa', 'Manhua'],
          statuses: ['Publishing', 'Finished', 'On Hiatus', 'Discontinued', 'Not yet published'],
          years: this.catalogYears(),
        }),
      ),
    );
  }

  private hasCatalogFilters(filters: MangaCatalogFilters): boolean {
    return Boolean(
      filters.genre?.trim() ||
        filters.type?.trim() ||
        filters.status?.trim() ||
        filters.year?.trim() ||
        filters.minScore?.trim(),
    );
  }

  private getJikanPopularManga(
    page: number,
    orderBy = 'popularity',
    sort = 'asc',
    filters: MangaCatalogFilters = {},
    limit = MANGA_PAGE_SIZE,
  ): Observable<PopularMangaPage> {
    let params = new HttpParams()
      .set('order_by', orderBy)
      .set('sort', sort)
      .set('sfw', 'true')
      .set('page', page)
      .set('limit', limit);
    params = this.applyJikanFilters(params, filters);

    return this.http.get<JikanMangaResponse>(this.mangaUrl, { params }).pipe(
      retry({
        count: 3,
        delay: (_error, retryCount) => timer(retryCount * 1800),
      }),
      map((response) => ({
        items: (response.data ?? []).map((manga) => this.mapManga(manga)),
        hasNextPage: response.pagination?.has_next_page ?? false,
        totalItems: response.pagination?.items?.total ?? 0,
        page,
        pageSize: response.pagination?.items?.per_page ?? limit,
      })),
      catchError(() => of(this.fallbackPage(page))),
    );
  }

  private toRandomPreviewPage(page: PopularMangaPage, count: number): PopularMangaPage {
    const items = this.shuffleManga(page.items).slice(0, count);

    return {
      ...page,
      items,
      hasNextPage: false,
      totalItems: items.length,
      page: 1,
      pageSize: items.length || count,
    };
  }

  private shuffleManga(items: PopularManga[]): PopularManga[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const targetIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[targetIndex]] = [shuffled[targetIndex], shuffled[index]];
    }

    return shuffled;
  }

  private getJikanTopManga(page: number): Observable<PopularMangaPage> {
    const params = new HttpParams()
      .set('sfw', 'true')
      .set('page', page)
      .set('limit', MANGA_RANKING_PAGE_SIZE);

    return this.http.get<JikanMangaResponse>(this.topMangaUrl, { params }).pipe(
      retry({
        count: 3,
        delay: (_error, retryCount) => timer(retryCount * 1800),
      }),
      map((response) => ({
        items: (response.data ?? []).map((manga) => this.mapManga(manga)),
        hasNextPage: response.pagination?.has_next_page ?? false,
        totalItems: response.pagination?.items?.total ?? 0,
        page,
        pageSize: response.pagination?.items?.per_page ?? MANGA_RANKING_PAGE_SIZE,
      })),
      catchError(() => of(this.fallbackPage(page))),
    );
  }

  private searchJikanManga(
    cleanQuery: string,
    page: number,
    orderBy = 'popularity',
    sort = 'asc',
    filters: MangaCatalogFilters = {},
  ): Observable<PopularMangaPage> {
    let params = new HttpParams()
      .set('q', cleanQuery)
      .set('order_by', orderBy)
      .set('sort', sort)
      .set('sfw', 'true')
      .set('page', page)
      .set('limit', MANGA_PAGE_SIZE);
    params = this.applyJikanFilters(params, filters);

    return this.http.get<JikanMangaResponse>(this.mangaUrl, { params }).pipe(
      retry({
        count: 3,
        delay: (_error, retryCount) => timer(retryCount * 1800),
      }),
      map((response) => ({
        items: (response.data ?? []).map((manga) => this.mapManga(manga)),
        hasNextPage: response.pagination?.has_next_page ?? false,
        totalItems: response.pagination?.items?.total ?? 0,
        page,
        pageSize: response.pagination?.items?.per_page ?? MANGA_PAGE_SIZE,
      })),
      catchError(() => of(this.fallbackPage(page))),
    );
  }

  private applyJikanFilters(params: HttpParams, filters: MangaCatalogFilters): HttpParams {
    let nextParams = params;
    const genre = this.cleanGenreFilter(filters.genre);
    const year = this.cleanYearFilter(filters.year);
    const type = this.jikanTypeFilter(filters.type);
    const status = this.jikanStatusFilter(filters.status);
    const minScore = this.cleanMinScoreFilter(filters.minScore);

    if (genre) {
      nextParams = nextParams.set('genres', genre);
    }
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

  private jikanSortFor(sortMode: MangaCatalogSortMode): { orderBy: string; sort: string } {
    switch (sortMode) {
      case 'title-desc':
        return { orderBy: 'title', sort: 'desc' };
      case 'rank-asc':
        return { orderBy: 'rank', sort: 'asc' };
      case 'score-desc':
        return { orderBy: 'score', sort: 'desc' };
      case 'volumes-desc':
        return { orderBy: 'volumes', sort: 'desc' };
      case 'popularity-asc':
      case 'title-asc':
      default:
        return sortMode === 'title-asc'
          ? { orderBy: 'title', sort: 'asc' }
          : { orderBy: 'popularity', sort: 'asc' };
    }
  }

  private cleanGenreFilter(value: string | undefined): string {
    const genre = Number(value?.trim());
    return Number.isInteger(genre) && genre > 0 ? String(genre) : '';
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
      case 'manga':
        return 'manga';
      case 'novel':
        return 'novel';
      case 'light novel':
      case 'lightnovel':
        return 'lightnovel';
      case 'one-shot':
      case 'oneshot':
        return 'oneshot';
      case 'doujinshi':
      case 'doujin':
        return 'doujin';
      case 'manhwa':
        return 'manhwa';
      case 'manhua':
        return 'manhua';
      default:
        return '';
    }
  }

  private jikanStatusFilter(value: string | undefined): string {
    switch (this.normalizeJikanFilterValue(value)) {
      case 'publishing':
      case 'en cours':
        return 'publishing';
      case 'finished':
      case 'termine':
      case 'complete':
        return 'complete';
      case 'on hiatus':
      case 'en pause':
        return 'hiatus';
      case 'discontinued':
      case 'arrete':
        return 'discontinued';
      case 'not yet published':
      case 'a venir':
        return 'upcoming';
      default:
        return '';
    }
  }

  private normalizeJikanFilterValue(value: string | undefined): string {
    return (value ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private mapManga(manga: JikanManga): PopularManga {
    const imageUrl =
      manga.images?.webp?.large_image_url ??
      manga.images?.jpg?.large_image_url ??
      manga.images?.webp?.image_url ??
      manga.images?.jpg?.image_url ??
      '';

    return {
      id: manga.mal_id,
      slug: `manga-${manga.mal_id}`,
      title: manga.title_english || manga.title || `Manga ${manga.mal_id}`,
      titleJapanese: manga.title_japanese ?? null,
      imageUrl,
      synopsis: this.cleanSynopsis(manga.synopsis, 'Aucun resume disponible pour le moment.'),
      type: manga.type ?? 'Manga',
      chapters: manga.chapters ?? 0,
      volumes: manga.volumes ?? 0,
      status: manga.status ?? 'Statut inconnu',
      score: manga.score ?? null,
      rank: manga.rank ?? null,
      popularity: manga.popularity ?? null,
      genres: (manga.genres ?? []).map((genre) => genre.name).filter((name): name is string => Boolean(name)),
      authors: (manga.authors ?? []).map((author) => author.name).filter((name): name is string => Boolean(name)),
      published: manga.published?.string ?? this.publishedYear(manga) ?? '',
    };
  }

  private mapGenreOptions(genres: JikanNamedResource[] | undefined): MangaCatalogGenreOption[] {
    const options = (genres ?? [])
      .map((genre) => ({
        id: Number(genre.mal_id),
        name: genre.name?.trim() ?? '',
      }))
      .filter((genre) => Number.isInteger(genre.id) && genre.id > 0 && Boolean(genre.name));
    const byName = new Map<string, MangaCatalogGenreOption>();
    for (const option of options) {
      const key = option.name.toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, option);
      }
    }

    return Array.from(byName.values()).sort((left, right) => left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' }));
  }

  private catalogYears(): number[] {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: currentYear - 1940 + 1 }, (_, index) => currentYear - index);
  }

  private fallbackPage(page: number): PopularMangaPage {
    return {
      items: page === 1 ? FALLBACK_POPULAR_MANGA.slice(0, MANGA_PAGE_SIZE) : [],
      hasNextPage: false,
      totalItems: page === 1 ? FALLBACK_POPULAR_MANGA.length : 0,
      page,
      pageSize: MANGA_PAGE_SIZE,
    };
  }

  private fallbackManga(slug: string): PopularManga | null {
    return FALLBACK_POPULAR_MANGA.find((manga) => manga.slug.toLowerCase() === slug) ?? null;
  }

  private mangaIdFromSlug(slug: string): number | null {
    const match = /^(?:manga-)?(\d+)$/.exec(slug);
    if (!match) {
      return null;
    }

    const id = Number(match[1]);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  private publishedYear(manga: JikanManga): string | null {
    const propYear = manga.published?.prop?.from?.year;
    if (propYear) {
      return String(propYear);
    }

    const fromYear = manga.published?.from?.slice(0, 4);
    return fromYear && /^\d{4}$/.test(fromYear) ? fromYear : null;
  }

  private cleanSynopsis(synopsis: string | null | undefined, fallback: string): string {
    const cleaned = (synopsis ?? fallback)
      .replace(/\s*\[(?:[^\]]*(?:MAL Rewrite|Written by|Redige par|Source:)[^\]]*)\]/gi, '')
      .replace(/\s*\((?:[^)]*(?:MAL Rewrite|Written by|Redige par|Source:)[^)]*)\)/gi, '')
      .replace(/[ \t]+\n/g, '\n')
      .trim();

    return cleaned || fallback;
  }
}
