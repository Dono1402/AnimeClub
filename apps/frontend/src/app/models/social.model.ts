import { AnimethequeEntry } from './animetheque.model';
import { MangaLibraryEntry } from './manga.model';
import { PublicProfile } from './public-profile.model';

export interface FollowState {
  accountId: number;
  targetId: number;
  following: boolean;
  followersCount: number;
  followingCount: number;
  followersVisible: boolean;
  followingVisible: boolean;
  mutualFollow: boolean;
}

export interface FollowFeedEntry {
  profile: PublicProfile;
  type: 'ANIME' | 'MANGA';
  entry: AnimethequeEntry | null;
  mangaEntry: MangaLibraryEntry | null;
  updatedAt: string;
  activityKey?: string;
  activityEntryId?: number;
  likesCount?: number;
  likedByCurrentAccount?: boolean;
}

export interface FollowFeedLikeRequest {
  type: 'ANIME' | 'MANGA';
  entryId: number;
}

export interface FollowFeedLikeResponse {
  activityKey: string;
  type: 'ANIME' | 'MANGA';
  entryId: number;
  likesCount: number;
  likedByCurrentAccount: boolean;
}

export interface AccountNotification {
  id: number;
  type: 'FOLLOW' | 'ACTIVITY_LIKE' | 'FRIEND_ONLINE' | 'USERNAME_CHANGE_REQUIRED' | 'ACHIEVEMENT_UNLOCKED';
  actor: PublicProfile;
  read: boolean;
  createdAt: string;
  achievementId?: string;
  achievementTitle?: string;
  achievementDescription?: string;
  achievementIcon?: string;
  achievementIconUrl?: string;
  local?: boolean;
}

export interface AccountMessage {
  id: number;
  sender: PublicProfile;
  recipient: PublicProfile;
  own: boolean;
  content: string;
  imageUrl: string | null;
  read: boolean;
  createdAt: string;
}

export interface MessageConversation {
  friendId: number;
  friend: PublicProfile;
  lastMessage: AccountMessage | null;
  unreadCount: number;
  friendTyping: boolean;
}

export interface SendMessageRequest {
  content: string;
}
