export interface PopularAnime {
  id: number;
  slug: string;
  title: string;
  titleJapanese: string | null;
  imageUrl: string;
  backgroundUrl: string;
  synopsis: string;
  type: string;
  episodes: number;
  status: string;
  score: number | null;
  rank: number | null;
  popularity: number | null;
  season: string | null;
  year: number | null;
  genres: string[];
  studios: string[];
  trailerUrl: string | null;
  seasons: PopularAnimeSeason[];
}

export interface PopularAnimeSeason {
  malId: number;
  slug: string;
  title: string;
  titleJapanese?: string | null;
  synopsis: string;
  type: string;
  imageUrl: string;
  trailerUrl: string | null;
  episodes: number;
  status?: string | null;
  score?: number | null;
  rank?: number | null;
  popularity?: number | null;
  season: string | null;
  year: number | null;
  studios?: string[];
  genres?: string[];
}

export interface AnimeEpisodeOption {
  value: number;
  title: string;
  label: string;
  seasonTitle: string;
  seasonNumber: number;
  seasonEpisode: number;
}

export interface PopularAnimePage {
  items: PopularAnime[];
  hasNextPage: boolean;
  totalItems: number;
  page: number;
  pageSize: number;
}

export interface AnimeCatalogFilters {
  genre?: string;
  type?: string;
  status?: string;
  year?: string;
  season?: string;
  minScore?: string;
}

export interface AnimeCatalogFilterOptions {
  genres: string[];
  types: string[];
  statuses: string[];
  years: number[];
}
