import { Routes } from '@angular/router';

import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./home/home.component').then((module) => module.HomeComponent),
  },
  {
    path: 'landing',
    data: {
      title: 'AnimeClub - Crée ton Animethèque et suis tes animes',
      description: 'Crée ton Animethèque, suis tes épisodes, organise tes favoris et découvre ce que la communauté ajoute à sa liste.',
      image: '/assets/animetheque/animetheque-banner.png',
      type: 'website',
    },
    loadComponent: () =>
      import('./landing/landing.component').then((module) => module.LandingComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./form-sign-up/form-sign-up.component').then((module) => module.FormSignUpComponent),
  },
  {
    path: 'auth/discord/callback',
    loadComponent: () =>
      import('./discord-auth-callback/discord-auth-callback.component').then((module) => module.DiscordAuthCallbackComponent),
  },
  {
    path: 'register/discord',
    loadComponent: () =>
      import('./discord-sign-up/discord-sign-up.component').then((module) => module.DiscordSignUpComponent),
  },
  {
    path: 'inscription',
    redirectTo: 'register',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./form-sign-in/form-sign-in.component').then((module) => module.FormSignInComponent),
  },
  {
    path: 'connexion',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./forgot-password/forgot-password.component').then((module) => module.ForgotPasswordComponent),
  },
  {
    path: 'mot-de-passe-oublie',
    redirectTo: 'forgot-password',
    pathMatch: 'full',
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./reset-password/reset-password.component').then((module) => module.ResetPasswordComponent),
  },
  {
    path: 'change-validation-email',
    loadComponent: () =>
      import('./change-validation-email/change-validation-email.component').then((module) => module.ChangeValidationEmailComponent),
  },
  {
    path: 'changer-email-validation',
    redirectTo: 'change-validation-email',
    pathMatch: 'full',
  },
  {
    path: 'reinitialiser-mot-de-passe',
    redirectTo: 'reset-password',
    pathMatch: 'full',
  },
  {
    path: 'confirm-email',
    loadComponent: () =>
      import('./confirm-email/confirm-email.component').then((module) => module.ConfirmEmailComponent),
  },
  {
    path: 'confirmation-email',
    redirectTo: 'confirm-email',
    pathMatch: 'full',
  },
  {
    path: 'animes/:slug/seasons/:seasonSlug',
    loadComponent: () =>
      import('./anime-detail/anime-detail.component').then((module) => module.AnimeDetailComponent),
  },
  {
    path: 'animes/:slug/saisons/:seasonSlug',
    redirectTo: 'animes/:slug/seasons/:seasonSlug',
  },
  {
    path: 'animes/:slug',
    loadComponent: () =>
      import('./anime-detail/anime-detail.component').then((module) => module.AnimeDetailComponent),
  },
  {
    path: 'animes',
    loadComponent: () =>
      import('./anime-browse/anime-browse.component').then((module) => module.AnimeBrowseComponent),
  },
  {
    path: 'characters/:id',
    loadComponent: () =>
      import('./character-detail/character-detail.component').then((module) => module.CharacterDetailComponent),
  },
  {
    path: 'personnages/:id',
    redirectTo: 'characters/:id',
  },
  {
    path: 'characters',
    loadComponent: () =>
      import('./characters-page/characters-page.component').then((module) => module.CharactersPageComponent),
  },
  {
    path: 'personnages',
    redirectTo: 'characters',
    pathMatch: 'full',
  },
  {
    path: 'manga/:slug',
    loadComponent: () =>
      import('./manga-detail/manga-detail.component').then((module) => module.MangaDetailComponent),
  },
  {
    path: 'manga',
    loadComponent: () =>
      import('./manga-browse/manga-browse.component').then((module) => module.MangaBrowseComponent),
  },
  {
    path: 'personnages-manga',
    redirectTo: 'characters',
  },
  {
    path: 'anime-library',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./animetheque/animetheque.component').then((module) => module.AnimethequeComponent),
  },
  {
    path: 'animetheque',
    redirectTo: 'anime-library',
    pathMatch: 'full',
  },
  {
    path: 'manga-library',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./mangatheque/mangatheque.component').then((module) => module.MangathequeComponent),
  },
  {
    path: 'mangatheque',
    redirectTo: 'manga-library',
    pathMatch: 'full',
  },
  {
    path: 'following',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./following-feed/following-feed.component').then((module) => module.FollowingFeedComponent),
  },
  {
    path: 'suivis',
    redirectTo: 'following',
    pathMatch: 'full',
  },
  {
    path: 'online',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./online-discovery/online-discovery.component').then((module) => module.OnlineDiscoveryComponent),
  },
  {
    path: 'profils-en-ligne',
    redirectTo: 'online',
    pathMatch: 'full',
  },
  {
    path: 'achievements',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./achievements/achievements.component').then((module) => module.AchievementsComponent),
  },
  {
    path: 'badges',
    redirectTo: 'achievements',
    pathMatch: 'full',
  },
  {
    path: 'success',
    redirectTo: 'achievements',
    pathMatch: 'full',
  },
  {
    path: 'succes',
    redirectTo: 'achievements',
    pathMatch: 'full',
  },
  {
    path: 'messages',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./messages/messages.component').then((module) => module.MessagesComponent),
  },
  {
    path: 'notifications',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./notifications/notifications.component').then((module) => module.NotificationsComponent),
  },
  {
    path: 'profile/:pseudo/anime-library',
    data: { libraryMode: 'anime' },
    loadComponent: () =>
      import('./public-library/public-library.component').then((module) => module.PublicLibraryComponent),
  },
  {
    path: 'profile/:pseudo/manga-library',
    data: { libraryMode: 'manga' },
    loadComponent: () =>
      import('./public-library/public-library.component').then((module) => module.PublicLibraryComponent),
  },
  {
    path: 'profile/:pseudo/achievements',
    loadComponent: () =>
      import('./achievements/achievements.component').then((module) => module.AchievementsComponent),
  },
  {
    path: 'profile/:pseudo/followers',
    loadComponent: () =>
      import('./public-social-list/public-social-list.component').then((module) => module.PublicSocialListComponent),
  },
  {
    path: 'profile/:pseudo/following',
    loadComponent: () =>
      import('./public-social-list/public-social-list.component').then((module) => module.PublicSocialListComponent),
  },
  {
    path: 'profile/:pseudo',
    loadComponent: () =>
      import('./public-profile/public-profile.component').then((module) => module.PublicProfileComponent),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./public-profile/public-profile.component').then((module) => module.PublicProfileComponent),
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./account-settings/account-settings.component').then((module) => module.AccountSettingsComponent),
  },
  {
    path: 'legal-notice',
    data: { legalPage: 'legal' },
    loadComponent: () =>
      import('./legal-page/legal-page.component').then((module) => module.LegalPageComponent),
  },
  {
    path: 'mentions-legales',
    redirectTo: 'legal-notice',
    pathMatch: 'full',
  },
  {
    path: 'privacy-policy',
    data: { legalPage: 'privacy' },
    loadComponent: () =>
      import('./legal-page/legal-page.component').then((module) => module.LegalPageComponent),
  },
  {
    path: 'confidentialite',
    redirectTo: 'privacy-policy',
    pathMatch: 'full',
  },
  {
    path: 'terms',
    data: { legalPage: 'terms' },
    loadComponent: () =>
      import('./legal-page/legal-page.component').then((module) => module.LegalPageComponent),
  },
  {
    path: 'conditions-utilisation',
    redirectTo: 'terms',
    pathMatch: 'full',
  },
  {
    path: 'u/:pseudo/anime-library',
    redirectTo: 'profile/:pseudo/anime-library',
  },
  {
    path: 'u/:pseudo/animetheque',
    redirectTo: 'profile/:pseudo/anime-library',
  },
  {
    path: 'u/:pseudo/manga-library',
    redirectTo: 'profile/:pseudo/manga-library',
  },
  {
    path: 'u/:pseudo/mangatheque',
    redirectTo: 'profile/:pseudo/manga-library',
  },
  {
    path: 'u/:pseudo/achievements',
    redirectTo: 'profile/:pseudo/achievements',
  },
  {
    path: 'u/:pseudo/badges',
    redirectTo: 'profile/:pseudo/achievements',
  },
  {
    path: 'u/:pseudo/success',
    redirectTo: 'profile/:pseudo/achievements',
  },
  {
    path: 'u/:pseudo/succes',
    redirectTo: 'profile/:pseudo/achievements',
  },
  {
    path: 'u/:pseudo/followers',
    redirectTo: 'profile/:pseudo/followers',
  },
  {
    path: 'u/:pseudo/abonnes',
    redirectTo: 'profile/:pseudo/followers',
  },
  {
    path: 'u/:pseudo/following',
    redirectTo: 'profile/:pseudo/following',
  },
  {
    path: 'u/:pseudo/suivis',
    redirectTo: 'profile/:pseudo/following',
  },
  {
    path: 'u/:pseudo',
    redirectTo: 'profile/:pseudo',
    pathMatch: 'full',
  },
  {
    path: 'profil/:pseudo/anime-library',
    redirectTo: 'profile/:pseudo/anime-library',
  },
  {
    path: 'profil/:pseudo/animetheque',
    redirectTo: 'profile/:pseudo/anime-library',
  },
  {
    path: 'profil/:pseudo/manga-library',
    redirectTo: 'profile/:pseudo/manga-library',
  },
  {
    path: 'profil/:pseudo/mangatheque',
    redirectTo: 'profile/:pseudo/manga-library',
  },
  {
    path: 'profil/:pseudo/achievements',
    redirectTo: 'profile/:pseudo/achievements',
  },
  {
    path: 'profil/:pseudo/badges',
    redirectTo: 'profile/:pseudo/achievements',
  },
  {
    path: 'profil/:pseudo/success',
    redirectTo: 'profile/:pseudo/achievements',
  },
  {
    path: 'profil/:pseudo/succes',
    redirectTo: 'profile/:pseudo/achievements',
  },
  {
    path: 'profil/:pseudo/followers',
    redirectTo: 'profile/:pseudo/followers',
  },
  {
    path: 'profil/:pseudo/abonnes',
    redirectTo: 'profile/:pseudo/followers',
  },
  {
    path: 'profil/:pseudo/following',
    redirectTo: 'profile/:pseudo/following',
  },
  {
    path: 'profil/:pseudo/suivis',
    redirectTo: 'profile/:pseudo/following',
  },
  {
    path: 'profil/:pseudo',
    redirectTo: 'profile/:pseudo',
    pathMatch: 'full',
  },
  {
    path: 'profil',
    redirectTo: 'profile',
    pathMatch: 'full',
  },
  {
    path: 'parametres-compte',
    redirectTo: 'account',
    pathMatch: 'full',
  },
  {
    path: 'not-found',
    loadComponent: () =>
      import('./not-found/not-found.component').then((module) => module.NotFoundComponent),
  },
  { path: '**', redirectTo: 'not-found' },
];
