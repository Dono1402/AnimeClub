import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export type MarketingEventName =
  | 'page_view'
  | 'sign_up_start'
  | 'sign_up_complete'
  | 'login'
  | 'anime_view'
  | 'anime_search'
  | 'anime_add_to_library'
  | 'anime_progress_update'
  | 'anime_mark_completed'
  | 'profile_view'
  | 'profile_follow'
  | 'message_sent'
  | 'discord_landing_visit'
  | 'discord_cta_click'
  | 'ad_landing_visit';

export type MarketingEventProperties = Record<string, string | number | boolean | null | undefined>;

interface StoredAttribution {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  referrer?: string;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const ATTRIBUTION_STORAGE_KEY = 'animeclub.marketing.attribution';
const GA_SCRIPT_ID = 'animeclub-ga4';

@Injectable({ providedIn: 'root' })
export class MarketingAnalyticsService {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private started = false;
  private gaInitialized = false;
  private attribution: StoredAttribution = {};
  private readonly landingVisitsTracked = new Set<string>();

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.captureAttribution();
    this.initializeGa4();
    this.trackPageView(this.router.url);

    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      this.captureAttribution();
      this.trackPageView(event.urlAfterRedirects);
    });
  }

  grantConsent(): void {
    if (!this.canUseBrowser() || !window.gtag) {
      return;
    }

    window.gtag('consent', 'update', {
      ad_storage: 'granted',
      analytics_storage: 'granted',
    });
  }

  currentSourceIs(source: string): boolean {
    return this.attribution.source?.toLowerCase() === source.toLowerCase();
  }

  trackEvent(name: MarketingEventName, properties: MarketingEventProperties = {}): void {
    const payload = this.cleanProperties({
      ...this.standardProperties(),
      ...properties,
    });

    if (!this.gaReady()) {
      return;
    }

    window.gtag?.('event', name, payload);
  }

  private trackPageView(url: string): void {
    this.trackEvent('page_view', {
      route: this.routePath(url),
      page_location: this.absoluteUrl(url),
      page_title: this.safeDocumentTitle(),
    });
    this.trackLandingVisit(url);
  }

  private trackLandingVisit(url: string): void {
    const route = this.routePath(url);
    if (route !== '/' && route !== '/landing') {
      return;
    }

    const source = this.attribution.source?.toLowerCase();
    const medium = this.attribution.medium?.toLowerCase();
    const campaign = this.attribution.campaign ?? '';
    const key = `${route}:${source ?? ''}:${medium ?? ''}:${campaign}`;
    if (this.landingVisitsTracked.has(key)) {
      return;
    }

    this.landingVisitsTracked.add(key);
    if (source === 'discord') {
      this.trackEvent('discord_landing_visit', { route });
    }

    if (medium === 'cpc' || source === 'google') {
      this.trackEvent('ad_landing_visit', { route });
    }
  }

  private initializeGa4(): void {
    if (this.gaInitialized || !this.canUseBrowser() || !this.gaConfigured()) {
      return;
    }

    this.gaInitialized = true;
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = window.gtag ?? ((...args: unknown[]) => {
      window.dataLayer?.push(args);
    });

    if (environment.consentRequired) {
      window.gtag('consent', 'default', {
        ad_storage: 'denied',
        analytics_storage: 'denied',
      });
    }

    window.gtag('js', new Date());
    window.gtag('config', environment.ga4MeasurementId, {
      send_page_view: false,
    });

    if (!document.getElementById(GA_SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = GA_SCRIPT_ID;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(environment.ga4MeasurementId)}`;
      document.head.appendChild(script);
    }
  }

  private captureAttribution(): void {
    if (!this.canUseBrowser()) {
      return;
    }

    const stored = this.readAttribution();
    const current = this.attributionFromCurrentUrl();
    this.attribution = {
      ...stored,
      ...current,
      referrer: current.referrer ?? stored.referrer ?? document.referrer ?? undefined,
    };
    this.writeAttribution(this.attribution);
  }

  private attributionFromCurrentUrl(): StoredAttribution {
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const source = params.get('utm_source') ?? undefined;
    const medium = params.get('utm_medium') ?? undefined;
    const campaign = params.get('utm_campaign') ?? undefined;
    const content = params.get('utm_content') ?? undefined;
    const term = params.get('utm_term') ?? undefined;

    if (!source && !medium && !campaign && !content && !term) {
      return {};
    }

    return {
      source,
      medium,
      campaign,
      content,
      term,
      referrer: document.referrer || undefined,
    };
  }

  private readAttribution(): StoredAttribution {
    try {
      const raw = sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredAttribution) : {};
    } catch {
      return {};
    }
  }

  private writeAttribution(attribution: StoredAttribution): void {
    try {
      sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
    } catch {
      // Storage can be unavailable in private browsing; tracking still works for the current page.
    }
  }

  private standardProperties(): MarketingEventProperties {
    return {
      source: this.attribution.source,
      medium: this.attribution.medium,
      campaign: this.attribution.campaign,
      content: this.attribution.content,
      term: this.attribution.term,
      route: this.routePath(this.router.url),
      referrer: this.attribution.referrer,
      user_logged_in: this.authService.isLoggedIn(),
    };
  }

  private routePath(url: string): string {
    const normalizedUrl = url || '/';
    return normalizedUrl.split('?')[0].split('#')[0] || '/';
  }

  private absoluteUrl(url: string): string {
    if (!this.canUseBrowser()) {
      return `${environment.appUrl.replace(/\/+$/, '')}${this.routePath(url)}`;
    }

    return new URL(url || '/', window.location.origin).toString();
  }

  private safeDocumentTitle(): string {
    return this.canUseBrowser() ? document.title : 'AnimeClub';
  }

  private cleanProperties(properties: MarketingEventProperties): Record<string, string | number | boolean> {
    return Object.entries(properties).reduce<Record<string, string | number | boolean>>((cleaned, [key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        cleaned[key] = value;
      }

      return cleaned;
    }, {});
  }

  private gaReady(): boolean {
    return this.canUseBrowser() && this.gaConfigured() && Boolean(window.gtag);
  }

  private gaConfigured(): boolean {
    return Boolean(environment.analyticsEnabled && environment.ga4MeasurementId.trim());
  }

  private canUseBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }
}
