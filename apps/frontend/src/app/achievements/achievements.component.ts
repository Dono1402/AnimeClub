import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { AnimethequeEntry } from '../models/animetheque.model';
import { PublicProfile } from '../models/public-profile.model';
import { AnimethequeService } from '../services/animetheque.service';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import {
  AnimeAchievementCategory,
  AnimeAchievementProgress,
  animeLevelHue,
  animeLevelNextHue,
  buildAnimeAchievementSummary,
} from '../utils/anime-achievements.util';

interface AchievementGroup {
  category: AnimeAchievementCategory;
  title: string;
  unlockedCount: number;
  achievements: AnimeAchievementProgress[];
}

@Component({
  selector: 'app-achievements',
  standalone: true,
  imports: [DecimalPipe, RouterLink, MatButtonModule, MenuBarComponent],
  templateUrl: './achievements.component.html',
  styleUrl: './achievements.component.scss',
})
export class AchievementsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly animethequeService = inject(AnimethequeService);

  readonly account = this.authService.currentAccount();
  readonly profile = signal<PublicProfile | null>(null);
  readonly entries = signal<AnimethequeEntry[]>([]);
  readonly loading = signal(true);
  readonly feedback = signal('');
  readonly publicMode = computed(() => Boolean(this.profile()));
  readonly displayName = computed(() => this.profile()?.displayName || this.profile()?.pseudo || 'membre');
  readonly pageTitle = computed(() => this.publicMode() ? `Badges de ${this.displayName()}` : 'Mes badges');
  readonly backRoute = computed(() => {
    const profile = this.profile();
    return profile ? ['/profile', profile.pseudo] : ['/profile'];
  });
  readonly libraryRoute = computed(() => {
    const profile = this.profile();
    return profile ? ['/profile', profile.pseudo, 'anime-library'] : ['/anime-library'];
  });
  readonly summary = computed(() => buildAnimeAchievementSummary(this.entries()));
  readonly levelHue = computed(() => animeLevelHue(this.summary().level));
  readonly levelNextHue = computed(() => animeLevelNextHue(this.summary().level));
  readonly unlockedCount = computed(() => this.summary().unlockedAchievements.length);
  readonly achievementCount = computed(() => this.summary().achievements.length);
  readonly achievementPercent = computed(() =>
    this.achievementCount() > 0 ? Math.floor((this.unlockedCount() / this.achievementCount()) * 100) : 0,
  );
  readonly groups = computed<AchievementGroup[]>(() => [
    {
      category: 'watch',
      title: 'Visionnage',
      achievements: this.achievementsByCategory('watch'),
      unlockedCount: this.unlockedByCategory('watch'),
    },
    {
      category: 'completion',
      title: 'Terminés',
      achievements: this.achievementsByCategory('completion'),
      unlockedCount: this.unlockedByCategory('completion'),
    },
    {
      category: 'collection',
      title: 'Collection',
      achievements: this.achievementsByCategory('collection'),
      unlockedCount: this.unlockedByCategory('collection'),
    },
    {
      category: 'level',
      title: 'Niveaux',
      achievements: this.achievementsByCategory('level'),
      unlockedCount: this.unlockedByCategory('level'),
    },
  ]);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const pseudo = params.get('pseudo')?.trim();
      if (pseudo) {
        this.loadPublicProfile(pseudo);
        return;
      }

      this.loadOwnAchievements();
    });
  }

  progressLabel(): string {
    const summary = this.summary();
    if (summary.isMaxLevel) {
      return 'Niveau maximum atteint';
    }

    return `${summary.xpIntoLevel}/${summary.xpForNextLevel} XP vers le niveau ${summary.level + 1}`;
  }

  private loadOwnAchievements(): void {
    this.profile.set(null);
    this.entries.set([]);
    this.feedback.set('');

    if (!this.account) {
      this.loading.set(false);
      this.feedback.set('Connecte-toi pour voir tes badges.');
      return;
    }

    this.loading.set(true);
    this.animethequeService.list(this.account.id).subscribe({
      next: (entries) => {
        this.entries.set(entries);
        this.loading.set(false);
      },
      error: () => {
        this.feedback.set('Impossible de charger tes badges pour le moment.');
        this.loading.set(false);
      },
    });
  }

  private loadPublicProfile(pseudo: string): void {
    this.loading.set(true);
    this.profile.set(null);
    this.entries.set([]);
    this.feedback.set('');

    this.profileService.getPublicProfile(pseudo).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.loadPublicAchievements(profile.id);
      },
      error: () => {
        this.feedback.set('Profil introuvable.');
        this.loading.set(false);
      },
    });
  }

  private loadPublicAchievements(accountId: number): void {
    this.animethequeService.publicList(accountId).subscribe({
      next: (entries) => {
        this.entries.set(entries);
        this.loading.set(false);
      },
      error: () => {
        this.feedback.set('Impossible de charger les badges de ce profil.');
        this.loading.set(false);
      },
    });
  }

  private achievementsByCategory(category: AnimeAchievementCategory): AnimeAchievementProgress[] {
    return this.summary().achievements.filter((achievement) => achievement.category === category);
  }

  private unlockedByCategory(category: AnimeAchievementCategory): number {
    return this.summary().achievements.filter((achievement) => achievement.category === category && achievement.unlocked).length;
  }
}
