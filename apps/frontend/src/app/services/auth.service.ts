import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';

import {
  Account,
  DiscordAuthorizeUrlResponse,
  DiscordLoginRequest,
  DiscordLoginResponse,
  DiscordSignupData,
  LoginRequest,
  LoginResponse,
  PasswordResetResponse,
  UpdateEmailRequest,
  UpdatePasswordRequest,
  UpdatePseudoRequest,
} from '../models/account.model';
import { environment } from '../../environments/environment';

const SESSION_ACCOUNT_KEY = 'animaclub.account';
const PERSISTED_ACCOUNT_KEY = 'animaclub.account.persisted';
export const SESSION_AUTH_KEY = 'animaclub.session';
export const PERSISTED_AUTH_KEY = 'animaclub.session.persisted';
const DISCORD_OAUTH_STATE_KEY = 'animeclub.discord.oauth.state';
const DISCORD_SIGNUP_KEY = 'animeclub.discord.signup';
const DISCORD_OAUTH_REDIRECT_PATH = '/auth/discord/callback';

interface StoredAuthSession {
  account: Account;
  sessionToken: string;
  expiresAt: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly accountUrl = `${environment.apiUrl}/account`;
  private currentSession = this.readSession();
  private readonly accountSubject = new BehaviorSubject<Account | null>(this.currentSession?.account ?? null);

  readonly account$ = this.accountSubject.asObservable();

