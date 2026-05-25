export type CatalogKind = 'anime' | 'manga' | 'drama' | 'music';

export interface CatalogItem {
  slug: string;
  title: string;
  originalTitle: string;
  kind: CatalogKind;
  format: string;
  season: string;
  genres: string[];
  mood: string;
  studio: string;
  episodes: number;
  communityScore: number;
  year: number;
  synopsis: string;
  imageUrl: string;
  accent: string;
}
