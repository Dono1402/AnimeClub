import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  Account,
  ChangePendingEmailRequest,
  ChangePendingEmailResponse,
  ConfirmEmailResponse,
  CreateAccountRequest,
  CreateAccountResponse,
  DiscordSignupRequest,
  PasswordResetRequest,
  PasswordResetResponse,
  ResetPasswordRequest,
} from '../models/account.model';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SignupService {
  private readonly http = inject(HttpClient);
  private readonly accountUrl = `${environment.apiUrl}/account`;

  findAll(): Observable<Account[]> {
    return this.http.get<Account[]>(this.accountUrl);
  }

  createAccount(request: CreateAccountRequest): Observable<CreateAccountResponse> {
    return this.http.post<CreateAccountResponse>(this.accountUrl, request);
  }

  createDiscordAccount(request: DiscordSignupRequest): Observable<CreateAccountResponse> {
    return this.http.post<CreateAccountResponse>(`${this.accountUrl}/oauth/discord/signup`, request);
  }

  confirmEmail(token: string): Observable<ConfirmEmailResponse> {
    return this.http.get<ConfirmEmailResponse>(`${this.accountUrl}/confirm`, {
      params: { token },
    });
  }

  changePendingEmail(request: ChangePendingEmailRequest): Observable<ChangePendingEmailResponse> {
    return this.http.post<ChangePendingEmailResponse>(`${this.accountUrl}/email-confirmation/change-address`, request);
  }

  requestPasswordReset(request: PasswordResetRequest): Observable<PasswordResetResponse> {
    return this.http.post<PasswordResetResponse>(`${this.accountUrl}/password-reset/request`, request);
  }

  resetPassword(request: ResetPasswordRequest): Observable<PasswordResetResponse> {
    return this.http.post<PasswordResetResponse>(`${this.accountUrl}/password-reset/confirm`, request);
  }
}
