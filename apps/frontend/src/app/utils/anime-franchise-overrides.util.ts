import type { PopularAnime, PopularAnimeSeason } from '../models/anime.model';

export const MADOKA_MAIN_ANIME_ID = 9756;
export const MADOKA_FRANCHISE_TITLE = 'Puella Magi Madoka Magica';
export const MADOKA_MOVIE_COLLECTION_TITLE = `${MADOKA_FRANCHISE_TITLE} - Films`;
export const MADOKA_MOVIE_COLLECTION_SLUG =
  'series-puella-magi-madoka-magica-films';

const MADOKA_MOVIE_IDS = [11977, 11979, 11981, 48820] as const;
const MADOKA_RECAP_MOVIE_IDS = new Set<number>([11977, 11979]);
const MADOKA_FOLLOWUP_MOVIE_IDS = new Set<number>([11981, 48820]);

export function isMadokaMovieId(malId: number): boolean {
  return MADOKA_MOVIE_IDS.includes(malId as (typeof MADOKA_MOVIE_IDS)[number]);
}

export function isMadokaRecapMovieId(malId: number): boolean {
  return MADOKA_RECAP_MOVIE_IDS.has(malId);
}

export function isMadokaCanonicalFollowupMovieId(malId: number): boolean {
  return MADOKA_FOLLOWUP_MOVIE_IDS.has(malId);
}

export function madokaMovieNumber(malId: number): number | null {
  const index = MADOKA_MOVIE_IDS.indexOf(
    malId as (typeof MADOKA_MOVIE_IDS)[number],
  );
  return index >= 0 ? index + 1 : null;
}

export function containsMadokaMovie(anime: PopularAnime): boolean {
  return anime.seasons.some((season) => isMadokaMovieId(season.malId));
}

export function isMadokaMovieOnlyGroup(anime: PopularAnime): boolean {
  return (
    anime.seasons.length > 0 &&
    anime.seasons.every((season) => isMadokaMovieId(season.malId))
  );
}

export function buildMadokaMovieCollection(
  items: PopularAnime[],
): PopularAnime | null {
  const seasonsById = new Map<number, PopularAnimeSeason>();

  for (const item of items) {
    const seasons = item.seasons.length > 0 ? item.seasons : [toSeason(item)];
    for (const season of seasons) {
      if (isMadokaMovieId(season.malId) && !seasonsById.has(season.malId)) {
        seasonsById.set(season.malId, season);
      }
    }
  }

  const seasons = [...seasonsById.values()].sort(
    (left, right) =>
      (madokaMovieNumber(left.malId) ?? 999) -
      (madokaMovieNumber(right.malId) ?? 999),
  );
  if (seasons.length === 0) {
    return null;
  }

  const firstSeason = seasons[0];
  const primary =
    items.find((item) => item.id === firstSeason.malId) ??
    items.find((item) => containsMadokaMovie(item));
  if (!primary) {
    return null;
  }

  const sources = items.filter((item) =>
    item.seasons.some((season) => isMadokaMovieId(season.malId)),
  );
  const years = seasons
    .map((season) => season.year)
    .filter((year): year is number => year !== null);

  return {
    ...primary,
    id: firstSeason.malId,
    slug: MADOKA_MOVIE_COLLECTION_SLUG,
    title: MADOKA_MOVIE_COLLECTION_TITLE,
    titleJapanese: firstSeason.titleJapanese ?? primary.titleJapanese,
    imageUrl: firstSeason.imageUrl || primary.imageUrl,
    backgroundUrl: primary.backgroundUrl || firstSeason.imageUrl,
    synopsis: firstSeason.synopsis || primary.synopsis,
    type: 'Serie',
    episodes: seasons.reduce(
      (total, season) => total + Math.max(1, season.episodes),
      0,
    ),
    status: firstSeason.status || primary.status,
    score: firstSeason.score ?? primary.score,
    rank: firstSeason.rank ?? primary.rank,
    popularity: firstSeason.popularity ?? primary.popularity,
    season: null,
    year: years.length > 0 ? Math.min(...years) : null,
    genres: unique(sources.flatMap((item) => item.genres)),
    studios: unique(sources.flatMap((item) => item.studios)),
    trailerUrl: firstSeason.trailerUrl ?? primary.trailerUrl,
    seasons,
  };
}

function toSeason(anime: PopularAnime): PopularAnimeSeason {
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

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
