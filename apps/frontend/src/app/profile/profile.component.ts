import { DecimalPipe } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { Account } from '../models/account.model';
import { AnimethequeEntry } from '../models/animetheque.model';
import { FollowState } from '../models/social.model';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AnimethequeService } from '../services/animetheque.service';
import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { ProfileService } from '../services/profile.service';
import {
  animeLevelHue,
  animeLevelNextHue,
  buildAnimeAchievementSummary,
} from '../utils/anime-achievements.util';

type CropTarget = 'profilePicture' | 'background';

interface CropState {
  target: CropTarget;
  sourceUrl: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
  aspectRatio: number;
  sourceAspectRatio: number;
}

interface MediaPanelPosition {
  left: number;
  top: number;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const SOURCE_MAX_BYTES = 24 * 1024 * 1024;
const CROP_SETTINGS: Record<CropTarget, { aspectRatio: number; outputWidth: number; outputHeight: number; maxBytes: number }> = {
  profilePicture: {
    aspectRatio: 1,
    outputWidth: 640,
    outputHeight: 640,
    maxBytes: 4 * 1024 * 1024,
  },
  background: {
    aspectRatio: 4,
    outputWidth: 1600,
    outputHeight: 400,
    maxBytes: 10 * 1024 * 1024,
  },
};

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [RouterLink, MatButtonModule, DecimalPipe, MenuBarComponent, TranslatePipe],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly animethequeService = inject(AnimethequeService);
  private readonly languageService = inject(LanguageService);

  private cropImage: HTMLImageElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private objectUrls: string[] = [];
  private cropDrag:
    | {
        pointerId: number;
        startX: number;
        startY: number;
        initialOffsetX: number;
        initialOffsetY: number;
        frameWidth: number;
        frameHeight: number;
        maxTravelX: number;
        maxTravelY: number;
      }
    | null = null;

  readonly account = signal<Account | null>(this.authService.currentAccount());
  readonly cacheVersion = signal(Date.now());
  readonly entries = signal<AnimethequeEntry[]>([]);
  readonly backgroundPreview = signal<string | null>(null);
  readonly cropState = signal<CropState | null>(null);
  readonly feedback = signal('');
  readonly followState = signal<FollowState | null>(null);
  readonly mediaActionTarget = signal<CropTarget | null>(null);
  readonly mediaPanelPosition = signal<MediaPanelPosition>({ left: 24, top: 24 });
  readonly profilePicturePreview = signal<string | null>(null);
  readonly saving = signal(false);
  readonly toastMessage = signal('');

  readonly displayName = computed(() => {
    const account = this.account();
    return account?.displayName || account?.pseudo || '';
  });
  readonly accentColor = computed(() => this.account()?.accentColor || '#ff6f4f');
  readonly profilePictureUrl = computed(() =>
    this.profilePicturePreview() || this.profileService.assetUrl(this.account()?.profilePictureUrl, this.cacheVersion()),
  );
  readonly backgroundUrl = computed(() =>
    this.backgroundPreview() || this.profileService.assetUrl(this.account()?.backgroundUrl, this.cacheVersion()),
  );
  readonly bannerStyle = computed(() => {
    const backgroundUrl = this.backgroundUrl();
    return backgroundUrl
      ? `linear-gradient(180deg, rgba(16, 16, 16, 0.02), rgba(16, 16, 16, 0.42)), url("${backgroundUrl}")`
      : 'linear-gradient(135deg, #15110f 0%, #2f3926 45%, #5a3a1e 100%)';
  });
  readonly initials = computed(() => this.displayName().slice(0, 1).toUpperCase() || 'A');
  readonly favoriteEntries = computed(() => this.entries().filter((entry) => entry.favorite).slice(0, 4));
  readonly followersCount = computed(() => this.followState()?.followersCount ?? 0);
  readonly followingCount = computed(() => this.followState()?.followingCount ?? 0);
  readonly animeProgress = computed(() => buildAnimeAchievementSummary(this.entries()));
  readonly animeLevelHue = computed(() => animeLevelHue(this.animeProgress().level));
  readonly animeLevelNextHue = computed(() => animeLevelNextHue(this.animeProgress().level));

