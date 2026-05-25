import type { PopularAnime, PopularAnimeSeason } from '../models/anime.model';

export interface SeasonLabelOptions {
  isMainSeason?: (anime: PopularAnime, season: PopularAnimeSeason) => boolean;
}

export interface SeasonLabelResult {
  title: string;
  code: string;
  number: number;
  detail: string;
  isContinuation: boolean;
  explicitSeasonNumber: number | null;
  partNumber: number | null;
}

const defaultMainSeasonPredicate = () => true;

export function labelMainSeason(
  anime: PopularAnime,
  season: PopularAnimeSeason,
  options: SeasonLabelOptions = {},
): SeasonLabelResult {
  const partNumber = seasonPartNumber(season.title);
  const finalPartNumber = finalSeasonPartNumber(season.title);
  const explicitNumber = explicitSeasonNumber(season.title);
  const continuationNumber = continuationSeasonNumber(anime, season, options);

  if (isFinalSeasonTitle(season.title)) {
    const isContinuation = Boolean(finalPartNumber && finalPartNumber > 1);
    return {
      title: isContinuation ? 'Saison finale - Suite' : 'Saison finale',
      code: finalPartNumber ? `SF${finalPartNumber}` : 'SF',
      number: mainSeasonNumberFor(anime, season, options),
      detail: '',
      isContinuation,
      explicitSeasonNumber: explicitNumber,
      partNumber,
    };
  }

  if (continuationNumber) {
    return {
      title: `Saison ${continuationNumber} - Suite`,
      code: `S${continuationNumber}+`,
      number: continuationNumber,
      detail: '',
      isContinuation: true,
      explicitSeasonNumber: explicitNumber,
      partNumber,
    };
  }

  if (explicitNumber) {
    return {
      title: `Saison ${explicitNumber}`,
      code: `S${explicitNumber}`,
      number: explicitNumber,
      detail: '',
      isContinuation: false,
      explicitSeasonNumber: explicitNumber,
      partNumber,
    };
  }

  const seasonNumber = mainSeasonNumberFor(anime, season, options);
  const cleanedTitle = cleanSeasonTitle(anime, season.title);
  const detail =
    !cleanedTitle || isRedundantSeasonDetail(cleanedTitle, seasonNumber) || isCanonicalFirstSeasonDetail(anime, cleanedTitle, options)
      ? ''
      : cleanedTitle;

  return {
    title: detail ? `Saison ${seasonNumber} - ${detail}` : `Saison ${seasonNumber}`,
    code: `S${seasonNumber}`,
    number: seasonNumber,
    detail,
    isContinuation: false,
    explicitSeasonNumber: explicitNumber,
    partNumber,
  };
}

export function uniqueMainSeasonCount(anime: PopularAnime, options: SeasonLabelOptions = {}): number {
  const isMainSeason = options.isMainSeason ?? defaultMainSeasonPredicate;
  return new Set(
    anime.seasons
      .filter((season) => isMainSeason(anime, season))
      .map((season) => labelMainSeason(anime, season, options).number),
  ).size;
}

export function mainSeasonNumberFor(
  anime: PopularAnime,
  season: PopularAnimeSeason,
  options: SeasonLabelOptions = {},
): number {
  const isMainSeason = options.isMainSeason ?? defaultMainSeasonPredicate;
  const seasonIndex = anime.seasons.findIndex((currentSeason) => currentSeason.slug === season.slug);
  const seasonsUntilCurrent = anime.seasons.slice(0, seasonIndex >= 0 ? seasonIndex + 1 : anime.seasons.length);
  const mainSeasonCount = seasonsUntilCurrent.filter(
    (currentSeason) => isMainSeason(anime, currentSeason) && !isSplitSeasonContinuation(anime, currentSeason, options),
  ).length;

  return Math.max(1, mainSeasonCount);
}

