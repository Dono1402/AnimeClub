import { WatchStatus } from './animetheque.model';

export interface PopularManga {
  id: number;
  slug: string;
  title: string;
  titleJapanese: string | null;
  imageUrl: string;
  synopsis: string;
  type: string;
  chapters: number;
  volumes: number;
  status: string;
  score: number | null;
  rank: number | null;
  popularity: number | null;
  genres: string[];
  authors: string[];
  published: string;
}

export interface MangaCatalogGenreOption {
  id: number;
  name: string;
}

export interface MangaCatalogFilterOptions {
  genres: MangaCatalogGenreOption[];
  types: string[];
  statuses: string[];
  years: number[];
}

export interface MangaCatalogFilters {
  genre?: string;
  type?: string;
  status?: string;
  year?: string;
  minScore?: string;
}

export interface PopularMangaPage {
  items: PopularManga[];
  hasNextPage: boolean;
  totalItems: number;
  page: number;
  pageSize: number;
}

export interface MangaLibraryEntry {
  id: number;
  mangaSlug: string;
  title: string;
  coverUrl: string;
  status: WatchStatus;
  readChapters: number;
  totalChapters: number;
  readVolumes: number;
  totalVolumes: number;
  score: number | null;
  favorite: boolean;
  notes: string;
  updatedAt?: string;
  catalogType: string | null;
  catalogScore: number | null;
  catalogYear: number | null;
  catalogGenres: string[];
  catalogAuthors: string[];
}

export interface MangaLibraryEntryRequest {
  mangaSlug: string;
  title: string;
  coverUrl: string;
  status: WatchStatus;
  readChapters: number;
  totalChapters: number;
  readVolumes: number;
  totalVolumes: number;
  score: number | null;
  favorite: boolean;
  notes: string;
  catalogType: string | null;
  catalogScore: number | null;
  catalogYear: number | null;
  catalogGenres: string[];
  catalogAuthors: string[];
}
