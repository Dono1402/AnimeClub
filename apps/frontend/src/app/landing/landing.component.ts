import { AfterViewInit, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MarketingAnalyticsService } from '../services/marketing-analytics.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements AfterViewInit {
  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLElement>;

  private readonly analytics = inject(MarketingAnalyticsService);
  private wheelLocked = false;

  readonly sectionLabels = ['Animethèque', 'Communauté', 'Profil'];
  readonly activeSection = signal(0);

  ngAfterViewInit(): void {
    const index = ['hero', 'community', 'profile'].indexOf(window.location.hash.slice(1));
    if (index > 0) {
      window.setTimeout(() => this.scrollToIndex(index));
    }
  }

  onLandingScroll(): void {
    const container = this.scrollContainer?.nativeElement;
    if (!container) {
      return;
    }

    const index = Math.round(container.scrollLeft / Math.max(1, container.clientWidth));
    this.activeSection.set(Math.min(this.sectionLabels.length - 1, Math.max(0, index)));
  }

  onLandingWheel(event: WheelEvent): void {
    if (event.ctrlKey) {
      return;
    }

    const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const delta = horizontalIntent ? event.deltaX : event.deltaY;

    if (Math.abs(delta) < 12 || this.wheelLocked) {
      return;
    }

    event.preventDefault();

    const direction = delta > 0 ? 1 : -1;
    const targetIndex = Math.min(
      this.sectionLabels.length - 1,
      Math.max(0, this.activeSection() + direction),
    );

    if (targetIndex === this.activeSection()) {
      return;
    }

    this.wheelLocked = true;
    this.scrollToIndex(targetIndex);
    window.setTimeout(() => {
      this.wheelLocked = false;
    }, 760);
  }

  scrollNext(event?: Event): void {
    event?.preventDefault();
    const nextIndex = (this.activeSection() + 1) % this.sectionLabels.length;
    this.scrollToIndex(nextIndex);
  }

  scrollToSection(event: Event, index: number): void {
    event.preventDefault();
    this.scrollToIndex(index);
  }

  trackLandingCta(target: string, cta: string): void {
    if (!this.analytics.currentSourceIs('discord')) {
      return;
    }

    this.analytics.trackEvent('discord_cta_click', {
      route: '/landing',
      target,
      cta,
    });
  }

  private scrollToIndex(index: number): void {
    const container = this.scrollContainer?.nativeElement;
    if (!container) {
      return;
    }

    container.scrollTo({
      left: index * container.clientWidth,
      behavior: 'smooth',
    });
    this.activeSection.set(index);
  }
}