export function explicitSeasonNumber(title: string): number | null {
  const normalizedTitle = normalizeSeasonTitle(title);
  const seasonNumberMatch = normalizedTitle.match(/(?:^| )season ([0-9]+)(?: |$)/);
  const seasonRomanMatch = normalizedTitle.match(/(?:^| )season (ii|iii|iv|v|vi|vii|viii|ix|x)(?: |$)/);
  const ordinalMatch = normalizedTitle.match(/(?:^| )([0-9]+)(?:st|nd|rd|th) season(?: |$)/);
  const trailingRomanMatch = normalizedTitle.match(/(?:^| )(ii|iii|iv|v|vi|vii|viii|ix)(?:$| (?:part|cour|season)(?: |$))/);
  const splitRomanMatch = normalizedTitle.match(/(?:^| )(ii|iii|iv|v|vi|vii|viii|ix)(?= .*(?:^| )(?:part|cour) [0-9]+(?: |$))/);
  const numericValue = Number(seasonNumberMatch?.[1] ?? ordinalMatch?.[1] ?? 0);

  if (numericValue > 0) {
    return numericValue;
  }

  return romanNumeralValue(seasonRomanMatch?.[1] ?? trailingRomanMatch?.[1] ?? splitRomanMatch?.[1] ?? '') ?? null;
}

export function seasonPartNumber(title: string): number | null {
  const normalizedTitle = normalizeSeasonTitle(title);
  const value = Number(
    normalizedTitle.match(/(?:^| )(?:part|cour) ([0-9]+)(?: |$)/)?.[1] ??
      normalizedTitle.match(/(?:^| )([0-9]+)(?:st|nd|rd|th) cour(?: |$)/)?.[1] ??
      0,
  );

  return value > 0 ? value : null;
}

export function isSplitSeasonContinuation(
  anime: PopularAnime,
  season: PopularAnimeSeason,
  options: SeasonLabelOptions = {},
): boolean {
  return continuationSeasonNumber(anime, season, options) !== null;
}

export function continuationSeasonNumber(
  anime: PopularAnime,
  season: PopularAnimeSeason,
  options: SeasonLabelOptions = {},
): number | null {
  return partContinuationSeasonNumber(anime, season, options) ?? subtitleContinuationSeasonNumber(anime, season, options);
}

