import { AsyncPipe } from '@angular/common';
import { Component, DestroyRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { catchError, of, switchMap, timer } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { AnimeCatalogService } from '../services/anime-catalog.service';
import { CharacterCatalogService } from '../services/character-catalog.service';
import { AppLanguage, LanguageService } from '../services/language.service';
import { MangaCatalogService } from '../services/manga-catalog.service';
import { PresenceService } from '../services/presence.service';
import { ProfileService } from '../services/profile.service';
import { BrowserTitleBadgeService } from '../services/browser-title-badge.service';
import { AchievementNotificationService } from '../services/achievement-notification.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { Account } from '../models/account.model';
import { PopularAnime } from '../models/anime.model';
import { CharacterCatalogEntry } from '../models/character.model';
import { PopularManga } from '../models/manga.model';
import { PublicProfile } from '../models/public-profile.model';
import { AccountNotification, MessageConversation } from '../models/social.model';
import { MessagesDockComponent } from '../messages-dock/messages-dock.component';
import { AnimeAchievementProgress } from '../utils/anime-achievements.util';

interface GlobalSearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  route: string | string[];
  queryParams: Record<string, string> | null;
  searchableText: string;
}

interface AchievementToast {
  id: string;
  achievement: AnimeAchievementProgress;
}

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

type ProfileMenuNotificationType = 'ACHIEVEMENT_UNLOCKED' | 'FOLLOW' | 'USERNAME_CHANGE_REQUIRED';

let cachedAnimeSearchResults: GlobalSearchResult[] | null = null;
let cachedMangaSearchResults: GlobalSearchResult[] | null = null;
let cachedProfileSearchResults: GlobalSearchResult[] | null = null;
const NOTIFICATION_POLL_INTERVAL_MS = 10000;
const PROFILE_MENU_POLL_INTERVAL_MS = 10000;
const NOTIFICATION_PREVIEW_LIMIT = 3;
const ACHIEVEMENT_NOTIFICATION_STORAGE_LIMIT = 50;
const GLOBAL_SEARCH_PAGE_SIZE = 100;

