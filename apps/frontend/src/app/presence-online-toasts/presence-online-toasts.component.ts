import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { PublicProfile } from '../models/public-profile.model';
import { PresenceOnlineToast, PresenceService } from '../services/presence.service';
import { ProfileService } from '../services/profile.service';

@Component({
  selector: 'app-presence-online-toasts',
  standalone: true,
  templateUrl: './presence-online-toasts.component.html',
  styleUrl: './presence-online-toasts.component.scss',
})
export class PresenceOnlineToastsComponent {
  private readonly presenceService = inject(PresenceService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);

  readonly toasts = this.presenceService.onlineToasts;

  displayName(profile: PublicProfile): string {
    return profile.displayName || profile.pseudo;
  }

  profilePicture(profile: PublicProfile): string | null {
    return this.profileService.assetUrl(profile.profilePictureUrl);
  }

  openProfile(toast: PresenceOnlineToast): void {
    this.dismiss(toast.id);
    void this.router.navigate(['/profile', toast.profile.pseudo]);
  }

  dismiss(profileId: number): void {
    this.presenceService.dismissOnlineToast(profileId);
  }
}