  ngOnInit(): void {
    const account = this.account();
    if (!account) {
      return;
    }

    this.loadProfile(account.id);
    this.loadLibrary(account.id);
    this.loadFollowState(account.id);
  }

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.revokeObjectUrls();
  }

  @HostListener('document:click', ['$event'])
  closeMediaActionsOnOutsideClick(event: MouseEvent): void {
    if (!this.mediaActionTarget()) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('.media-panel')) {
      return;
    }

    this.closeMediaActions();
  }

  @HostListener('document:keydown.escape')
  closeMediaActionsOnEscape(): void {
    this.closeMediaActions();
  }

  animeLevelProgressLabel(): string {
    const progress = this.animeProgress();
    if (progress.isMaxLevel) {
      return 'Niveau maximum atteint';
    }

    return `${progress.xpIntoLevel}/${progress.xpForNextLevel} XP vers le niveau ${progress.level + 1}`;
  }

  selectProfilePicture(event: Event): void {
    this.selectImage(event, 'profilePicture');
  }

  selectBackground(event: Event): void {
    this.selectImage(event, 'background');
  }

  openMediaActions(target: CropTarget, input: HTMLInputElement, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const hasImage = target === 'profilePicture' ? Boolean(this.profilePictureUrl()) : Boolean(this.backgroundUrl());
    if (!hasImage) {
      input.click();
      return;
    }

    this.mediaPanelPosition.set(this.panelPositionFromPointer(event));
    this.mediaActionTarget.set(target);
  }

  closeMediaActions(): void {
    this.mediaActionTarget.set(null);
  }

  changeSelectedMedia(input: HTMLInputElement): void {
    this.closeMediaActions();
    input.click();
  }

  deleteSelectedMedia(): void {
    const target = this.mediaActionTarget();
    const account = this.account();
    this.closeMediaActions();

    if (!target || !account) {
      return;
    }

    if (target === 'profilePicture') {
      this.profilePicturePreview.set(null);

      if (!account.profilePictureUrl) {
        this.feedback.set(this.languageService.t('profile.pictureDeleted'));
        this.showToast('profile.pictureDeleted');
        return;
      }

      this.profileService.deleteProfilePicture(account.id).subscribe({
        next: (updatedAccount) => this.applyUpdatedAccount(updatedAccount, 'profile.pictureDeleted'),
        error: () => this.feedback.set(this.languageService.t('profile.saveError')),
      });
      return;
    }

    this.backgroundPreview.set(null);

    if (!account.backgroundUrl) {
      this.feedback.set(this.languageService.t('profile.backgroundDeleted'));
      this.showToast('profile.backgroundDeleted');
      return;
    }

    this.profileService.deleteBackground(account.id).subscribe({
      next: (updatedAccount) => this.applyUpdatedAccount(updatedAccount, 'profile.backgroundDeleted'),
      error: () => this.feedback.set(this.languageService.t('profile.saveError')),
    });
  }

  cropSelectionWidth(crop: CropState): number {
    const fullWidth = crop.sourceAspectRatio > crop.aspectRatio ? (crop.aspectRatio / crop.sourceAspectRatio) * 100 : 100;
    return fullWidth / crop.zoom;
  }

  cropSelectionHeight(crop: CropState): number {
    const fullHeight = crop.sourceAspectRatio > crop.aspectRatio ? 100 : (crop.sourceAspectRatio / crop.aspectRatio) * 100;
    return fullHeight / crop.zoom;
  }

  cropSelectionLeft(crop: CropState): number {
    const width = this.cropSelectionWidth(crop);
    const maxTravel = (100 - width) / 2;
    return 50 + maxTravel * (crop.offsetX / 50) - width / 2;
  }

  cropSelectionTop(crop: CropState): number {
    const height = this.cropSelectionHeight(crop);
    const maxTravel = (100 - height) / 2;
    return 50 + maxTravel * (crop.offsetY / 50) - height / 2;
  }

  startCropDrag(event: PointerEvent): void {
    const crop = this.cropState();
    if (!crop) {
      return;
    }

    const frame = event.currentTarget as HTMLElement;
    const selectionWidth = this.cropSelectionWidth(crop);
    const selectionHeight = this.cropSelectionHeight(crop);
    frame.setPointerCapture(event.pointerId);
    this.cropDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialOffsetX: crop.offsetX,
      initialOffsetY: crop.offsetY,
      frameWidth: frame.clientWidth || 1,
      frameHeight: frame.clientHeight || 1,
      maxTravelX: Math.max(0, (100 - selectionWidth) / 2),
      maxTravelY: Math.max(0, (100 - selectionHeight) / 2),
    };
    event.preventDefault();
  }

  moveCropDrag(event: PointerEvent): void {
    const drag = this.cropDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = drag.maxTravelX === 0 ? 0 : (((event.clientX - drag.startX) / drag.frameWidth) * 100 * 50) / drag.maxTravelX;
    const deltaY = drag.maxTravelY === 0 ? 0 : (((event.clientY - drag.startY) / drag.frameHeight) * 100 * 50) / drag.maxTravelY;
    this.cropState.update((crop) =>
      crop
        ? {
            ...crop,
            offsetX: this.clamp(drag.initialOffsetX + deltaX, -50, 50),
            offsetY: this.clamp(drag.initialOffsetY + deltaY, -50, 50),
          }
        : crop,
    );
    event.preventDefault();
  }

  endCropDrag(event: PointerEvent): void {
    if (this.cropDrag?.pointerId === event.pointerId) {
      const frame = event.currentTarget as HTMLElement;
      if (frame.hasPointerCapture(event.pointerId)) {
        frame.releasePointerCapture(event.pointerId);
      }
      this.cropDrag = null;
    }
  }

  zoomCrop(delta: number): void {
    this.cropState.update((crop) =>
      crop ? { ...crop, zoom: this.clamp(Number((crop.zoom + delta).toFixed(2)), 1, 3) } : crop,
    );
  }

  zoomCropWithWheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoomCrop(event.deltaY < 0 ? 0.1 : -0.1);
  }

  resetCrop(): void {
    this.cropState.update((crop) => (crop ? { ...crop, zoom: 1, offsetX: 0, offsetY: 0 } : crop));
  }

  cancelCrop(): void {
    this.cropDrag = null;
    this.cropState.set(null);
    this.cropImage = null;
  }

  async applyCrop(): Promise<void> {
    const crop = this.cropState();
    if (!crop || !this.cropImage) {
      return;
    }

    try {
      const file = await this.createCroppedFile(this.cropImage, crop);
      const previewUrl = URL.createObjectURL(file);
      this.objectUrls.push(previewUrl);

      if (crop.target === 'profilePicture') {
        this.profilePicturePreview.set(previewUrl);
      } else {
        this.backgroundPreview.set(previewUrl);
      }

      this.cancelCrop();
      this.uploadCroppedMedia(crop.target, file);
    } catch {
      const messageKey = crop.target === 'profilePicture' ? 'profile.pictureTooLarge' : 'profile.backgroundTooLarge';
      this.feedback.set(this.languageService.t(messageKey));
    }
  }

  private loadProfile(accountId: number): void {
    this.profileService.get(accountId).subscribe({
      next: (account) => {
        this.account.set(account);
        this.authService.updateCurrentAccount(account);
        this.cacheVersion.set(Date.now());
      },
    });
  }

  private loadLibrary(accountId: number): void {
    this.animethequeService.list(accountId).subscribe({
      next: (entries) => this.entries.set(entries),
      error: () => this.entries.set([]),
    });
  }

  private loadFollowState(accountId: number): void {
    this.profileService.followState(accountId, accountId).subscribe({
      next: (state) => this.followState.set(state),
      error: () => this.followState.set(null),
    });
  }

  private selectImage(event: Event, target: CropTarget): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.closeMediaActions();

    if (!file) {
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      this.feedback.set(this.languageService.t('profile.imageOnly'));
      return;
    }

    if (file.size > SOURCE_MAX_BYTES) {
      this.feedback.set(this.languageService.t('profile.imageSourceTooLarge'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    this.objectUrls.push(objectUrl);
    this.openCropper(objectUrl, target);
  }

  private async openCropper(sourceUrl: string, target: CropTarget): Promise<void> {
    try {
      this.cropImage = await this.loadImage(sourceUrl);
      this.cropState.set({
        target,
        sourceUrl,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        aspectRatio: CROP_SETTINGS[target].aspectRatio,
        sourceAspectRatio: this.cropImage.naturalWidth / this.cropImage.naturalHeight,
      });
      this.feedback.set(this.languageService.t('profile.cropHint'));
    } catch {
      this.feedback.set(this.languageService.t('profile.imageOnly'));
    }
  }

  private applyUpdatedAccount(account: Account, messageKey: string): void {
    this.account.set(account);
    this.authService.updateCurrentAccount(account);
    this.profilePicturePreview.set(null);
    this.backgroundPreview.set(null);
    this.cropState.set(null);
    this.cropImage = null;
    this.cacheVersion.set(Date.now());
    this.feedback.set(this.languageService.t(messageKey));
    this.showToast(messageKey);
    this.saving.set(false);
  }

  private uploadCroppedMedia(target: CropTarget, file: File): void {
    const account = this.account();
    if (!account || this.saving()) {
      return;
    }

    const formData = new FormData();
    formData.append(target === 'profilePicture' ? 'profilePicture' : 'background', file);

    const messageKey = target === 'profilePicture' ? 'profile.pictureChanged' : 'profile.backgroundChanged';
    this.saving.set(true);
    this.feedback.set(this.languageService.t('profile.saving'));

    this.profileService.update(account.id, formData).subscribe({
      next: (updatedAccount) => this.applyUpdatedAccount(updatedAccount, messageKey),
      error: () => {
        if (target === 'profilePicture') {
          this.profilePicturePreview.set(null);
        } else {
          this.backgroundPreview.set(null);
        }

        this.feedback.set(this.languageService.t('profile.saveError'));
        this.saving.set(false);
      },
    });
  }

  private showToast(messageKey: string): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastMessage.set(this.languageService.t(messageKey));
    this.toastTimer = setTimeout(() => {
      this.toastMessage.set('');
      this.toastTimer = null;
    }, 3600);
  }

  private loadImage(sourceUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image loading failed'));
      image.src = sourceUrl;
    });
  }

  private async createCroppedFile(image: HTMLImageElement, crop: CropState): Promise<File> {
    const settings = CROP_SETTINGS[crop.target];
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;
    const imageAspectRatio = imageWidth / imageHeight;
    const baseCropWidth = imageAspectRatio > settings.aspectRatio ? imageHeight * settings.aspectRatio : imageWidth;
    const baseCropHeight = imageAspectRatio > settings.aspectRatio ? imageHeight : imageWidth / settings.aspectRatio;
    const cropWidth = baseCropWidth / crop.zoom;
    const cropHeight = baseCropHeight / crop.zoom;
    const centerX = imageWidth / 2 + ((imageWidth - cropWidth) / 2) * (crop.offsetX / 50);
    const centerY = imageHeight / 2 + ((imageHeight - cropHeight) / 2) * (crop.offsetY / 50);
    const sourceX = this.clamp(centerX - cropWidth / 2, 0, Math.max(0, imageWidth - cropWidth));
    const sourceY = this.clamp(centerY - cropHeight / 2, 0, Math.max(0, imageHeight - cropHeight));
    const canvas = document.createElement('canvas');
    canvas.width = settings.outputWidth;
    canvas.height = settings.outputHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas unavailable');
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      0,
      0,
      settings.outputWidth,
      settings.outputHeight,
    );

    let quality = 0.9;
    let blob = await this.canvasToBlob(canvas, quality);
    while (blob.size > settings.maxBytes && quality > 0.58) {
      quality -= 0.08;
      blob = await this.canvasToBlob(canvas, quality);
    }

    if (blob.size > settings.maxBytes) {
      throw new Error('Cropped image is too large');
    }

    const prefix = crop.target === 'profilePicture' ? 'avatar' : 'banner';
    return new File([blob], `${prefix}-${Date.now()}.jpg`, { type: 'image/jpeg' });
  }

  private canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }

          reject(new Error('Image export failed'));
        },
        'image/jpeg',
        quality,
      );
    });
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private revokeObjectUrls(): void {
    for (const objectUrl of this.objectUrls) {
      URL.revokeObjectURL(objectUrl);
    }
    this.objectUrls = [];
  }

  private panelPositionFromPointer(event: MouseEvent): MediaPanelPosition {
    const panelWidth = 280;
    const estimatedPanelHeight = 178;
    const viewportPadding = 16;
    const left = Math.min(
      Math.max(event.clientX - panelWidth / 2, viewportPadding),
      window.innerWidth - panelWidth - viewportPadding,
    );
    const top = Math.min(
      Math.max(event.clientY + 12, viewportPadding),
      window.innerHeight - estimatedPanelHeight - viewportPadding,
    );

    return { left, top };
  }
}
