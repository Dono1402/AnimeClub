export interface PublicProfile {
  id: number;
  pseudo: string;
  displayName: string;
  bio: string;
  profileStatus: string;
  favoriteAnime: string;
  accentColor: string;
  profilePictureUrl: string | null;
  backgroundUrl: string | null;
  online: boolean;
  lastActiveAt: string | null;
  showFollowers: boolean;
  showFollowing: boolean;
  followersCount: number;
  followingCount: number;
  showAnimeLibrary: boolean;
  showMangaLibrary: boolean;
}
