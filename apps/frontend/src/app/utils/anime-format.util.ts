import { PopularAnime, PopularAnimeSeason } from '../models/anime.model';
import { AnimethequeEntry } from '../models/animetheque.model';

export function normalizeAnimeType(type: string | null | undefined): string {
  return (type ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isMovieType(type: string | null | undefined): boolean {
  const normalizedType = normalizeAnimeType(type);
  return normalizedType === 'movie' || normalizedType === 'film';
}

export function isMovieAnime(anime: PopularAnime): boolean {
  return isMovieType(anime.type) || (anime.seasons.length === 1 && isMovieSeason(anime.seasons[0]));
}

export function isMovieSeason(season: PopularAnimeSeason): boolean {
  return isMovieType(season.type);
}

export function isMovieEntry(entry: AnimethequeEntry): boolean {
  return entry.mediaType
    ? isMovieType(entry.mediaType)
    : entry.trackingMode !== 'SEASON' && entry.totalEpisodes === 1;
}

export function animeTypeLabel(type: string | null | undefined): string {
  return isMovieType(type) ? 'Film' : type || 'Anime';
}
