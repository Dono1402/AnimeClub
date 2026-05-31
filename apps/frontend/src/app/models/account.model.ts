export interface Account {
  id: number;
  pseudo: string;
  mail: string;
  emailVerified: boolean;
  displayName: string;
  bio: string;
  profileStatus: string;
  favoriteAnime: string;
  accentColor: string;
  profilePictureUrl: string | null;
  backgroundUrl: string | null;
  showFollowers: boolean;
  showFollowing: boolean;
  showAnimeLibrary: boolean;
  showMangaLibrary: boolean;
  showOnlineDiscovery: boolean;
  usernameChangeRequired: boolean;
}

export interface CreateAccountRequest {
  pseudo: string;
  mail: string;
  password: string;
}

export interface LoginRequest {
  pseudo: string;
  password: string;
  rememberSession?: boolean;
}

export interface LoginResponse {
  account: Account;
  sessionToken?: string | null;
  expiresAt: string;
}

export interface DiscordAuthorizeUrlResponse {
  authorizationUrl: string;
}

export interface DiscordLoginRequest {
  code: string;
  redirectUri: string;
  rememberSession?: boolean;
}

export interface DiscordLoginResponse {
  mode: 'login' | 'signupRequired';
  login: LoginResponse | null;
  signupToken: string | null;
  email: string | null;
  suggestedPseudo: string | null;
  expiresAt: string | null;
  message: string | null;
}

export interface DiscordSignupData {
  signupToken: string;
  email: string;
  suggestedPseudo: string;
  expiresAt: string;
  message: string;
}

export interface DiscordSignupRequest {
  signupToken: string;
  pseudo: string;
  password: string;
}

export interface CreateAccountResponse {
  account: Account;
  confirmationLink: string | null;
}

export interface ConfirmEmailResponse {
  account: Account;
  message: string;
}

export interface ChangePendingEmailRequest {
  identifier: string;
  password: string;
  mail: string;
}

export interface ChangePendingEmailResponse {
  message: string;
  confirmationLink: string | null;
}

export interface PasswordResetRequest {
  mail: string;
}

export interface PasswordResetResponse {
  message: string;
  resetLink: string | null;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface UpdateEmailRequest {
  mail: string;
  currentPassword: string;
}

export interface UpdatePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdatePseudoRequest {
  pseudo: string;
}

export interface UpdatePrivacyRequest {
  showFollowers: boolean;
  showFollowing?: boolean;
  showAnimeLibrary?: boolean;
  showMangaLibrary?: boolean;
  showOnlineDiscovery: boolean;
}
