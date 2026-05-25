import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { TranslatePipe } from '../pipes/translate.pipe';
import { LanguageService } from '../services/language.service';
import { SignupService } from '../services/signup.service';

@Component({
  selector: 'app-confirm-email',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatCardModule, MenuBarComponent, TranslatePipe],
  templateUrl: './confirm-email.component.html',
  styleUrl: './confirm-email.component.scss',
})
export class ConfirmEmailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly signupService = inject(SignupService);
  private readonly languageService = inject(LanguageService);

  readonly isLoading = signal(true);
  readonly isConfirmed = signal(false);
  readonly message = signal(this.languageService.t('confirm.pending'));

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.isLoading.set(false);
      this.message.set(this.languageService.t('confirm.invalid'));
      return;
    }

    this.signupService.confirmEmail(token).subscribe({
      next: (response) => {
        this.isLoading.set(false);
        this.isConfirmed.set(true);
        this.message.set(response.message);
      },
      error: (error: unknown) => {
        this.isLoading.set(false);
        this.message.set(this.extractMessage(error));
      },
    });
  }

  private extractMessage(error: unknown): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'message' in error.error &&
      typeof error.error.message === 'string'
    ) {
      return error.error.message;
    }

    return this.languageService.t('confirm.failed');
  }
}
