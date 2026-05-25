import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

import { AnimethequeEntry } from '../models/animetheque.model';
import {
  AnimeAchievementProgress,
  buildAnimeAchievementSummary,
} from '../utils/anime-achievements.util';

@Injectable({ providedIn: 'root' })
export class AchievementNotificationService {
  private readonly unlockSubject = new Subject<AnimeAchievementProgress[]>();
  private achievementAudioContext: AudioContext | null = null;
  private soundPrepared = false;

  readonly unlocks$ = this.unlockSubject.asObservable();

  notifyUnlockedFromEntries(previousEntries: AnimethequeEntry[], nextEntries: AnimethequeEntry[]): void {
    const previousUnlockedIds = new Set(
      buildAnimeAchievementSummary(previousEntries).unlockedAchievements.map((achievement) => achievement.id),
    );
    const newAchievements = buildAnimeAchievementSummary(nextEntries)
      .unlockedAchievements
      .filter((achievement) => !previousUnlockedIds.has(achievement.id))
      .sort((left, right) => left.target - right.target || left.title.localeCompare(right.title, 'fr'));

    if (newAchievements.length === 0) {
      return;
    }

    this.unlockSubject.next(newAchievements);
    this.playAchievementSound();
  }

  prepareAchievementSound(): void {
    if (this.soundPrepared || typeof window === 'undefined') {
      return;
    }

    this.soundPrepared = true;
    const unlockSound = () => {
      const context = this.ensureAchievementAudioContext();
      if (context) {
        void context.resume().catch(() => undefined);
      }

      window.removeEventListener('pointerdown', unlockSound);
      window.removeEventListener('keydown', unlockSound);
    };

    window.addEventListener('pointerdown', unlockSound, { once: true, passive: true });
    window.addEventListener('keydown', unlockSound, { once: true });
  }

  private playAchievementSound(): void {
    const context = this.ensureAchievementAudioContext();
    if (!context) {
      return;
    }

    const play = () => {
      const now = context.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];

      notes.forEach((frequency, index) => {
        const start = now + index * 0.14;
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = index % 2 === 0 ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.18, start + 0.3);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.058, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.58);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.62);
      });

      const shimmerStart = now + 0.48;
      const shimmer = context.createOscillator();
      const shimmerGain = context.createGain();
      shimmer.type = 'sine';
      shimmer.frequency.setValueAtTime(1567.98, shimmerStart);
      shimmer.frequency.exponentialRampToValueAtTime(1975.53, shimmerStart + 0.34);
      shimmerGain.gain.setValueAtTime(0.0001, shimmerStart);
      shimmerGain.gain.exponentialRampToValueAtTime(0.036, shimmerStart + 0.02);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, shimmerStart + 0.56);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(context.destination);
      shimmer.start(shimmerStart);
      shimmer.stop(shimmerStart + 0.6);
    };

    if (context.state === 'suspended') {
      void context.resume().then(play).catch(() => undefined);
      return;
    }

    play();
  }

  private ensureAchievementAudioContext(): AudioContext | null {
    if (this.achievementAudioContext) {
      return this.achievementAudioContext;
    }

    const AudioContextConstructor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      return null;
    }

    this.achievementAudioContext = new AudioContextConstructor();
    return this.achievementAudioContext;
  }
}
