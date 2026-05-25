import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';

const APP_TITLE = 'AnimeClub';
const MAX_VISIBLE_COUNT = 99;

@Injectable({ providedIn: 'root' })
export class BrowserTitleBadgeService {
  private readonly title = inject(Title);
  private readonly pageTitle = signal(APP_TITLE);
  private readonly unreadNotifications = signal(0);
  private readonly unreadMessages = signal(0);
  private readonly totalUnread = computed(() => this.unreadNotifications() + this.unreadMessages());

  constructor() {
    effect(() => {
      const count = this.totalUnread();
      const badge = count > MAX_VISIBLE_COUNT ? `${MAX_VISIBLE_COUNT}+` : String(count);
      const title = this.pageTitle();
      this.title.setTitle(count > 0 ? `(${badge}) ${title}` : title);
    });
  }

  setPageTitle(title: string): void {
    const cleanTitle = title.trim();
    this.pageTitle.set(cleanTitle || APP_TITLE);
  }

  setUnreadNotifications(count: number): void {
    this.unreadNotifications.set(this.normalizeCount(count));
  }

  setUnreadMessages(count: number): void {
    this.unreadMessages.set(this.normalizeCount(count));
  }

  reset(): void {
    this.unreadNotifications.set(0);
    this.unreadMessages.set(0);
  }

  private normalizeCount(count: number): number {
    if (!Number.isFinite(count)) {
      return 0;
    }

    return Math.max(0, Math.floor(count));
  }
}