export function splitSeasonContinuationDetail(anime: PopularAnime, title: string): string {
  const normalizedAnimeTitle = normalizeSeasonTitle(anime.title);
  let detail = normalizeSeasonTitle(title);

  if (detail === normalizedAnimeTitle) {
    detail = '';
  } else if (detail.startsWith(`${normalizedAnimeTitle} `)) {
    detail = detail.slice(normalizedAnimeTitle.length).trim();
  }

  return detail
    .replace(/\bseason [0-9]+\b/g, ' ')
    .replace(/\bseason (?:ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, ' ')
    .replace(/\b[0-9]+(?:st|nd|rd|th) season\b/g, ' ')
    .replace(/\bpart [0-9]+\b/g, ' ')
    .replace(/\bcour [0-9]+\b/g, ' ')
    .replace(/\b(?:ii|iii|iv|v|vi|vii|viii|ix)\b(?=\s*$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanSeasonTitle(anime: PopularAnime, title: string): string {
  let cleaned = title.trim();
  for (const removableTitle of [anime.title, anime.titleJapanese].filter(Boolean) as string[]) {
    cleaned = cleaned.replace(new RegExp(escapeRegExp(removableTitle), 'gi'), ' ');
  }

  return cleaned
    .replace(/\bseason\s+\d+\b/gi, ' ')
    .replace(/\bseason\s+(ii|iii|iv|v|vi|vii|viii|ix|x)\b/gi, ' ')
    .replace(/\bpart\s+(\d+)\b/gi, 'Partie $1')
    .replace(/[:\-\u2013\u2014]+/g, ' ')
    .replace(/^[\s.。:;\-\u2013\u2014]+/g, ' ')
    .replace(/[\s.。:;\-\u2013\u2014]+$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function finalSeasonPartNumber(title: string): number | null {
  return isFinalSeasonTitle(title) ? seasonPartNumber(title) : null;
}

export function isFinalSeasonTitle(title: string): boolean {
  return normalizeSeasonTitle(title).includes('final season');
}

export function normalizeSeasonTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function romanNumeralValue(value: string): number | null {
  switch (value.trim().toLowerCase()) {
    case 'ii':
      return 2;
    case 'iii':
      return 3;
    case 'iv':
      return 4;
    case 'v':
      return 5;
    case 'vi':
      return 6;
    case 'vii':
      return 7;
    case 'viii':
      return 8;
    case 'ix':
      return 9;
    case 'x':
      return 10;
    default:
      return null;
  }
}

function partContinuationSeasonNumber(
  anime: PopularAnime,
  season: PopularAnimeSeason,
  options: SeasonLabelOptions,
): number | null {
  const partNumber = seasonPartNumber(season.title);
  if (!partNumber || partNumber < 2) {
    return null;
  }

  const explicitNumber = explicitSeasonNumber(season.title);
  if (explicitNumber) {
    return explicitNumber;
  }

  const previousSeason = previousMainSeason(anime, season, options);
  if (!previousSeason) {
    return null;
  }

  const currentDetail = splitSeasonContinuationDetail(anime, season.title);
  const previousDetail = splitSeasonContinuationDetail(anime, previousSeason.title);
  if (currentDetail !== previousDetail) {
    return null;
  }

  const previousPartNumber = seasonPartNumber(previousSeason.title);
  if (partNumber === 2 && (!previousPartNumber || previousPartNumber === 1)) {
    return mainSeasonNumberFor(anime, previousSeason, options);
  }

  return null;
}

function subtitleContinuationSeasonNumber(
  anime: PopularAnime,
  season: PopularAnimeSeason,
  options: SeasonLabelOptions,
): number | null {
  const explicitNumber = explicitSeasonNumber(season.title);
  if (!explicitNumber || explicitNumber < 2) {
    return null;
  }

  const continuationDetail = splitSeasonContinuationDetail(anime, season.title);
  if (!continuationDetail || isCanonicalFirstSeasonDetail(anime, continuationDetail, options)) {
    return null;
  }

  const previousSeason = previousMainSeason(
    anime,
    season,
    options,
    (candidate) => splitSeasonContinuationDetail(anime, candidate.title) === continuationDetail,
  );

  return previousSeason ? mainSeasonNumberFor(anime, previousSeason, options) : null;
}

function previousMainSeason(
  anime: PopularAnime,
  season: PopularAnimeSeason,
  options: SeasonLabelOptions,
  predicate: (candidate: PopularAnimeSeason) => boolean = () => true,
): PopularAnimeSeason | null {
  const isMainSeason = options.isMainSeason ?? defaultMainSeasonPredicate;
  const seasonIndex = anime.seasons.findIndex((currentSeason) => currentSeason.slug === season.slug);
  const previousSeasons = anime.seasons.slice(0, Math.max(0, seasonIndex));

  for (let index = previousSeasons.length - 1; index >= 0; index -= 1) {
    const candidate = previousSeasons[index];
    if (isMainSeason(anime, candidate) && predicate(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isCanonicalFirstSeasonDetail(
  anime: PopularAnime,
  detail: string,
  options: SeasonLabelOptions,
): boolean {
  const normalizedDetail = normalizeSeasonTitle(detail);
  if (!normalizedDetail) {
    return false;
  }

  const firstDetail = canonicalFirstSeasonDetail(anime, options);
  return Boolean(firstDetail && normalizedDetail === firstDetail);
}

function canonicalFirstSeasonDetail(anime: PopularAnime, options: SeasonLabelOptions): string | null {
  const isMainSeason = options.isMainSeason ?? defaultMainSeasonPredicate;
  const firstSeason = anime.seasons.find((season) => isMainSeason(anime, season));
  if (!firstSeason || explicitSeasonNumber(firstSeason.title)) {
    return null;
  }

  const firstDetail = normalizeSeasonTitle(cleanSeasonTitle(anime, firstSeason.title));
  if (!firstDetail) {
    return null;
  }

  const repeatedByNumberedSeason = anime.seasons.some(
    (season) =>
      season.slug !== firstSeason.slug &&
      isMainSeason(anime, season) &&
      Boolean(explicitSeasonNumber(season.title)) &&
      normalizeSeasonTitle(cleanSeasonTitle(anime, season.title)) === firstDetail,
  );

  return repeatedByNumberedSeason ? firstDetail : null;
}

function isRedundantSeasonDetail(detail: string, seasonNumber: number): boolean {
  const normalizedDetail = normalizeSeasonTitle(detail);
  if (normalizedDetail === String(seasonNumber)) {
    return true;
  }

  return romanNumeralValue(normalizedDetail) === seasonNumber;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
