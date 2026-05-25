import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { BrowserTitleBadgeService } from './browser-title-badge.service';
import { environment } from '../../environments/environment';

interface PageMeta {
  title: string;
  description: string;
  image?: string;
  noindex?: boolean;
  type?: string;
}

const APP_NAME = 'AnimeClub';
const DEFAULT_IMAGE = '/assets/brand/animeclub-logo-nav.png';
const MARKETING_DESCRIPTION =
  'Découvre AnimeClub, organise tes animes et mangas, suis ta progression, crée ton profil et partage tes listes avec la communauté.';
const DEFAULT_DESCRIPTION =
  MARKETING_DESCRIPTION;

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly browserTitleBadgeService = inject(BrowserTitleBadgeService);
  private started = false;

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.applyRouteMeta();
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => this.applyRouteMeta());
  }

  setPageMeta(meta: PageMeta): void {
    this.applyMeta(meta, this.router.url);
  }

  private applyRouteMeta(): void {
    const data = this.deepestRouteData();
    const fallback = this.fallbackMeta(this.router.url);
    this.applyMeta({
      title: this.stringData(data, 'title') || fallback.title,
      description: this.stringData(data, 'description') || fallback.description,
      image: this.stringData(data, 'image') || fallback.image,
      noindex: this.booleanData(data, 'noindex') ?? fallback.noindex,
      type: this.stringData(data, 'type') || fallback.type,
    }, this.router.url);
  }

  private deepestRouteData(): Record<string, unknown> {
    let current = this.route.snapshot;
    while (current.firstChild) {
      current = current.firstChild;
    }

    return current.data;
  }

  private stringData(data: Record<string, unknown>, key: string): string | undefined {
    const value = data[key];
    return typeof value === 'string' ? value : undefined;
  }

  private booleanData(data: Record<string, unknown>, key: string): boolean | undefined {
    const value = data[key];
    return typeof value === 'boolean' ? value : undefined;
  }

  private fallbackMeta(url: string): PageMeta {
    const path = url.split('?')[0].replace(/\/+$/, '') || '/';

    if (path === '/') {
      return {
        title: 'AnimeClub - Crée ton Animethèque et suis tes animes',
        description: MARKETING_DESCRIPTION,
        image: '/assets/animetheque/animetheque-banner.png',
        type: 'website',
      };
    }

    if (path === '/landing') {
      return {
        title: 'AnimeClub - Crée ton Animethèque et suis tes animes',
        description: 'Crée ton Animethèque, suis tes épisodes, organise tes favoris et découvre ce que la communauté ajoute à sa liste.',
        image: '/assets/animetheque/animetheque-banner.png',
        type: 'website',
      };
    }

    if (path === '/animes') {
      return {
        title: 'Catalogue Anime - AnimeClub',
        description: 'Explore les animes, films, OVA et séries disponibles dans le catalogue AnimeClub.',
      };
    }

    if (path.startsWith('/animes/')) {
      return {
        title: 'Fiche anime - AnimeClub',
        description: 'Découvre une fiche anime AnimeClub avec synopsis, épisodes, personnages, genres, score et ajout à ton Animethèque.',
      };
    }

    if (path === '/manga') {
      return {
        title: 'Catalogue manga - AnimeClub',
        description: 'Explore le catalogue manga AnimeClub : recherche, filtres, auteurs, score et ajout à ta Mangathèque.',
      };
    }

    if (path.startsWith('/manga/')) {
      return {
        title: 'Fiche manga - AnimeClub',
        description: 'Découvre une fiche manga AnimeClub avec synopsis, volumes, chapitres, auteurs et suivi dans ta Mangathèque.',
      };
    }

    if (path === '/characters') {
      return {
        title: 'Personnages - AnimeClub',
        description: 'Parcourez les personnages anime, leurs fiches, leurs rôles et leurs animes associés sur AnimeClub.',
      };
    }

    if (path.startsWith('/characters/')) {
      return {
        title: 'Fiche personnage - AnimeClub',
        description: 'Consultez une fiche personnage AnimeClub avec image, description, origine et liens associés.',
      };
    }

    if (path.startsWith('/profile/') && !this.isPrivatePath(path)) {
      return {
        title: 'Profil public - AnimeClub',
        description: 'Consultez un profil public AnimeClub, ses favoris, badges, activité et listes publiques.',
      };
    }

    if (this.isPrivatePath(path)) {
      return {
        title: 'Espace utilisateur - AnimeClub',
        description: 'Espace utilisateur AnimeClub.',
        noindex: true,
      };
    }

    if (path === '/legal-notice') {
      return {
        title: 'Mentions légales - AnimeClub',
        description: 'Mentions légales du site AnimeClub.',
      };
    }

    if (path === '/privacy-policy') {
      return {
        title: 'Politique de confidentialité - AnimeClub',
        description: 'Politique de confidentialité et traitement des données personnelles sur AnimeClub.',
      };
    }

    if (path === '/terms') {
      return {
        title: 'Conditions d’utilisation - AnimeClub',
        description: 'Conditions d’utilisation du site AnimeClub.',
      };
    }

    return {
      title: 'Page introuvable - AnimeClub',
      description: 'Cette page AnimeClub est introuvable.',
      noindex: true,
    };
  }

  private isPrivatePath(path: string): boolean {
    if ([
      '/animetheque',
      '/mangatheque',
      '/suivis',
      '/profile',
      '/profil',
      '/parametres-compte',
    ].includes(path)) {
      return true;
    }

    return [
      '/anime-library',
      '/manga-library',
      '/messages',
      '/following',
      '/account',
      '/login',
      '/register',
      '/forgot-password',
      '/reset-password',
      '/confirm-email',
      '/change-validation-email',
      '/register/discord',
      '/auth/discord/callback',
      '/success',
      '/achievements',
      '/notifications',
    ].some((privatePath) => path === privatePath || path.startsWith(`${privatePath}/`));
  }

  private applyMeta(meta: PageMeta, url: string): void {
    const title = this.completeTitle(meta.title);
    const description = meta.description || DEFAULT_DESCRIPTION;
    const image = this.absoluteUrl(meta.image || DEFAULT_IMAGE);
    const canonical = this.absoluteUrl(url.split('?')[0] || '/');

    this.browserTitleBadgeService.setPageTitle(title);
    this.updateTag('name', 'description', description);
    this.updateTag('name', 'robots', meta.noindex ? 'noindex,nofollow' : 'index,follow');
    this.updateTag('property', 'og:title', title);
    this.updateTag('property', 'og:description', description);
    this.updateTag('property', 'og:image', image);
    this.updateTag('property', 'og:type', meta.type || 'website');
    this.updateTag('property', 'og:url', canonical);
    this.updateTag('name', 'twitter:card', 'summary_large_image');
    this.updateTag('name', 'twitter:title', title);
    this.updateTag('name', 'twitter:description', description);
    this.updateTag('name', 'twitter:image', image);
    this.updateCanonical(canonical);
  }

  private completeTitle(title: string): string {
    const cleanTitle = title.trim();
    if (
      !cleanTitle ||
      cleanTitle === APP_NAME ||
      cleanTitle.startsWith(`${APP_NAME} -`) ||
      cleanTitle.endsWith(`- ${APP_NAME}`) ||
      cleanTitle.endsWith(`| ${APP_NAME}`)
    ) {
      return cleanTitle || APP_NAME;
    }

    return `${cleanTitle} - ${APP_NAME}`;
  }

  private updateTag(attribute: 'name' | 'property', key: string, content: string): void {
    this.meta.updateTag({ [attribute]: key, content });
  }

  private updateCanonical(href: string): void {
    let link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }

    link.setAttribute('href', href);
  }

  private absoluteUrl(value: string): string {
    const appUrl = environment.appUrl.replace(/\/+$/, '');
    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    return `${appUrl}${value.startsWith('/') ? value : `/${value}`}`;
  }
}
