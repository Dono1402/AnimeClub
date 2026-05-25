import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { FrontendTelemetryService } from './services/frontend-telemetry.service';
import { PresenceService } from './services/presence.service';
import { DomI18nService } from './services/dom-i18n.service';
import { SeoService } from './services/seo.service';
import { MarketingAnalyticsService } from './services/marketing-analytics.service';
import { PresenceOnlineToastsComponent } from './presence-online-toasts/presence-online-toasts.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, PresenceOnlineToastsComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  constructor(
    frontendTelemetryService: FrontendTelemetryService,
    presenceService: PresenceService,
    domI18nService: DomI18nService,
    seoService: SeoService,
    marketingAnalyticsService: MarketingAnalyticsService,
  ) {
    frontendTelemetryService.start();
    presenceService.start();
    domI18nService.start();
    seoService.start();
    marketingAnalyticsService.start();
  }
}