  login(request: LoginRequest, rememberSession = false): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.accountUrl}/login`, request).pipe(
      map((response) => this.requireValidLoginResponse(response)),
      tap((response) => this.setSession({
        account: response.account,
        sessionToken: response.sessionToken,
        expiresAt: response.expiresAt,
      }, rememberSession)),
    );
  }

  discordAuthorizeUrl(redirectUri: string, state: string): Observable<DiscordAuthorizeUrlResponse> {
    return this.http.get<DiscordAuthorizeUrlResponse>(`${this.accountUrl}/oauth/discord/authorize-url`, {
      params: { redirectUri, state },
    });
  }

  loginWithDiscord(request: DiscordLoginRequest, rememberSession = true): Observable<DiscordLoginResponse> {
    return this.http.post<DiscordLoginResponse>(`${this.accountUrl}/oauth/discord/login`, request).pipe(
      map((response) => this.requireValidDiscordLoginResponse(response)),
      tap((response) => {
        if (response.mode !== 'login' || !response.login) {
          return;
        }

        this.setSession({
          account: response.login.account,
          sessionToken: response.login.sessionToken,
          expiresAt: response.login.expiresAt,
        }, rememberSession);
      }),
    );
  }

  createDiscordOAuthState(): string {
    const bytes = new Uint8Array(24);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index++) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }

    const state = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(DISCORD_OAUTH_STATE_KEY, state);
    return state;
  }

  consumeDiscordOAuthState(returnedState: string | null): boolean {
    const expectedState = sessionStorage.getItem(DISCORD_OAUTH_STATE_KEY);
    sessionStorage.removeItem(DISCORD_OAUTH_STATE_KEY);
    return !!expectedState && !!returnedState && expectedState === returnedState;
  }

  discordRedirectUri(): string {
    const origin = typeof window === 'undefined' ? environment.appUrl : window.location.origin;
    return `${origin}${DISCORD_OAUTH_REDIRECT_PATH}`;
  }

  storeDiscordSignup(data: DiscordSignupData): void {
    sessionStorage.setItem(DISCORD_SIGNUP_KEY, JSON.stringify(data));
  }

  readDiscordSignup(): DiscordSignupData | null {
    const raw = sessionStorage.getItem(DISCORD_SIGNUP_KEY);
    if (!raw) {
      return null;
    }

    try {
      const data = JSON.parse(raw) as DiscordSignupData;
      if (!data.signupToken || !data.email || !data.expiresAt || Date.parse(data.expiresAt) <= Date.now()) {
        this.clearDiscordSignup();
        return null;
      }
      return data;
    } catch {
      this.clearDiscordSignup();
      return null;
    }
  }

  clearDiscordSignup(): void {
    sessionStorage.removeItem(DISCORD_SIGNUP_KEY);
  }

  logout(): void {
    const account = this.accountSubject.value;
    if (account) {
      this.http.put<void>(`${this.accountUrl}/${account.id}/presence/offline`, {}).subscribe({
        error: () => undefined,
      });
    }

    if (this.currentSession?.sessionToken) {
      this.http.post<void>(`${this.accountUrl}/logout`, {}).subscribe({
        error: () => undefined,
      });
    }

    this.clearSession();
    this.accountSubject.next(null);
  }

  isLoggedIn(): boolean {
    return this.currentSessionToken() !== null && this.accountSubject.value !== null;
  }

  currentAccount(): Account | null {
    return this.currentSessionToken() === null ? null : this.accountSubject.value;
  }

  currentSessionToken(): string | null {
    if (!this.currentSession) {
      return null;
    }

    if (this.isExpired(this.currentSession)) {
      this.clearSession();
      this.accountSubject.next(null);
      return null;
    }

    return this.currentSession.sessionToken;
  }

  clearRejectedSession(rejectedToken: string): boolean {
    if (!this.currentSession || this.currentSession.sessionToken !== rejectedToken) {
      return false;
    }

    this.clearSession();
    this.accountSubject.next(null);
    return true;
  }

  updateEmail(accountId: number, request: UpdateEmailRequest): Observable<Account> {
    return this.http.put<Account>(`${this.accountUrl}/${accountId}/email`, request).pipe(
      tap((account) => this.updateCurrentAccount(account)),
    );
  }

  updatePassword(accountId: number, request: UpdatePasswordRequest): Observable<PasswordResetResponse> {
    return this.http.put<PasswordResetResponse>(`${this.accountUrl}/${accountId}/password`, request);
  }

  updatePseudo(accountId: number, request: UpdatePseudoRequest): Observable<Account> {
    return this.http.put<Account>(`${this.accountUrl}/${accountId}/pseudo`, request).pipe(
      tap((account) => this.updateCurrentAccount(account)),
    );
  }

  updateCurrentAccount(account: Account): void {
    if (!this.currentSession) {
      this.clearSession();
      this.accountSubject.next(null);
      return;
    }

    const rememberSession = localStorage.getItem(PERSISTED_AUTH_KEY) !== null;
    this.setSession({ ...this.currentSession, account }, rememberSession);
  }

  private setSession(session: StoredAuthSession, rememberSession: boolean): void {
    const serializedSession = JSON.stringify(session);
    this.currentSession = session;

    if (rememberSession) {
      localStorage.setItem(PERSISTED_AUTH_KEY, serializedSession);
      sessionStorage.removeItem(SESSION_AUTH_KEY);
    } else {
      sessionStorage.setItem(SESSION_AUTH_KEY, serializedSession);
      localStorage.removeItem(PERSISTED_AUTH_KEY);
    }

    this.clearLegacyStorage();
    this.accountSubject.next(session.account);
  }

  private readSession(): StoredAuthSession | null {
    const raw = sessionStorage.getItem(SESSION_AUTH_KEY) ?? localStorage.getItem(PERSISTED_AUTH_KEY);
    if (!raw) {
      this.clearLegacyStorage();
      return null;
    }

    try {
      const session = JSON.parse(raw) as StoredAuthSession;
      if (!session.account || !session.sessionToken) {
        this.clearSession();
        return null;
      }

      if (this.isExpired(session)) {
        this.clearSession();
        return null;
      }

      return session;
    } catch {
      this.clearSession();
      return null;
    }
  }

  private isExpired(session: StoredAuthSession): boolean {
    const expiresAt = Date.parse(session.expiresAt);
    return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
  }

  private clearSession(): void {
    this.currentSession = null;
    sessionStorage.removeItem(SESSION_AUTH_KEY);
    localStorage.removeItem(PERSISTED_AUTH_KEY);
    this.clearLegacyStorage();
  }

  private clearLegacyStorage(): void {
    sessionStorage.removeItem(SESSION_ACCOUNT_KEY);
    localStorage.removeItem(PERSISTED_ACCOUNT_KEY);
  }

  private requireValidLoginResponse(response: LoginResponse): LoginResponse {
    if (!response.account || !response.sessionToken?.trim()) {
      throw new Error('Réponse de connexion invalide : session absente.');
    }

    return response;
  }

  private requireValidDiscordLoginResponse(response: DiscordLoginResponse): DiscordLoginResponse {
    if (response.mode === 'login') {
      if (!response.login) {
        throw new Error('Reponse Discord invalide : session absente.');
      }

      this.requireValidLoginResponse(response.login);
      return response;
    }

    if (response.mode === 'signupRequired') {
      if (!response.signupToken?.trim() || !response.email?.trim() || !response.expiresAt?.trim()) {
        throw new Error('Reponse Discord invalide : inscription incomplete.');
      }

      return response;
    }

    throw new Error('Reponse Discord invalide.');
  }
}
