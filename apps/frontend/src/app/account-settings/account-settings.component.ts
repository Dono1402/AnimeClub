import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { Account } from '../models/account.model';
import { ProfileEditorComponent } from '../profile-editor/profile-editor.component';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { ProfileService } from '../services/profile.service';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MenuBarComponent,
    ProfileEditorComponent,
    TranslatePipe,
  ],
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.scss',
})
export class AccountSettingsComponent implements OnDestroy, OnInit {
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly profileService = inject(ProfileService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly account = signal<Account | null>(this.authService.currentAccount());
  readonly emailSaving = signal(false);
  readonly passwordSaving = signal(false);
  readonly pseudoSaving = signal(false);
  readonly privacySaving = signal(false);
  readonly emailFeedback = signal('');
  readonly passwordFeedback = signal('');
  readonly pseudoFeedback = signal('');
  readonly privacyFeedback = signal('');
  readonly emailError = signal('');
  readonly passwordError = signal('');
  readonly pseudoError = signal('');
  readonly privacyError = signal('');
  readonly toastMessage = signal('');

  readonly pseudoForm = this.formBuilder.group({
    pseudo: [this.account()?.pseudo ?? '', [Validators.required, Validators.maxLength(16)]],
  });

  readonly emailForm = this.formBuilder.group({
    mail: [this.account()?.mail ?? '', [Validators.required, Validators.email, Validators.maxLength(255)]],
    currentPassword: ['', [Validators.required]],
  });

  readonly passwordForm = this.formBuilder.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: this.passwordsMatch },
  );

  readonly privacyForm = this.formBuilder.group({
    showFollowers: [this.account()?.showFollowers !== false],
    showOnlineDiscovery: [this.account()?.showOnlineDiscovery === true],
  });

  ngOnInit(): void {
    const account = this.account();
    if (!account) {
      return;
    }

    this.profileService.get(account.id).subscribe({
      next: (updatedAccount) => this.applyAccount(updatedAccount),
      error: () => undefined,
    });
  }

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  updateEmail(): void {
    const account = this.account();
    if (!account || this.emailForm.invalid || this.emailSaving()) {
      this.emailForm.markAllAsTouched();
      return;
    }

    const request = this.emailForm.getRawValue();
    this.emailSaving.set(true);
    this.emailFeedback.set('');
    this.emailError.set('');

    this.authService.updateEmail(account.id, request).subscribe({
      next: (updatedAccount) => {
        this.applyAccount(updatedAccount);
        this.emailForm.patchValue({ mail: updatedAccount.mail, currentPassword: '' });
        this.emailSaving.set(false);
        this.emailFeedback.set(this.languageService.t('settings.emailUpdated'));
        this.showToast('settings.emailUpdated');
      },
      error: (error: unknown) => {
        this.emailSaving.set(false);
        this.emailError.set(this.extractMessage(error, 'settings.emailUpdateError'));
      },
    });
  }

  updatePseudo(): void {
    const account = this.account();
    if (!account || this.pseudoForm.invalid || this.pseudoSaving()) {
      this.pseudoForm.markAllAsTouched();
      return;
    }

    this.pseudoSaving.set(true);
    this.pseudoFeedback.set('');
    this.pseudoError.set('');

    this.authService.updatePseudo(account.id, this.pseudoForm.getRawValue()).subscribe({
      next: (updatedAccount) => {
        this.applyAccount(updatedAccount);
        this.pseudoSaving.set(false);
        this.pseudoFeedback.set('Pseudo mis a jour.');
        this.showToastText('Pseudo mis a jour.');
      },
      error: (error: unknown) => {
        this.pseudoSaving.set(false);
        this.pseudoError.set(this.extractMessage(error, 'settings.emailUpdateError'));
      },
    });
  }

  updatePassword(): void {
    const account = this.account();
    if (!account || this.passwordForm.invalid || this.passwordSaving()) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const request = this.passwordForm.getRawValue();
    this.passwordSaving.set(true);
    this.passwordFeedback.set('');
    this.passwordError.set('');

    this.authService
      .updatePassword(account.id, {
        currentPassword: request.currentPassword,
        newPassword: request.newPassword,
      })
      .subscribe({
        next: (response) => {
          this.passwordForm.reset();
          this.passwordSaving.set(false);
          this.passwordFeedback.set(response.message || this.languageService.t('settings.passwordUpdated'));
          this.showToast('settings.passwordUpdated');
        },
        error: (error: unknown) => {
          this.passwordSaving.set(false);
          this.passwordError.set(this.extractMessage(error, 'settings.passwordUpdateError'));
        },
      });
  }

  updatePrivacy(): void {
    const account = this.account();
    if (!account || this.privacySaving()) {
      return;
    }

    this.privacySaving.set(true);
    this.privacyFeedback.set('');
    this.privacyError.set('');

    this.profileService.updatePrivacy(account.id, this.privacyForm.getRawValue()).subscribe({
      next: (updatedAccount) => {
        this.applyAccount(updatedAccount);
        this.privacySaving.set(false);
        this.privacyFeedback.set('Confidentialite mise a jour.');
        this.showToastText('Confidentialite mise a jour.');
      },
      error: (error: unknown) => {
        this.privacySaving.set(false);
        this.privacyError.set(this.extractMessage(error, 'settings.emailUpdateError'));
      },
    });
  }

  private passwordsMatch(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    return newPassword && confirmPassword && newPassword !== confirmPassword ? { passwordMismatch: true } : null;
  }

  private extractMessage(error: unknown, fallbackKey: string): string {
    const message =
      typeof error === 'object' && error !== null && 'error' in error
        ? (error as { error?: { message?: string } }).error?.message
        : '';

    return message || this.languageService.t(fallbackKey);
  }

  private applyAccount(account: Account): void {
    this.account.set(account);
    this.authService.updateCurrentAccount(account);
    this.pseudoForm.patchValue({ pseudo: account.pseudo });
    this.emailForm.patchValue({ mail: account.mail });
    this.privacyForm.patchValue({
      showFollowers: account.showFollowers !== false,
      showOnlineDiscovery: account.showOnlineDiscovery === true,
    });
  }

  private showToast(messageKey: string): void {
    this.showToastText(this.languageService.t(messageKey));
  }

  private showToastText(message: string): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastMessage.set(message);
    this.toastTimer = setTimeout(() => {
      this.toastMessage.set('');
      this.toastTimer = null;
    }, 3200);
  }
}