@Component({
  selector: 'app-menu-bar',
  standalone: true,
  imports: [AsyncPipe, MatButtonModule, MatMenuModule, RouterLink, RouterLinkActive, TranslatePipe, MessagesDockComponent],
  templateUrl: './menu-bar.component.html',
  styleUrl: './menu-bar.component.scss',
})
export class MenuBarComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly animeCatalogService = inject(AnimeCatalogService);
  private readonly characterCatalogService = inject(CharacterCatalogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mangaCatalogService = inject(MangaCatalogService);
  private readonly presenceService = inject(PresenceService);
  private readonly router = inject(Router);
  private readonly profileService = inject(ProfileService);
  private readonly browserTitleBadgeService = inject(BrowserTitleBadgeService);
  private readonly achievementNotificationService = inject(AchievementNotificationService);
  readonly languageService = inject(LanguageService);

  readonly account$ = this.authService.account$;
  readonly globalSearchQuery = signal('');
  readonly globalSearchOpen = signal(false);
  readonly animeSearchResults = signal<GlobalSearchResult[]>([]);
  readonly mangaSearchResults = signal<GlobalSearchResult[]>([]);
  readonly profileSearchResults = signal<GlobalSearchResult[]>([]);
  readonly serverNotifications = signal<AccountNotification[]>([]);
  readonly achievementNotifications = signal<AccountNotification[]>([]);
  readonly notifications = computed(() =>
    [...this.serverNotifications(), ...this.achievementNotifications()]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
  );
  readonly displayedNotifications = computed(() =>
    this.notifications().slice(0, NOTIFICATION_PREVIEW_LIMIT),
  );
  readonly notificationToasts = signal<AccountNotification[]>([]);
  readonly achievementToasts = signal<AchievementToast[]>([]);
  readonly unreadNotificationCount = computed(() => this.notifications().filter((notification) => !notification.read).length);
  readonly unreadMessageCount = signal(0);
  private readonly dismissedMessageUnreadCount = signal(0);
  readonly visibleUnreadMessageCount = computed(() =>
    Math.max(0, this.unreadMessageCount() - this.dismissedMessageUnreadCount()),
  );
  readonly unreadBadgeNotificationCount = computed(() => this.unreadNotificationCountByType('ACHIEVEMENT_UNLOCKED'));
  readonly unreadFollowNotificationCount = computed(() => this.unreadNotificationCountByType('FOLLOW'));
  readonly unreadAccountNotificationCount = computed(() => this.unreadNotificationCountByType('USERNAME_CHANGE_REQUIRED'));
  readonly characterSearchResults = signal<GlobalSearchResult[]>([]);

  readonly globalSearchResults = computed(() => {
    const query = this.normalizeSearch(this.globalSearchQuery());
    if (query.length < 2) {
      return [];
    }

    return [
      ...this.animeSearchResults(),
      ...this.mangaSearchResults(),
      ...this.profileSearchResults(),
      ...this.characterSearchResults(),
    ].filter((result) => this.normalizeSearch(result.searchableText).includes(query));
  });

  readonly showGlobalSearchResults = computed(
    () => this.globalSearchOpen() && this.globalSearchQuery().trim().length > 0,
  );

  private knownNotificationIds = new Set<number>();
  private notificationListReady = false;
  private animeSearchRequestId = 0;
  private characterSearchRequestId = 0;
  private readonly notificationToastTimers = new Map<number, number>();
  private readonly achievementToastTimers = new Map<string, number>();
  private notificationAudioContext: AudioContext | null = null;

  ngOnInit(): void {
    this.loadGlobalSearchIndex();
    this.watchNotifications();
    this.watchProfileMenuMetrics();
    this.watchAchievementUnlocks();
    this.prepareNotificationSound();
    this.achievementNotificationService.prepareAchievementSound();
  }

  @HostListener('document:pointerdown', ['$event'])
  closeGlobalSearchOnOutsidePointerDown(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('.global-search')) {
      return;
    }

    this.closeGlobalSearch();
  }

  displayName(account: Account): string {
    return account.displayName || account.pseudo;
  }

  profilePicture(account: Account): string | null {
    return this.profileService.assetUrl(account.profilePictureUrl);
  }

  messageBadgeLabel(): string {
    const count = this.visibleUnreadMessageCount();
    return count > 99 ? '99+' : String(count);
  }

  profileMenuBadgeLabel(count: number): string {
    return count > 99 ? '99+' : String(count);
  }

  dismissMessageMenuBadge(): void {
    this.dismissedMessageUnreadCount.set(this.unreadMessageCount());
    this.syncMessageBadge();
  }

  markProfileMenuNotificationsRead(accountId: number, type: ProfileMenuNotificationType): void {
    if (this.unreadNotificationCountByType(type) === 0) {
      return;
    }

    if (type === 'ACHIEVEMENT_UNLOCKED') {
      this.markAchievementNotificationsRead(accountId);
      this.syncNotificationBadge();
      return;
    }

    this.serverNotifications.update((notifications) =>
      notifications.map((notification) =>
        notification.type === type
          ? { ...notification, read: true }
          : notification,
      ),
    );
    this.syncNotificationBadge();

    this.profileService.markNotificationsReadByType(accountId, type).subscribe({
      next: (notifications) => this.setNotifications(notifications),
      error: () => this.loadNotifications(accountId),
    });
  }

  setLanguage(language: AppLanguage): void {
    this.languageService.setLanguage(language);
  }

  setGlobalSearchQuery(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.globalSearchQuery.set(query);
    this.globalSearchOpen.set(true);
    this.searchAnimes(query);
    this.searchCharacters(query);
  }

  setGlobalSearchOpen(open: boolean): void {
    this.globalSearchOpen.set(open);
  }

  globalSearchPlaceholder(): string {
    const path = this.router.url.split('?')[0].split('#')[0];

    if (path.startsWith('/characters')) {
      return this.languageService.isFrench() ? 'Rechercher un personnage' : 'Search for a character';
    }

    return this.languageService.isFrench()
      ? 'Rechercher un anime, un perso...'
      : 'Search anime, characters...';
  }

  closeGlobalSearch(): void {
    this.globalSearchOpen.set(false);
  }

  markNotificationsRead(accountId: number): void {
    if (this.unreadNotificationCount() === 0) {
      return;
    }

    this.serverNotifications.update((notifications) =>
      notifications.map((notification) => ({
        ...notification,
        read: true,
      })),
    );
    this.markAchievementNotificationsRead(accountId);
    this.syncNotificationBadge();

    this.profileService.markNotificationsRead(accountId).subscribe({
      next: (notifications) => this.setNotifications(notifications),
      error: () => this.loadNotifications(accountId),
    });
  }

  openAllNotifications(event: MouseEvent): void {
    event.stopPropagation();
    void this.router.navigate(['/notifications']);
  }

  deleteDisplayedNotifications(accountId: number, event: MouseEvent): void {
    event.stopPropagation();
    const deletedNotifications = this.displayedNotifications();
    if (deletedNotifications.length === 0) {
      return;
    }

    const serverIds = deletedNotifications
      .filter((notification) => !notification.local && notification.id > 0)
      .map((notification) => notification.id);
    const localIds = deletedNotifications
      .filter((notification) => notification.local || notification.type === 'ACHIEVEMENT_UNLOCKED')
      .map((notification) => notification.id);
    const deletedIds = new Set([...serverIds, ...localIds]);

    this.serverNotifications.update((notifications) => notifications.filter((notification) => !deletedIds.has(notification.id)));
    this.removeStoredAchievementNotifications(accountId, localIds);
    this.notificationToasts.update((toasts) => toasts.filter((notification) => !deletedIds.has(notification.id)));
    this.saveDeletedServerNotificationIds(accountId, serverIds);
    this.syncNotificationBadge();

    serverIds.forEach((notificationId) => {
      this.profileService.deleteNotification(accountId, notificationId).subscribe({
        error: () => undefined,
      });
    });
  }

  openNotification(notification: AccountNotification): void {
    if (notification.type === 'ACHIEVEMENT_UNLOCKED') {
      void this.router.navigate(['/achievements']);
      return;
    }

    if (notification.type === 'USERNAME_CHANGE_REQUIRED') {
      void this.router.navigate(['/account']);
      return;
    }

    void this.router.navigate(['/profile', notification.actor.pseudo]);
  }

  openNotificationToast(notification: AccountNotification): void {
    this.dismissNotificationToast(notification.id);
    this.openNotification(notification);
  }

  dismissNotificationToast(notificationId: number): void {
    const timer = this.notificationToastTimers.get(notificationId);
    if (timer) {
      window.clearTimeout(timer);
      this.notificationToastTimers.delete(notificationId);
    }

    this.notificationToasts.update((toasts) => toasts.filter((notification) => notification.id !== notificationId));
  }

  openAchievementToast(toast: AchievementToast): void {
    this.dismissAchievementToast(toast.id);
    void this.router.navigate(['/achievements']);
  }

  dismissAchievementToast(toastId: string): void {
    const timer = this.achievementToastTimers.get(toastId);
    if (timer) {
      window.clearTimeout(timer);
      this.achievementToastTimers.delete(toastId);
    }

    this.achievementToasts.update((toasts) => toasts.filter((toast) => toast.id !== toastId));
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
      return 'À l’instant';
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

  notificationBadgeLabel(): string {
    const count = this.unreadNotificationCount();
    return count > 9 ? '9+' : String(count);
  }

  openFirstGlobalSearchResult(): void {
    const [result] = this.globalSearchResults();
    if (!result) {
      return;
    }

    this.openGlobalSearchResult(result);
  }

  openGlobalSearchResult(result: GlobalSearchResult): void {
    this.globalSearchOpen.set(false);
    this.globalSearchQuery.set('');
    void this.router.navigate(this.routerCommands(result), {
      queryParams: result.queryParams ?? undefined,
    });
  }

  logout(): void {
    this.authService.logout();
    this.setNotifications([]);
    this.unreadMessageCount.set(0);
    this.dismissedMessageUnreadCount.set(0);
    this.browserTitleBadgeService.reset();
    this.resetNotificationTracking();
    void this.router.navigate(['/']);
  }

  private watchNotifications(): void {
    this.authService.account$
      .pipe(
        switchMap((account) => {
          this.resetNotificationTracking();
          this.browserTitleBadgeService.setUnreadMessages(0);
          if (!account) {
            return of([]);
          }

          this.loadAchievementNotifications(account);
          return timer(0, NOTIFICATION_POLL_INTERVAL_MS).pipe(
            switchMap(() =>
              this.profileService.notifications(account.id).pipe(
                catchError(() => of(this.serverNotifications())),
              ),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((notifications) => this.applyNotifications(notifications));
  }

  private watchProfileMenuMetrics(): void {
    this.authService.account$
      .pipe(
        switchMap((account) => {
          this.unreadMessageCount.set(0);
          this.dismissedMessageUnreadCount.set(0);
          this.browserTitleBadgeService.setUnreadMessages(0);

          if (!account) {
            return of<MessageConversation[] | null>(null);
          }

          return timer(0, PROFILE_MENU_POLL_INTERVAL_MS).pipe(
            switchMap(() =>
              this.profileService.messageConversations(account.id).pipe(catchError(() => of<MessageConversation[]>([]))),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((conversations) => {
        if (!conversations) {
          return;
        }

        const unreadMessages = conversations.reduce((total, conversation) => total + Number(conversation.unreadCount || 0), 0);
        this.unreadMessageCount.set(unreadMessages);
        if (unreadMessages < this.dismissedMessageUnreadCount()) {
          this.dismissedMessageUnreadCount.set(unreadMessages);
        }
        this.syncMessageBadge();
      });
  }

  private watchAchievementUnlocks(): void {
    this.achievementNotificationService.unlocks$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((achievements) => {
        this.saveAchievementNotifications(achievements);
        this.showAchievementToasts(achievements);
      });
  }

  private loadNotifications(accountId: number): void {
    this.profileService.notifications(accountId).subscribe({
      next: (notifications) => this.applyNotifications(notifications, false),
      error: () => this.setNotifications([]),
    });
  }

  private applyNotifications(notifications: AccountNotification[], showNewToasts = true): void {
    const newUnreadNotifications = this.notificationListReady && showNewToasts
      ? notifications.filter((notification) => !notification.read && !this.knownNotificationIds.has(notification.id))
      : [];
    const newFriendOnlineNotifications = newUnreadNotifications.filter((notification) => notification.type === 'FRIEND_ONLINE');
    const newRegularNotifications = newUnreadNotifications.filter((notification) => notification.type !== 'FRIEND_ONLINE');

    this.setNotifications(notifications);
    this.knownNotificationIds = new Set(notifications.map((notification) => notification.id));

    if (!this.notificationListReady) {
      this.notificationListReady = true;
      return;
    }

    if (newUnreadNotifications.length === 0) {
      return;
    }

    newFriendOnlineNotifications
      .slice(0, 3)
      .forEach((notification) => this.presenceService.notifyFriendOnline(notification.actor));

    if (newRegularNotifications.length > 0) {
      newRegularNotifications.slice(0, 3).forEach((notification) => this.showNotificationToast(notification));
      this.emitNotificationSound();
    }
  }

  private showNotificationToast(notification: AccountNotification): void {
    this.notificationToasts.update((toasts) => [
      notification,
      ...toasts.filter((toast) => toast.id !== notification.id),
    ].slice(0, 3));

    const existingTimer = this.notificationToastTimers.get(notification.id);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => this.dismissNotificationToast(notification.id), 7000);
    this.notificationToastTimers.set(notification.id, timer);
  }

  private showAchievementToasts(achievements: AnimeAchievementProgress[]): void {
    const createdAt = Date.now();
    const toasts = achievements.slice(0, 3).map((achievement, index) => ({
      id: `${achievement.id}-${createdAt}-${index}`,
      achievement,
    }));

    this.achievementToasts.update((currentToasts) => [...toasts, ...currentToasts].slice(0, 3));

    toasts.forEach((toast) => {
      const timer = window.setTimeout(() => this.dismissAchievementToast(toast.id), 8500);
      this.achievementToastTimers.set(toast.id, timer);
    });
  }

  private resetNotificationTracking(): void {
    this.knownNotificationIds.clear();
    this.notificationListReady = false;
    this.notificationToastTimers.forEach((timer) => window.clearTimeout(timer));
    this.notificationToastTimers.clear();
    this.notificationToasts.set([]);
    this.serverNotifications.set([]);
    this.achievementNotifications.set([]);
    this.browserTitleBadgeService.setUnreadNotifications(0);
    this.clearAchievementToasts();
  }

  private clearAchievementToasts(): void {
    this.achievementToastTimers.forEach((timer) => window.clearTimeout(timer));
    this.achievementToastTimers.clear();
    this.achievementToasts.set([]);
  }

  private setNotifications(notifications: AccountNotification[]): void {
    const accountId = this.authService.currentAccount()?.id;
    const deletedIds = accountId ? this.readDeletedServerNotificationIds(accountId) : new Set<number>();
    this.serverNotifications.set(notifications.filter((notification) =>
      notification.type !== 'FRIEND_ONLINE' && !deletedIds.has(notification.id),
    ));
    this.syncNotificationBadge();
  }

  private syncNotificationBadge(): void {
    this.browserTitleBadgeService.setUnreadNotifications(this.unreadNotificationCount());
  }

  private syncMessageBadge(): void {
    this.browserTitleBadgeService.setUnreadMessages(this.visibleUnreadMessageCount());
  }

  private unreadNotificationCountByType(type: string): number {
    return this.notifications().filter((notification) => notification.type === type && !notification.read).length;
  }

  private saveAchievementNotifications(achievements: AnimeAchievementProgress[]): void {
    const account = this.authService.currentAccount();
    if (!account || achievements.length === 0) {
      return;
    }

    const now = Date.now();
    const createdNotifications = achievements.map((achievement, index): StoredAchievementNotification => ({
      id: -(now + index),
      achievementId: achievement.id,
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      iconUrl: achievement.iconUrl,
      read: false,
      createdAt: new Date(now + index).toISOString(),
    }));
    const storedNotifications = [
      ...createdNotifications,
      ...this.readStoredAchievementNotifications(account.id),
    ].slice(0, ACHIEVEMENT_NOTIFICATION_STORAGE_LIMIT);

    this.writeStoredAchievementNotifications(account.id, storedNotifications);
    this.loadAchievementNotifications(account);
  }

  private loadAchievementNotifications(account: Account): void {
    const notifications = this.readStoredAchievementNotifications(account.id)
      .map((notification) => this.toAchievementNotification(notification, account));

    this.achievementNotifications.set(notifications);
    this.syncNotificationBadge();
  }

  private markAchievementNotificationsRead(accountId: number): void {
    const account = this.authService.currentAccount();
    const storedNotifications = this.readStoredAchievementNotifications(accountId)
      .map((notification) => ({ ...notification, read: true }));

    this.writeStoredAchievementNotifications(accountId, storedNotifications);
    if (account?.id === accountId) {
      this.achievementNotifications.set(
        storedNotifications.map((notification) => this.toAchievementNotification(notification, account)),
      );
    }
  }

  private clearStoredAchievementNotifications(accountId: number): void {
    localStorage.removeItem(this.achievementNotificationStorageKey(accountId));
    this.achievementNotifications.set([]);
  }

  private removeStoredAchievementNotifications(accountId: number, notificationIds: number[]): void {
    if (notificationIds.length === 0) {
      return;
    }

    const deletedIds = new Set(notificationIds);
    const account = this.authService.currentAccount();
    const storedNotifications = this.readStoredAchievementNotifications(accountId)
      .filter((notification) => !deletedIds.has(notification.id));

    this.writeStoredAchievementNotifications(accountId, storedNotifications);
    if (account?.id === accountId) {
      this.achievementNotifications.set(
        storedNotifications.map((notification) => this.toAchievementNotification(notification, account)),
      );
    }
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
    localStorage.setItem(
      this.achievementNotificationStorageKey(accountId),
      JSON.stringify(notifications.slice(0, ACHIEVEMENT_NOTIFICATION_STORAGE_LIMIT)),
    );
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
      displayName: this.displayName(account),
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

  private achievementNotificationStorageKey(accountId: number): string {
    return `animaclub.achievement-notifications.${accountId}`;
  }

  private saveDeletedServerNotificationIds(accountId: number, notificationIds: number[]): void {
    if (notificationIds.length === 0) {
      return;
    }

    const deletedIds = this.readDeletedServerNotificationIds(accountId);
    notificationIds.forEach((notificationId) => deletedIds.add(notificationId));
    localStorage.setItem(this.deletedNotificationStorageKey(accountId), JSON.stringify([...deletedIds]));
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

  private deletedNotificationStorageKey(accountId: number): string {
    return `animaclub.deleted-notifications.${accountId}`;
  }

  private prepareNotificationSound(): void {
    const unlockSound = () => {
      const context = this.ensureNotificationAudioContext();
      if (!context) {
        return;
      }

      void context.resume().catch(() => undefined);
    };

    window.addEventListener('pointerdown', unlockSound, { once: true, passive: true });
    window.addEventListener('keydown', unlockSound, { once: true });
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('pointerdown', unlockSound);
      window.removeEventListener('keydown', unlockSound);
    });
  }

  private emitNotificationSound(): void {
    const context = this.ensureNotificationAudioContext();
    if (!context) {
      return;
    }

    const startTone = () => {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(740, now);
      oscillator.frequency.setValueAtTime(980, now + 0.11);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.3);
    };

    if (context.state === 'suspended') {
      void context.resume().then(startTone).catch(() => undefined);
      return;
    }

    startTone();
  }

  private ensureNotificationAudioContext(): AudioContext | null {
    if (this.notificationAudioContext) {
      return this.notificationAudioContext;
    }

    const AudioContextConstructor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      return null;
    }

    this.notificationAudioContext = new AudioContextConstructor();
    return this.notificationAudioContext;
  }

  private loadGlobalSearchIndex(): void {
    if (cachedAnimeSearchResults) {
      this.animeSearchResults.set(cachedAnimeSearchResults);
    } else {
      this.animeCatalogService.getPopularAnime(1).subscribe({
        next: (page) => {
          const animes = this.uniqueBySlug(page.items);
          cachedAnimeSearchResults = animes.map((anime) => this.toAnimeSearchResult(anime));
          this.animeSearchResults.set(cachedAnimeSearchResults);
        },
        error: () => {
          this.animeSearchResults.set([]);
        },
      });
    }

    if (cachedMangaSearchResults) {
      this.mangaSearchResults.set(cachedMangaSearchResults);
    } else {
      this.mangaCatalogService.getPopularManga(1).subscribe({
        next: (page) => {
          const mangas = this.uniqueBySlug(page.items);
          cachedMangaSearchResults = mangas.map((manga) => this.toMangaSearchResult(manga));
          this.mangaSearchResults.set(cachedMangaSearchResults);
        },
        error: () => {
          this.mangaSearchResults.set([]);
        },
      });
    }

    cachedProfileSearchResults = cachedProfileSearchResults ?? [];
    this.profileSearchResults.set(cachedProfileSearchResults);
  }

  private toAnimeSearchResult(anime: PopularAnime): GlobalSearchResult {
    return {
      id: `anime-${anime.slug}`,
      type: 'Anime',
      title: anime.title,
      subtitle: this.formatAnimeSubtitle(anime),
      imageUrl: anime.imageUrl,
      route: this.animeGlobalRoute(anime),
      queryParams: null,
      searchableText: [
        anime.title,
        anime.titleJapanese,
        anime.type,
        anime.year?.toString(),
        ...anime.genres,
        ...anime.studios,
        ...anime.seasons.map((season) => season.title),
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  private toMangaSearchResult(manga: PopularManga): GlobalSearchResult {
    return {
      id: `manga-${manga.slug}`,
      type: 'Manga',
      title: manga.title,
      subtitle: this.formatMangaSubtitle(manga),
      imageUrl: manga.imageUrl,
      route: '/manga',
      queryParams: { selection: manga.slug },
      searchableText: [manga.title, manga.titleJapanese, manga.type, manga.published, ...manga.genres, ...manga.authors]
        .filter(Boolean)
        .join(' '),
    };
  }

  private toProfileSearchResult(profile: PublicProfile): GlobalSearchResult {
    return {
      id: `profile-${profile.pseudo}`,
      type: 'Profil',
      title: profile.displayName || profile.pseudo,
      subtitle: profile.profileStatus || `@${profile.pseudo}`,
      imageUrl: this.profileService.assetUrl(profile.profilePictureUrl) ?? '',
      route: ['/profile', profile.pseudo],
      queryParams: null,
      searchableText: [
        profile.displayName,
        profile.pseudo,
        profile.profileStatus,
        profile.favoriteAnime,
        profile.bio,
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  private toCharacterSearchResult(character: CharacterCatalogEntry): GlobalSearchResult {
    return {
      id: `character-${character.slug}`,
      type: 'Personnage',
      title: character.name,
      subtitle: character.sourceAnimeTitle
        ? `${character.role || 'Personnage'} - ${character.sourceAnimeTitle}`
        : character.favorites && character.favorites > 0
          ? `${character.favorites.toLocaleString('fr-FR')} favoris`
          : 'Personnage',
      imageUrl: character.imageUrl,
      route: ['/characters', character.slug],
      queryParams: null,
      searchableText: [character.name, character.nameKanji, character.sourceAnimeTitle, character.role, character.about, ...character.nicknames]
        .filter(Boolean)
        .join(' '),
    };
  }

  private searchAnimes(query: string): void {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      this.animeSearchResults.set(cachedAnimeSearchResults ?? []);
      return;
    }

    const requestId = ++this.animeSearchRequestId;
    const cachedMatches = this.cachedAnimeMatches(cleanQuery);
    if (cachedMatches.length > 0) {
      this.animeSearchResults.set(cachedMatches);
    }

    this.animeCatalogService.searchAnimeSuggestions(cleanQuery, GLOBAL_SEARCH_PAGE_SIZE).subscribe({
      next: (animes) => {
        if (requestId !== this.animeSearchRequestId) {
          return;
        }

        this.animeSearchResults.set(this.uniqueSearchResults([
          ...animes.map((anime) => this.toAnimeSearchResult(anime)),
          ...cachedMatches,
        ]));
      },
      error: () => {
        if (requestId === this.animeSearchRequestId) {
          this.animeSearchResults.set(cachedMatches);
        }
      },
    });
  }

  private searchCharacters(query: string): void {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      this.characterSearchResults.set([]);
      return;
    }

    const requestId = ++this.characterSearchRequestId;
    this.characterCatalogService.searchSuggestions(cleanQuery, GLOBAL_SEARCH_PAGE_SIZE).subscribe({
      next: (characters) => {
        if (requestId !== this.characterSearchRequestId) {
          return;
        }

        this.characterSearchResults.set(characters.map((character) => this.toCharacterSearchResult(character)));
      },
      error: () => {
        if (requestId === this.characterSearchRequestId) {
          this.characterSearchResults.set([]);
        }
      },
    });
  }

  private formatAnimeSubtitle(anime: PopularAnime): string {
    const episodes = anime.episodes > 0 ? `${anime.episodes} episodes` : 'Episodes inconnus';
    return `${anime.type} - ${episodes}`;
  }

  private formatMangaSubtitle(manga: PopularManga): string {
    const volumes = manga.volumes > 0 ? `${manga.volumes} tomes` : 'Tomes inconnus';
    return `${manga.type} - ${volumes}`;
  }

  private routerCommands(result: GlobalSearchResult): string[] {
    return Array.isArray(result.route) ? result.route : [result.route];
  }

  private animeGlobalRoute(anime: PopularAnime): string[] {
    return ['/animes', anime.slug.startsWith('series-') ? anime.slug : `series-${this.slugify(anime.title)}`];
  }

  private slugify(value: string): string {
    return this.normalizeSearch(value).replace(/\s+/g, '-').replace(/^-|-$/g, '');
  }

  private uniqueBySlug<T extends { slug: string }>(items: T[]): T[] {
    return Array.from(new Map(items.map((item) => [item.slug, item])).values());
  }

  private cachedAnimeMatches(query: string): GlobalSearchResult[] {
    const normalizedQuery = this.normalizeSearch(query);
    return (cachedAnimeSearchResults ?? []).filter((result) =>
      this.normalizeSearch(result.searchableText).includes(normalizedQuery),
    );
  }

  private uniqueSearchResults(results: GlobalSearchResult[]): GlobalSearchResult[] {
    const seen = new Set<string>();
    return results.filter((result) => {
      const key = `${result.type}:${this.normalizeSearch(result.title)}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private normalizeSearch(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
}
