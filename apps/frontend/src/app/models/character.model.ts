export interface CharacterCatalogEntry {
  malId: number;
  slug: string;
  name: string;
  nameKanji: string | null;
  imageUrl: string;
  favorites: number | null;
  about: string;
  nicknames: string[];
  sourceAnimeMalId: number | null;
  sourceAnimeTitle: string | null;
  sourceAnimeSlug: string | null;
  sourceAnimeImageUrl: string | null;
  role: string | null;
  lastSyncedAt: string | null;
}

export interface CharacterCatalogPage {
  items: CharacterCatalogEntry[];
  hasNextPage: boolean;
  totalItems: number;
  page: number;
  pageSize: number;
}

export interface CharacterCatalogImportStatus {
  running: boolean;
  currentPage: number;
  totalPages: number;
  imported: number;
  skipped: number;
  failed: number;
  stored: number;
  linked: number;
  scannedExisting: number;
  totalAnime: number;
  syncedAnime: number;
  pendingAnime: number;
  apiTotalCharacters: number;
  pendingGlobalCharacters: number;
  mode: string;
  lastError: string;
  startedAt: string | null;
  finishedAt: string | null;
  retryMode: boolean;
}
