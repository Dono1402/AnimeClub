import { DecimalPipe } from '@angular/common';
import { Component, HostListener, Input, OnDestroy, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { Account } from '../models/account.model';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { ProfileService } from '../services/profile.service';

interface AvatarCropState {
  sourceUrl: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
  sourceAspectRatio: number;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const SOURCE_MAX_BYTES = 24 * 1024 * 1024;
const OUTPUT_SIZE = 640;
const OUTPUT_MAX_BYTES = 4 * 1024 * 1024;

@Component({
  selector: 'app-profile-avatar-editor',
  standalone: true,
  imports: [DecimalPipe, MatButtonModule, TranslatePipe],
  templateUrl: './profile-avatar-editor.component.html',
  styleUrl: './profile-avatar-editor.component.scss',
})
export class ProfileAvatarEditorComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly languageService = inject(LanguageService);

  private cropImage: HTMLImageElement | null = null;
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

  readonly account = signal<Account | null>(null);
  readonly displayNameValue = signal('');
  readonly initialsValue = signal('A');
  readonly saving = signal(false);
  readonly feedback = signal('');
  readonly actionsOpen = signal(false);
  readonly cacheVersion = signal(Date.now());
  readonly profilePicturePreview = signal<string | null>(null);
  readonly cropState = signal<AvatarCropState | null>(null);

  readonly profilePictureUrl = computed(
    () => this.profilePicturePreview() || this.profileService.assetUrl(this.account()?.profilePictureUrl, this.cacheVersion()),
  );

  @Input({ required: true })
  set currentAccount(value: Account | null) {
    this.account.set(value);
  }

  @Input({ required: true })
  set displayName(value: string) {
    this.displayNameValue.set(value || 'Profil');
  }

  @Input({ required: true })
  set initials(value: string) {
    this.initialsValue.set(value || 'A');
  }

  @HostListener('document:click', ['$event'])
  closeActionsOnOutsideClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.profile-avatar-editor') || target?.closest('.avatar-crop-backdrop')) {
      return;
    }

    this.actionsOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.actionsOpen.set(false);
    this.cancelCrop();
  }

  ngOnDestroy(): void {
    for (const objectUrl of this.objectUrls) {
      URL.revokeObjectURL(objectUrl);
    }
    this.objectUrls = [];
  }

  openAvatarActions(input: HTMLInputElement, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.profilePictureUrl()) {
      input.click();
      return;
    }

    this.actionsOpen.update((open) => !open);
  }

  changeAvatar(input: HTMLInputElement): void {
    this.actionsOpen.set(false);
    input.click();
  }

  selectProfilePicture(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.actionsOpen.set(false);

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
    void this.openCropper(objectUrl);
  }

  deleteProfilePicture(): void {
    const account = this.account();
    this.actionsOpen.set(false);

    if (!account || this.saving()) {
      return;
    }

    if (!account.profilePictureUrl) {
      this.profilePicturePreview.set(null);
      this.feedback.set(this.languageService.t('profile.pictureDeleted'));
      return;
    }

    this.saving.set(true);
    this.feedback.set(this.languageService.t('profile.saving'));
    this.profileService.deleteProfilePicture(account.id).subscribe({
      next: (updatedAccount) => this.applyUpdatedAccount(updatedAccount, 'profile.pictureDeleted'),
      error: () => {
        this.feedback.set(this.languageService.t('profile.saveError'));
        this.saving.set(false);
      },
    });
  }

  cropSelectionWidth(crop: AvatarCropState): number {
    const fullWidth = crop.sourceAspectRatio > 1 ? (1 / crop.sourceAspectRatio) * 100 : 100;
    return fullWidth / crop.zoom;
  }

  cropSelectionHeight(crop: AvatarCropState): number {
    const fullHeight = crop.sourceAspectRatio > 1 ? 100 : crop.sourceAspectRatio * 100;
    return fullHeight / crop.zoom;
  }

  cropSelectionLeft(crop: AvatarCropState): number {
    const width = this.cropSelectionWidth(crop);
    const maxTravel = (100 - width) / 2;
    return 50 + maxTravel * (crop.offsetX / 50) - width / 2;
  }

  cropSelectionTop(crop: AvatarCropState): number {
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
    const account = this.account();
    if (!crop || !this.cropImage || !account || this.saving()) {
      return;
    }

    try {
      const file = await this.createCroppedFile(this.cropImage, crop);
      const previewUrl = URL.createObjectURL(file);
      this.objectUrls.push(previewUrl);
      this.profilePicturePreview.set(previewUrl);
      this.cancelCrop();
      this.uploadProfilePicture(account.id, file);
    } catch {
      this.feedback.set(this.languageService.t('profile.pictureTooLarge'));
    }
  }

  private async openCropper(sourceUrl: string): Promise<void> {
    try {
      this.cropImage = await this.loadImage(sourceUrl);
      this.cropState.set({
        sourceUrl,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        sourceAspectRatio: this.cropImage.naturalWidth / this.cropImage.naturalHeight,
      });
      this.feedback.set(this.languageService.t('profile.cropHint'));
    } catch {
      this.feedback.set(this.languageService.t('profile.imageOnly'));
    }
  }

  private uploadProfilePicture(accountId: number, file: File): void {
    const formData = new FormData();
    formData.append('profilePicture', file);

    this.saving.set(true);
    this.feedback.set(this.languageService.t('profile.saving'));
    this.profileService.update(accountId, formData).subscribe({
      next: (updatedAccount) => this.applyUpdatedAccount(updatedAccount, 'profile.pictureChanged'),
      error: () => {
        this.profilePicturePreview.set(null);
        this.feedback.set(this.languageService.t('profile.saveError'));
        this.saving.set(false);
      },
    });
  }

  private applyUpdatedAccount(account: Account, messageKey: string): void {
    this.account.set(account);
    this.authService.updateCurrentAccount(account);
    this.profilePicturePreview.set(null);
    this.cacheVersion.set(Date.now());
    this.feedback.set(this.languageService.t(messageKey));
    this.saving.set(false);
  }

  private loadImage(sourceUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image loading failed'));
      image.src = sourceUrl;
    });
  }

  private async createCroppedFile(image: HTMLImageElement, crop: AvatarCropState): Promise<File> {
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;
    const imageAspectRatio = imageWidth / imageHeight;
    const baseCropWidth = imageAspectRatio > 1 ? imageHeight : imageWidth;
    const baseCropHeight = imageAspectRatio > 1 ? imageHeight : imageWidth;
    const cropWidth = baseCropWidth / crop.zoom;
    const cropHeight = baseCropHeight / crop.zoom;
    const centerX = imageWidth / 2 + ((imageWidth - cropWidth) / 2) * (crop.offsetX / 50);
    const centerY = imageHeight / 2 + ((imageHeight - cropHeight) / 2) * (crop.offsetY / 50);
    const sourceX = this.clamp(centerX - cropWidth / 2, 0, Math.max(0, imageWidth - cropWidth));
    const sourceY = this.clamp(centerY - cropHeight / 2, 0, Math.max(0, imageHeight - cropHeight));
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas unavailable');
    }

    context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    let quality = 0.9;
    let blob = await this.canvasToBlob(canvas, quality);
    while (blob.size > OUTPUT_MAX_BYTES && quality > 0.58) {
      quality -= 0.08;
      blob = await this.canvasToBlob(canvas, quality);
    }

    if (blob.size > OUTPUT_MAX_BYTES) {
      throw new Error('Cropped image is too large');
    }

    return new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
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
}
