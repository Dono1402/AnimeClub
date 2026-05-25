import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { environment } from '../../environments/environment';

type FrontendTelemetryEvent = {
  type: 'page_view' | 'api' | 'error' | 'web_vital';
  name?: string;
  route?: string;
  path?: string;
  method?: string;
  endpoint?: string;
  status?: number;
  durationMs?: number;
  value?: number;
  source?: string;
  message?: string;
  userAgent?: string;
};

@Injectable({ providedIn: 'root' })
export class FrontendTelemetryService {
  private readonly router = inject(Router);
  private readonly endpoint = `${environment.apiUrl}/telemetry/frontend`;
  private lastRoute = this.normalizePath(location.pathname);
  private clsValue = 0;

  start(): void {
    if (!environment.telemetryEnabled) {
      return;
    }

    this.trackPageViews();
    this.trackErrors();
    this.trackWebVitals();
    this.recordPageView(location.pathname);
  }

  recordApi(method: string, url: string, status: number, durationMs: number): void {
    if (!environment.telemetryEnabled || url.includes('/telemetry/frontend')) {
      return;
    }

    this.send({
      type: 'api',
      method,
      endpoint: this.normalizeApiEndpoint(url),
      status,
      durationMs,
      route: this.lastRoute,
    });
  }

  private trackPageViews(): void {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.recordPageView(event.urlAfterRedirects));
  }

  private recordPageView(url: string): void {
    const path = this.stripQuery(url);
    const route = this.normalizePath(path);
    this.lastRoute = route;
    this.send({
      type: 'page_view',
      route,
      path: route,
    });
  }

  private trackErrors(): void {
    window.addEventListener('error', (event) => {
      this.send({
        type: 'error',
        source: 'window',
        name: event.error?.name || 'Error',
        message: event.message,
        route: this.lastRoute,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason as Error | string | undefined;
      this.send({
        type: 'error',
        source: 'promise',
        name: typeof reason === 'object' && reason?.name ? reason.name : 'UnhandledPromise',
        message: typeof reason === 'string' ? reason : reason?.message,
        route: this.lastRoute,
      });
    });
  }

  private trackWebVitals(): void {
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (navigation) {
        this.recordWebVital('navigation_duration_ms', navigation.duration);
      }
    });

    this.observePerformance('paint', (entry) => {
      if (entry.name === 'first-contentful-paint') {
        this.recordWebVital('fcp_ms', entry.startTime);
      }
    });

    this.observePerformance('largest-contentful-paint', (entry) => {
      this.recordWebVital('lcp_ms', entry.startTime);
    });

    this.observePerformance('layout-shift', (entry) => {
      const layoutShift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
      if (!layoutShift.hadRecentInput) {
        this.clsValue += layoutShift.value ?? 0;
        this.recordWebVital('cls', this.clsValue);
      }
    });
  }

  private observePerformance(type: string, callback: (entry: PerformanceEntry) => void): void {
    if (!('PerformanceObserver' in window)) {
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          callback(entry);
        }
      });
      observer.observe({ type, buffered: true });
    } catch {
      // Certains navigateurs ne supportent pas toutes les entrees de performance.
    }
  }

  private recordWebVital(name: string, value: number): void {
    this.send({
      type: 'web_vital',
      name,
      value,
      route: this.lastRoute,
    });
  }

  private send(event: FrontendTelemetryEvent): void {
    if (!environment.telemetryEnabled) {
      return;
    }

    const payload: FrontendTelemetryEvent = {
      ...event,
      userAgent: navigator.userAgent,
    };
    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(this.endpoint, new Blob([body], { type: 'application/json' }));
      if (sent) {
        return;
      }
    }

    void fetch(this.endpoint, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => undefined);
  }

  private normalizeApiEndpoint(url: string): string {
    const parsedUrl = this.safeUrl(url);
    return this.normalizePath(parsedUrl?.pathname ?? url);
  }

  private normalizePath(path: string): string {
    const cleanedPath = this.stripQuery(path)
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^\/api(?=\/)/, '')
      .replace(/\/account\/public\/[^/]+(?=\/|$)/g, '/account/public/:pseudo')
      .replace(/\/\d+(?=\/|$)/g, '/:id')
      .replace(/\/mal-\d+(?=\/|$)/g, '/:slug')
      .replace(/\/series-[^/]+(?=\/|$)/g, '/:slug')
      .replace(/\/profile\/[^/]+/g, '/profile/:pseudo')
      .replace(/\/u\/[^/]+/g, '/profile/:pseudo')
      .replace(/\/profil\/[^/]+/g, '/profile/:pseudo')
      .replace(/\/animes\/[^/]+/g, '/animes/:slug')
      .replace(/\/manga\/[^/]+/g, '/manga/:slug');

    return cleanedPath || '/';
  }

  private stripQuery(value: string): string {
    return value.split('?')[0]?.split('#')[0] || '/';
  }

  private safeUrl(url: string): URL | null {
    try {
      return new URL(url, location.origin);
    } catch {
      return null;
    }
  }
}
