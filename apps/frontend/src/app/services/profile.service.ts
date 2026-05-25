import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { Account, UpdatePrivacyRequest } from '../models/account.model';
import { PublicProfile } from '../models/public-profile.model';
import {
  AccountMessage,
  AccountNotification,
  FollowFeedEntry,
  FollowFeedLikeRequest,
  FollowFeedLikeResponse,
  FollowState,
  MessageConversation,
  SendMessageRequest,
} from '../models/social.model';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly accountUrl = `${environment.apiUrl}/account`;

  get(accountId: number): Observable<Account> {
    return this.http.get<Account>(`${this.accountUrl}/${accountId}`);
  }

  getPublicProfile(pseudo: string): Observable<PublicProfile> {
    return this.http.get<PublicProfile>(`${this.accountUrl}/public/${encodeURIComponent(pseudo)}`);
  }

  getPublicProfiles(): Observable<PublicProfile[]> {
    return this.http.get<PublicProfile[]>(`${this.accountUrl}/public`);
  }

  followState(accountId: number, targetId: number): Observable<FollowState> {
    return this.http.get<FollowState>(`${this.accountUrl}/${accountId}/follow-state/${targetId}`);
  }

  follow(accountId: number, targetId: number): Observable<FollowState> {
    return this.http.post<FollowState>(`${this.accountUrl}/${accountId}/follow/${targetId}`, {});
  }

  unfollow(accountId: number, targetId: number): Observable<FollowState> {
    return this.http.delete<FollowState>(`${this.accountUrl}/${accountId}/follow/${targetId}`);
  }

  following(accountId: number): Observable<PublicProfile[]> {
    return this.http.get<PublicProfile[]>(`${this.accountUrl}/${accountId}/following`);
  }

  followers(accountId: number): Observable<PublicProfile[]> {
    return this.http.get<PublicProfile[]>(`${this.accountUrl}/${accountId}/followers`);
  }

  onlineDiscoveryProfiles(accountId: number): Observable<PublicProfile[]> {
    return this.http.get<PublicProfile[]>(`${this.accountUrl}/${accountId}/online-discovery`);
  }

  publicFollowers(pseudo: string): Observable<PublicProfile[]> {
    return this.http.get<PublicProfile[]>(`${this.accountUrl}/public/${encodeURIComponent(pseudo)}/followers`);
  }

  publicFollowing(pseudo: string): Observable<PublicProfile[]> {
    return this.http.get<PublicProfile[]>(`${this.accountUrl}/public/${encodeURIComponent(pseudo)}/following`);
  }

  followingFeed(accountId: number): Observable<FollowFeedEntry[]> {
    return this.http.get<FollowFeedEntry[]>(`${this.accountUrl}/${accountId}/following-feed`);
  }

  toggleFollowingFeedLike(accountId: number, request: FollowFeedLikeRequest): Observable<FollowFeedLikeResponse> {
    return this.http.post<FollowFeedLikeResponse>(`${this.accountUrl}/${accountId}/following-feed/like`, request);
  }

  friends(accountId: number): Observable<PublicProfile[]> {
    return this.http.get<PublicProfile[]>(`${this.accountUrl}/${accountId}/friends`);
  }

  messageConversations(accountId: number): Observable<MessageConversation[]> {
    return this.http.get<MessageConversation[]>(`${this.accountUrl}/${accountId}/messages`);
  }

  messages(accountId: number, friendId: number): Observable<AccountMessage[]> {
    return this.http.get<AccountMessage[]>(`${this.accountUrl}/${accountId}/messages/${friendId}`);
  }

  markPresence(accountId: number): Observable<void> {
    return this.http.put<void>(`${this.accountUrl}/${accountId}/presence`, {});
  }

  markTyping(accountId: number, friendId: number): Observable<void> {
    return this.http.put<void>(`${this.accountUrl}/${accountId}/messages/${friendId}/typing`, {});
  }

  sendMessage(accountId: number, friendId: number, request: SendMessageRequest): Observable<AccountMessage> {
    return this.http.post<AccountMessage>(`${this.accountUrl}/${accountId}/messages/${friendId}`, request);
  }

  sendMessageWithImage(accountId: number, friendId: number, content: string, image: File): Observable<AccountMessage> {
    const formData = new FormData();
    if (content.trim()) {
      formData.append('content', content.trim());
    }
    formData.append('image', image);

    return this.http.post<AccountMessage>(`${this.accountUrl}/${accountId}/messages/${friendId}`, formData);
  }

  messageImage(path: string): Observable<Blob> {
    const url = this.assetUrl(path);
    if (!url) {
      return throwError(() => new Error('Image de message introuvable.'));
    }

    return this.http.get(url, { responseType: 'blob' });
  }

  notifications(accountId: number): Observable<AccountNotification[]> {
    return this.http.get<AccountNotification[]>(`${this.accountUrl}/${accountId}/notifications`);
  }

  markNotificationsRead(accountId: number): Observable<AccountNotification[]> {
    return this.http.put<AccountNotification[]>(`${this.accountUrl}/${accountId}/notifications/read`, {});
  }

  markNotificationsReadByType(accountId: number, type: string): Observable<AccountNotification[]> {
    return this.http.put<AccountNotification[]>(
      `${this.accountUrl}/${accountId}/notifications/read/${encodeURIComponent(type)}`,
      {},
    );
  }

  deleteNotifications(accountId: number): Observable<void> {
    return this.http.delete<void>(`${this.accountUrl}/${accountId}/notifications`);
  }

  deleteNotification(accountId: number, notificationId: number): Observable<void> {
    return this.http.delete<void>(`${this.accountUrl}/${accountId}/notifications/${notificationId}`);
  }

  updatePrivacy(accountId: number, request: UpdatePrivacyRequest): Observable<Account> {
    return this.http.put<Account>(`${this.accountUrl}/${accountId}/privacy`, request);
  }

  update(accountId: number, formData: FormData): Observable<Account> {
    return this.http.put<Account>(`${this.accountUrl}/${accountId}/profile`, formData);
  }

  deleteProfilePicture(accountId: number): Observable<Account> {
    return this.http.delete<Account>(`${this.accountUrl}/${accountId}/profile-picture`);
  }

  deleteBackground(accountId: number): Observable<Account> {
    return this.http.delete<Account>(`${this.accountUrl}/${accountId}/background`);
  }

  assetUrl(path: string | null | undefined, version = 0): string | null {
    if (!path) {
      return null;
    }

    const baseUrl = path.startsWith('http') ? path : `${environment.apiUrl}${path}`;
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}v=${version}`;
  }
}
