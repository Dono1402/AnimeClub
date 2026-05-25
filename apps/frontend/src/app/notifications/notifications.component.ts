import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { Account } from '../models/account.model';
import { PublicProfile } from '../models/public-profile.model';
import { AccountNotification } from '../models/social.model';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';

interface StoredAchievementNotification {
  id: number;
  achievementId: string;
  title: string;
  description: string;
  icon: string;
  iconUrl?: string;
  read: boolean;
  createdAt: string;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [MenuBarComponent],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);

  readonly account = this.authService.currentAccount();
  readonly loading = signal(true);
  readonly feedback = signal('');
  readonly serverNotifications = signal<AccountNotification[]>([]);
  readonly achievementNotifications = signal<AccountNotification[]>([]);
  readonly notifications = computed(() =>
    [...this.serverNotifications(), ...this.achievementNotifications()]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
  );

  ngOnInit(): void {
    if (!this.account) {
      this.loading.set(false);
      this.feedback.set('Connecte-toi pour voir tes notifications.');
      return;
    }

    this.loadAchievementNotifications(this.account);
    this.markAchievementNotificationsRead(this.account);
    this.profileService.markNotificationsRead(this.account.id)
      .pipe(catchError(() => this.profileService.notifications(this.account!.id).pipe(catchError(() => of([])))))
      .subscribe({
        next: (notifications) => {
          this.serverNotifications.set(this.visibleServerNotifications(this.account!.id, notifications));
          this.loading.set(false);
        },
        error: () => {
          this.feedback.set('Impossible de charger tes notifications.');
          this.loading.set(false);
        },
      });
  }

  openNotification(notification: AccountNotification): void {
    if (notification.type === 'ACHIEVEMENT_UNLOCKED') {
      void this.router.navigate(['/badges']);
      return;
    }

    if (notification.type === 'USERNAME_CHANGE_REQUIRED') {
      void this.router.navigate(['/account']);
      return;
    }

    void this.router.navigate(['/profile', notification.actor.pseudo]);
  }

  deleteNotification(notification: AccountNotification, event: MouseEvent): void {
    event.stopPropagation();
    if (!this.account) {
      return;
    }

    if (notification.local || notification.type === 'ACHIEVEMENT_UNLOCKED') {
      this.removeStoredAchievementNotifications(this.account.id, [notification.id]);
      return;
    }

    this.serverNotifications.update((notifications) => notifications.filter((item) => item.id !== notification.id));
    this.saveDeletedServerNotificationIds(this.account.id, [notification.id]);
    this.profileService.deleteNotification(this.account.id, notification.id).subscribe({
      error: () => undefined,
    });
  }

  deleteAllNotifications(): void {
    if (!this.account || this.notifications().length === 0) {
      return;
    }

    const serverIds = this.serverNotifications().map((notification) => notification.id);
    this.saveDeletedServerNotificationIds(this.account.id, serverIds);
    this.serverNotifications.set([]);
    this.clearStoredAchievementNotifications(this.account.id);

    this.profileService.deleteNotifications(this.account.id).subscribe({
      error: () => undefined,
    });
  }

  notificationTitle(notification: AccountNotification): string {
    if (notification.type === 'ACHIEVEMENT_UNLOCKED') {
      return notification.achievementTitle || 'Badge débloqué';
    }

    if (notification.type === 'FOLLOW') {
      return `${notification.actor.displayName || notification.actor.pseudo} te suit`;
    }

    if (notification.type === 'ACTIVITY_LIKE') {
      return `${notification.actor.displayName || notification.actor.pseudo} a aime ton activite`;
    }

    if (notification.type === 'FRIEND_ONLINE') {
      return `${notification.actor.displayName || notification.actor.pseudo} est connecte`;
    }

    if (notification.type === 'USERNAME_CHANGE_REQUIRED') {
      return 'Pseudo a modifier';
    }

    return 'Nouvelle notification';
  }

  notificationSubtitle(notification: AccountNotification): string {
    if (notification.type === 'ACHIEVEMENT_UNLOCKED') {
      return notification.achievementDescription || 'Un nouveau badge a été ajouté à ton profil.';
    }

    if (notification.type === 'FOLLOW') {
      return `@${notification.actor.pseudo} suit maintenant ton profil.`;
    }

    if (notification.type === 'ACTIVITY_LIKE') {
      return `@${notification.actor.pseudo} a like une activite de ton fil.`;
    }

    if (notification.type === 'FRIEND_ONLINE') {
      return `@${notification.actor.pseudo} est maintenant en ligne.`;
    }

    if (notification.type === 'USERNAME_CHANGE_REQUIRED') {
      return 'Ton ancien pseudo depassait 16 caracteres. Choisis un nouveau pseudo dans Mon compte.';
    }

    return 'Ouvre la notification pour voir le detail.';
  }

  notificationTimeLabel(notification: AccountNotification): string {
    const createdAt = new Date(notification.createdAt).getTime();
    if (Number.isNaN(createdAt)) {
      return '';
    }

    const seconds = Math.max(1, Math.floor((Date.now() - createdAt) / 1000));
    if (seconds < 60) {
      return 'A l instant';
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `Il y a ${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `Il y a ${hours} h`;
    }

    const days = Math.floor(hours / 24);
    return `Il y a ${days} j`;
  }

  notificationActorPicture(notification: AccountNotification): string | null {
    if (notification.type === 'ACHIEVEMENT_UNLOCKED') {
      return null;
    }

    return this.profileService.assetUrl(notification.actor.profilePictureUrl);
  }

  notificationAchievementIconUrl(notification: AccountNotification): string | null {
    return notification.type === 'ACHIEVEMENT_UNLOCKED' && notification.achievementIconUrl
      ? notification.achievementIconUrl
      : null;
  }

  avatarLetter(notification: AccountNotification): string {
    if (notification.type === 'ACHIEVEMENT_UNLOCKED') {
      return notification.achievementIcon || 'OK';
    }

    return (notification.actor.displayName || notification.actor.pseudo || 'N').slice(0, 1).toUpperCase();
  }

  private filterDeletedServerNotifications(accountId: number, notifications: AccountNotification[]): AccountNotification[] {
    const deletedIds = this.readDeletedServerNotificationIds(accountId);
    return notifications.filter((notification) => !deletedIds.has(notification.id));
  }

  private visibleServerNotifications(accountId: number, notifications: AccountNotification[]): AccountNotification[] {
    return this.filterDeletedServerNotifications(accountId, notifications)
      .filter((notification) => notification.type !== 'FRIEND_ONLINE');
  }

  private loadAchievementNotifications(account: Account): void {
    this.achievementNotifications.set(
      this.readStoredAchievementNotifications(account.id)
        .map((notification) => this.toAchievementNotification(notification, account)),
    );
  }

  private markAchievementNotificationsRead(account: Account): void {
    const storedNotifications = this.readStoredAchievementNotifications(account.id)
      .map((notification) => ({ ...notification, read: true }));

    this.writeStoredAchievementNotifications(account.id, storedNotifications);
    this.achievementNotifications.set(
      storedNotifications.map((notification) => this.toAchievementNotification(notification, account)),
    );
  }

  private removeStoredAchievementNotifications(accountId: number, notificationIds: number[]): void {
    if (notificationIds.length === 0) {
      return;
    }

    const deletedIds = new Set(notificationIds);
    const storedNotifications = this.readStoredAchievementNotifications(accountId)
      .filter((notification) => !deletedIds.has(notification.id));

    this.writeStoredAchievementNotifications(accountId, storedNotifications);
    if (this.account?.id === accountId) {
      this.achievementNotifications.set(
        storedNotifications.map((notification) => this.toAchievementNotification(notification, this.account!)),
      );
    }
  }

  private clearStoredAchievementNotifications(accountId: number): void {
    localStorage.removeItem(this.achievementNotificationStorageKey(accountId));
    this.achievementNotifications.set([]);
  }

  private readStoredAchievementNotifications(accountId: number): StoredAchievementNotification[] {
    const raw = localStorage.getItem(this.achievementNotificationStorageKey(accountId));
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as StoredAchievementNotification[];
      return Array.isArray(parsed)
        ? parsed
            .filter((notification) => notification && typeof notification.title === 'string')
            .map((notification) => ({
              id: Number(notification.id) || -Date.now(),
              achievementId: String(notification.achievementId || ''),
              title: String(notification.title || 'Badge débloqué'),
              description: String(notification.description || ''),
              icon: String(notification.icon || ''),
              iconUrl: notification.iconUrl ? String(notification.iconUrl) : undefined,
              read: Boolean(notification.read),
              createdAt: String(notification.createdAt || new Date().toISOString()),
            }))
        : [];
    } catch {
      localStorage.removeItem(this.achievementNotificationStorageKey(accountId));
      return [];
    }
  }

  private writeStoredAchievementNotifications(accountId: number, notifications: StoredAchievementNotification[]): void {
    localStorage.setItem(this.achievementNotificationStorageKey(accountId), JSON.stringify(notifications));
  }

  private toAchievementNotification(notification: StoredAchievementNotification, account: Account): AccountNotification {
    return {
      id: notification.id,
      type: 'ACHIEVEMENT_UNLOCKED',
      actor: this.toPublicProfile(account),
      read: notification.read,
      createdAt: notification.createdAt,
      achievementId: notification.achievementId,
      achievementTitle: notification.title,
      achievementDescription: notification.description,
      achievementIcon: notification.icon,
      achievementIconUrl: notification.iconUrl,
      local: true,
    };
  }

  private toPublicProfile(account: Account): PublicProfile {
    return {
      id: account.id,
      pseudo: account.pseudo,
      displayName: account.displayName || account.pseudo,
      bio: account.bio,
      profileStatus: account.profileStatus,
      favoriteAnime: account.favoriteAnime,
      accentColor: account.accentColor,
      profilePictureUrl: account.profilePictureUrl,
      backgroundUrl: account.backgroundUrl,
      online: true,
      lastActiveAt: new Date().toISOString(),
      showFollowers: account.showFollowers,
      showFollowing: account.showFollowing,
      followersCount: 0,
      followingCount: 0,
      showAnimeLibrary: account.showAnimeLibrary,
      showMangaLibrary: account.showMangaLibrary,
    };
  }

  private readDeletedServerNotificationIds(accountId: number): Set<number> {
    const raw = localStorage.getItem(this.deletedNotificationStorageKey(accountId));
    if (!raw) {
      return new Set();
    }

    try {
      const parsed = JSON.parse(raw) as number[];
      return new Set(Array.isArray(parsed) ? parsed.map(Number).filter(Number.isInteger) : []);
    } catch {
      localStorage.removeItem(this.deletedNotificationStorageKey(accountId));
      return new Set();
    }
  }

  private saveDeletedServerNotificationIds(accountId: number, notificationIds: number[]): void {
    if (notificationIds.length === 0) {
      return;
    }

    const deletedIds = this.readDeletedServerNotificationIds(accountId);
    notificationIds.forEach((notificationId) => deletedIds.add(notificationId));
    localStorage.setItem(this.deletedNotificationStorageKey(accountId), JSON.stringify([...deletedIds]));
  }

  private achievementNotificationStorageKey(accountId: number): string {
    return `animaclub.achievement-notifications.${accountId}`;
  }

  private deletedNotificationStorageKey(accountId: number): string {
    return `animaclub.deleted-notifications.${accountId}`;
  }
}
