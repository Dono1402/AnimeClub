export type WatchStatus = 'PLANNED' | 'WATCHING' | 'COMPLETED' | 'PAUSED' | 'DROPPED';
export type AnimeLibraryTrackingMode = 'SERIES' | 'SEASON';

export interface AnimethequeEntry {
  id: number;
  accountId: number;
  animeSlug: string;
  parentAnimeSlug: string | null;
  parentTitle: string | null;
  seasonSlug: string | null;
  seasonTitle: string | null;
  seasonNumber: number | null;
  trackingMode: AnimeLibraryTrackingMode;
  mediaType: string | null;
  title: string;
  coverUrl: string;
  status: WatchStatus;
  watchedEpisodes: number;
  totalEpisodes: number;
  score: number | null;
  favorite: boolean;
  notes: string;
  updatedAt: string;
  catalogScore?: number | null;
  catalogYear?: number | null;
  catalogType?: string | null;
  catalogGenres?: string[] | null;
}

export interface AnimethequeEntryRequest {
  animeSlug: string;
  parentAnimeSlug?: string | null;
  parentTitle?: string | null;
  seasonSlug?: string | null;
  seasonTitle?: string | null;
  seasonNumber?: number | null;
  trackingMode?: AnimeLibraryTrackingMode;
  mediaType?: string | null;
  title: string;
  coverUrl: string;
  status: WatchStatus;
  watchedEpisodes: number;
  totalEpisodes: number;
  score: number | null;
  favorite: boolean;
  notes: string;
}
