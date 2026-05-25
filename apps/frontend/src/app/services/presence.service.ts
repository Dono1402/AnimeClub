import { Injectable, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';

import { AuthService } from './auth.service';
import { ProfileService } from './profile.service';
import { PublicProfile } from '../models/public-profile.model';

const PRESENCE_INTERVAL_MS = 30000;
const SOCIAL_PRESENCE_INTERVAL_MS = 15000;
const ONLINE_TOAST_DURATION_MS = 6000;
const ONLINE_TOAST_COOLDOWN_MS = 2 * 60 * 1000;

export interface PresenceOnlineToast {
  id: number;
  profile: PublicProfile;
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  readonly onlineToasts = signal<PresenceOnlineToast[]>([]);

  private started = false;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private socialPresenceTimer: ReturnType<typeof setInterval> | null = null;
  private knownOnlineProfileIds = new Set<number>();
  private onlineToastTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private lastOnlineToastAt = new Map<number, number>();
  private socialPresenceReady = false;
  private socialPresenceRefreshRunning = false;

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.authService.account$.subscribe((account) => {
      this.stopTimers();
      this.resetSocialPresence();
      if (!account) {
        return;
      }

      this.markActive();
      this.refreshSocialPresence(account.id, false);
      this.presenceTimer = setInterval(() => this.markActive(), PRESENCE_INTERVAL_MS);
      this.socialPresenceTimer = setInterval(() => this.refreshSocialPresence(account.id, true), SOCIAL_PRESENCE_INTERVAL_MS);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.markActive();
        const account = this.authService.currentAccount();
        if (account) {
          this.refreshSocialPresence(account.id, true);
        }
      }
    });
  }

  dismissOnlineToast(profileId: number): void {
    const timer = this.onlineToastTimers.get(profileId);
    if (timer) {
      clearTimeout(timer);
      this.onlineToastTimers.delete(profileId);
    }

    this.onlineToasts.update((toasts) => toasts.filter((toast) => toast.id !== profileId));
  }

  notifyFriendOnline(profile: PublicProfile): void {
    this.showOnlineToast(profile);
  }

  syncFriendsPresence(friends: PublicProfile[], notifyTransitions = true): void {
    const profiles = this.uniqueProfiles(friends);
    const onlineProfiles = profiles.filter((profile) => Boolean(profile.online));
    const nextOnlineProfileIds = new Set(onlineProfiles.map((profile) => profile.id));

    if (this.socialPresenceReady && notifyTransitions) {
      onlineProfiles
        .filter((profile) => !this.knownOnlineProfileIds.has(profile.id))
        .forEach((profile) => this.showOnlineToast(profile));
    }

    this.knownOnlineProfileIds = nextOnlineProfileIds;
    this.socialPresenceReady = true;
  }

  private markActive(): void {
    const account = this.authService.currentAccount();
    if (!account) {
      return;
    }

    this.profileService.markPresence(account.id).subscribe({
      error: () => undefined,
    });
  }

  private refreshSocialPresence(accountId: number, notifyTransitions: boolean): void {
    if (this.socialPresenceRefreshRunning || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
      return;
    }

    this.socialPresenceRefreshRunning = true;
    forkJoin({
      friends: this.profileService.friends(accountId).pipe(catchError(() => of(null as PublicProfile[] | null))),
    }).subscribe({
      next: ({ friends }) => {
        if (friends === null) {
          return;
        }

        this.syncFriendsPresence(friends, notifyTransitions);
      },
      error: () => undefined,
      complete: () => {
        this.socialPresenceRefreshRunning = false;
      },
    });
  }

  private showOnlineToast(profile: PublicProfile): void {
    const now = Date.now();
    const lastToastAt = this.lastOnlineToastAt.get(profile.id) ?? 0;
    if (now - lastToastAt < ONLINE_TOAST_COOLDOWN_MS) {
      return;
    }

    this.lastOnlineToastAt.set(profile.id, now);
    this.dismissOnlineToast(profile.id);
    this.onlineToasts.update((toasts) => [{ id: profile.id, profile, createdAt: now }, ...toasts].slice(0, 3));

    const timer = setTimeout(() => this.dismissOnlineToast(profile.id), ONLINE_TOAST_DURATION_MS);
    this.onlineToastTimers.set(profile.id, timer);
  }

  private resetSocialPresence(): void {
    this.knownOnlineProfileIds.clear();
    this.lastOnlineToastAt.clear();
    this.socialPresenceReady = false;
    this.socialPresenceRefreshRunning = false;
    this.onlineToastTimers.forEach((timer) => clearTimeout(timer));
    this.onlineToastTimers.clear();
    this.onlineToasts.set([]);
  }

  private stopTimers(): void {
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }

    if (this.socialPresenceTimer) {
      clearInterval(this.socialPresenceTimer);
      this.socialPresenceTimer = null;
    }
  }

  private uniqueProfiles(profiles: PublicProfile[]): PublicProfile[] {
    return Array.from(new Map(profiles.map((profile) => [profile.id, profile])).values());
  }
}
