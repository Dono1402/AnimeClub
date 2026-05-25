import { AnimethequeEntry } from '../models/animetheque.model';
import { isMovieEntry } from './anime-format.util';

export const ANIME_EPISODE_XP = 20;
export const ANIME_MOVIE_XP = 60;

export interface AnimeLevelRank {
  index: number;
  name: string;
  code: string;
  imageUrl: string;
  levelStart: number;
  levelEnd: number;
}

const HALO_REACH_RANK_NAMES = [
  'Recrue',
  'Soldat',
  'Caporal',
  'Caporal grade 1',
  'Sergent',
  'Sergent grade 1',
  'Sergent grade 2',
  'Adjudant',
  'Adjudant grade 1',
  'Adjudant grade 2',
  'Adjudant grade 3',
  'Capitaine',
  'Capitaine grade 1',
  'Capitaine grade 2',
  'Capitaine grade 3',
  'Major',
  'Lieutenant grade 1',
  'Lieutenant grade 2',
  'Lieutenant grade 3',
  'Lieutenant-colonel',
  'Lieutenant-colonel grade 1',
  'Lieutenant-colonel grade 2',
  'Lieutenant-colonel grade 3',
  'Commandant',
  'Commandant grade 1',
  'Commandant grade 2',
  'Commandant grade 3',
  'Colonel',
  'Colonel grade 1',
  'Colonel grade 2',
  'Colonel grade 3',
  'Brigadier',
  'Brigadier grade 1',
  'Brigadier grade 2',
  'Brigadier grade 3',
  'Général',
  'Général grade 1',
  'Général grade 2',
  'Général grade 3',
  'Général grade 4',
  'Maréchal',
  'Héros',
  'Légende',
  'Mythique',
  'Noble',
  'Éclipse',
  'Nova',
  'Précurseur',
  'Dépositaire',
  'Légataire',
] as const;

const HALO_REACH_RANK_CODES = [
  'REC',
  'PVT',
  'CPL',
  'CPL1',
  'SGT',
  'SGT1',
  'SGT2',
  'WO',
  'WO1',
  'WO2',
  'WO3',
  'CPT',
  'CPT1',
  'CPT2',
  'CPT3',
  'MAJ',
  'MAJ1',
  'MAJ2',
  'MAJ3',
  'LTC',
  'LTC1',
  'LTC2',
  'LTC3',
  'CMD',
  'CMD1',
  'CMD2',
  'CMD3',
  'COL',
  'COL1',
  'COL2',
  'COL3',
  'BRG',
  'BRG1',
  'BRG2',
  'BRG3',
  'GEN',
  'GEN1',
  'GEN2',
  'GEN3',
  'GEN4',
  'FM',
  'HER',
  'LEG',
  'MYT',
  'NOB',
  'ECL',
  'NOV',
  'FOR',
  'RCL',
  'INH',
] as const;

const HALO_REACH_RANK_ICON_BASE = 'assets/ranks/halo-reach/';

const HALO_REACH_RANK_ICON_FILES = [
  'HR_Rank_Recruit_Icon.png',
  'HR_Rank_Private_Icon.png',
  'HR_Rank_Corporal_Icon.png',
  'HR_Rank_Corporal_G1_Icon.png',
  'HR_Rank_Sergeant_Icon.png',
  'HR_Rank_Sergeant_G1_Icon.png',
  'HR_Rank_Sergeant_G2_Icon.png',
  'HR_Rank_Warrant_Officer_Icon.png',
  'HR_Rank_Warrant_Officer_G1_Icon.png',
  'HR_Rank_Warrant_Officer_G2_Icon.png',
  'HR_Rank_Warrant_Officer_G3_Icon.png',
  'HR_Rank_Captain_Icon.png',
  'HR_Rank_Captain_G1_Icon.png',
  'HR_Rank_Captain_G2_Icon.png',
  'HR_Rank_Captain_G3_Icon.png',
  'HR_Rank_Major_Icon.png',
  'HR_Rank_Major_G1_Icon.png',
  'HR_Rank_Major_G2_Icon.png',
  'HR_Rank_Major_G3_Icon.png',
  'HR_Rank_Lieutenant_Colonel_Icon.png',
  'HR_Rank_Lieutenant_Colonel_G1_Icon.png',
  'HR_Rank_Lieutenant_Colonel_G2_Icon.png',
  'HR_Rank_Lieutenant_Colonel_G3_Icon.png',
  'HR_Rank_Commander_Icon.png',
  'HR_Rank_Commander_G1_Icon.png',
  'HR_Rank_Commander_G2_Icon.png',
  'HR_Rank_Commander_G3_Icon.png',
  'HR_Rank_Colonel_Icon.png',
  'HR_Rank_Colonel_G1_Icon.png',
  'HR_Rank_Colonel_G2_Icon.png',
  'HR_Rank_Colonel_G3_Icon.png',
  'HR_Rank_Brigadier_Icon.png',
  'HR_Rank_Brigadier_G1_Icon.png',
  'HR_Rank_Brigadier_G2_Icon.png',
  'HR_Rank_Brigadier_G3_Icon.png',
  'HR_Rank_General_Icon.png',
  'HR_Rank_General_G1_Icon.png',
  'HR_Rank_General_G2_Icon.png',
  'HR_Rank_General_G3_Icon.png',
  'HR_Rank_General_G4_Icon.png',
  'HR_Rank_Field_Marshall_Icon.png',
  'HR_Rank_Hero_Icon.png',
  'HR_Rank_Legend_Icon.png',
  'HR_Rank_Mythic_Icon.png',
  'HR_Rank_Noble_Icon.png',
  'HR_Rank_Eclipse_Icon.png',
  'HR_Rank_Nova_Icon.png',
  'HR_Rank_Forerunner_Icon.png',
  'HR_Rank_Reclaimer_Icon.png',
  'HR_Rank_Inheritor_Icon.png',
] as const;

const HALO_REACH_MAX_LEVEL = HALO_REACH_RANK_NAMES.length * 3;

export const HALO_REACH_RANKS: AnimeLevelRank[] = HALO_REACH_RANK_NAMES.map((name, index) => {
  const isLastRank = index === HALO_REACH_RANK_NAMES.length - 1;
  const isBeforeLastRank = index === HALO_REACH_RANK_NAMES.length - 2;

  return {
    index,
    name,
    code: HALO_REACH_RANK_CODES[index],
    imageUrl: `${HALO_REACH_RANK_ICON_BASE}${HALO_REACH_RANK_ICON_FILES[index]}`,
    levelStart: isLastRank ? HALO_REACH_MAX_LEVEL : index * 3 + 1,
    levelEnd: isLastRank ? HALO_REACH_MAX_LEVEL : isBeforeLastRank ? HALO_REACH_MAX_LEVEL - 1 : index * 3 + 3,
  };
});

export const ANIME_LEVEL_COUNT = HALO_REACH_MAX_LEVEL;

export type AnimeAchievementCategory = 'watch' | 'completion' | 'collection' | 'level';

export interface AnimeAchievementDefinition {
  id: string;
  title: string;
  description: string;
  category: AnimeAchievementCategory;
  metric: keyof AnimeAchievementMetrics;
  target: number;
  icon: string;
  iconUrl?: string;
}

export interface AnimeAchievementProgress extends AnimeAchievementDefinition {
  current: number;
  percent: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface AnimeAchievementMetrics {
  episodesWatched: number;
  moviesWatched: number;
  completedCount: number;
  favoriteCount: number;
  seasonCount: number;
  level: number;
}

export interface AnimeLevelProgress {
  totalXp: number;
  level: number;
  levelTitle: string;
  levelTier: string;
  rankIndex: number;
  rankCode: string;
  rankImageUrl: string;
  rankLevelStart: number;
  rankLevelEnd: number;
  currentLevelXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
  isMaxLevel: boolean;
}

export interface AnimeAchievementSummary extends AnimeLevelProgress, AnimeAchievementMetrics {
  achievements: AnimeAchievementProgress[];
  unlockedAchievements: AnimeAchievementProgress[];
  lockedAchievements: AnimeAchievementProgress[];
  nextAchievements: AnimeAchievementProgress[];
}

export const ANIME_ACHIEVEMENTS: AnimeAchievementDefinition[] = [
  {
    id: 'first-episode',
    title: 'Premier episode',
    description: 'Marquer ton premier episode anime comme vu.',
    category: 'watch',
    metric: 'episodesWatched',
    target: 1,
    icon: '01',
  },
  {
    id: 'ten-episodes',
    title: 'Debut de marathon',
    description: 'Atteindre 10 episodes vus.',
    category: 'watch',
    metric: 'episodesWatched',
    target: 10,
    icon: '10',
  },
  {
    id: 'fifty-episodes',
    title: 'Regard solide',
    description: 'Atteindre 50 episodes vus.',
    category: 'watch',
    metric: 'episodesWatched',
    target: 50,
    icon: '50',
  },
  {
    id: 'hundred-episodes',
    title: 'Habitude installee',
    description: 'Atteindre 100 episodes vus.',
    category: 'watch',
    metric: 'episodesWatched',
    target: 100,
    icon: '100',
  },
  {
    id: 'two-fifty-episodes',
    title: 'Gros watcher',
    description: 'Atteindre 250 episodes vus.',
    category: 'watch',
    metric: 'episodesWatched',
    target: 250,
    icon: '250',
  },
  {
    id: 'five-hundred-episodes',
    title: 'Veteran anime',
    description: 'Atteindre 500 episodes vus.',
    category: 'watch',
    metric: 'episodesWatched',
    target: 500,
    icon: '500',
  },
  {
    id: 'thousand-episodes',
    title: 'Archive vivante',
    description: 'Atteindre 1000 episodes vus.',
    category: 'watch',
    metric: 'episodesWatched',
    target: 1000,
    icon: '1K',
  },
  {
    id: 'first-movie',
    title: 'Seance anime',
    description: 'Terminer ton premier film anime.',
    category: 'watch',
    metric: 'moviesWatched',
    target: 1,
    icon: 'F1',
  },
  {
    id: 'five-movies',
    title: 'Cycle cinema',
    description: 'Terminer 5 films anime.',
    category: 'watch',
    metric: 'moviesWatched',
    target: 5,
    icon: 'F5',
  },
  {
    id: 'ten-movies',
    title: 'Collection cinema',
    description: 'Terminer 10 films anime.',
    category: 'watch',
    metric: 'moviesWatched',
    target: 10,
    icon: 'F10',
  },
  {
    id: 'first-completion',
    title: 'Premier termine',
    description: 'Terminer un anime, une saison ou un film.',
    category: 'completion',
    metric: 'completedCount',
    target: 1,
    icon: 'C1',
  },
  {
    id: 'five-completions',
    title: 'Liste qui avance',
    description: 'Terminer 5 entrees anime.',
    category: 'completion',
    metric: 'completedCount',
    target: 5,
    icon: 'C5',
  },
  {
    id: 'ten-completions',
    title: 'Finisher',
    description: 'Terminer 10 entrees anime.',
    category: 'completion',
    metric: 'completedCount',
    target: 10,
    icon: 'C10',
  },
  {
    id: 'twenty-five-completions',
    title: 'Chasseur de fins',
    description: 'Terminer 25 entrees anime.',
    category: 'completion',
    metric: 'completedCount',
    target: 25,
    icon: 'C25',
  },
  {
    id: 'first-season',
    title: 'Saison separee',
    description: 'Suivre au moins une saison separement.',
    category: 'collection',
    metric: 'seasonCount',
    target: 1,
    icon: 'S1',
  },
  {
    id: 'five-seasons',
    title: 'Archiviste de saisons',
    description: 'Suivre 5 saisons separement.',
    category: 'collection',
    metric: 'seasonCount',
    target: 5,
    icon: 'S5',
  },
  {
    id: 'ten-seasons',
    title: 'Chronologie propre',
    description: 'Suivre 10 saisons separement.',
    category: 'collection',
    metric: 'seasonCount',
    target: 10,
    icon: 'S10',
  },
  {
    id: 'first-favorite',
    title: 'Favori choisi',
    description: 'Ajouter un anime dans tes favoris.',
    category: 'collection',
    metric: 'favoriteCount',
    target: 1,
    icon: 'V1',
  },
  {
    id: 'five-favorites',
    title: 'Vitrine perso',
    description: 'Avoir 5 favoris anime.',
    category: 'collection',
    metric: 'favoriteCount',
    target: 5,
    icon: 'V5',
  },
  ...HALO_REACH_RANKS.map((rank): AnimeAchievementDefinition => ({
    id: `rank-${rank.index + 1}`,
    title: rank.name,
    description: `Atteindre le niveau ${rank.levelStart} pour obtenir ce rang.`,
    category: 'level',
    metric: 'level',
    target: rank.levelStart,
    icon: rank.code,
    iconUrl: rank.imageUrl,
  })),
];

export function buildAnimeAchievementSummary(entries: AnimethequeEntry[]): AnimeAchievementSummary {
  const episodesWatched = entries.reduce((total, entry) => total + watchedEpisodesForXp(entry), 0);
  const moviesWatched = entries.filter((entry) => isMovieEntry(entry) && isMovieWatched(entry)).length;
  const completedCount = entries.filter((entry) => entry.status === 'COMPLETED').length;
  const favoriteCount = entries.filter((entry) => entry.favorite).length;
  const seasonCount = entries.filter((entry) => entry.trackingMode === 'SEASON').length;
  const totalXp = episodesWatched * ANIME_EPISODE_XP + moviesWatched * ANIME_MOVIE_XP;
  const levelProgress = buildAnimeLevelProgress(totalXp);
  const metrics: AnimeAchievementMetrics = {
    episodesWatched,
    moviesWatched,
    completedCount,
    favoriteCount,
    seasonCount,
    level: levelProgress.level,
  };
  const achievements = ANIME_ACHIEVEMENTS.map((achievement) => {
    const current = metrics[achievement.metric];
    const percent = achievement.target > 0 ? Math.min(100, Math.floor((current / achievement.target) * 100)) : 100;
    const unlocked = current >= achievement.target;

    return {
      ...achievement,
      current,
      percent,
      unlocked,
      unlockedAt: unlocked ? estimateAchievementUnlockedAt(entries, achievement.metric, achievement.target) : null,
    };
  });
  const unlockedAchievements = achievements.filter((achievement) => achievement.unlocked);
  const lockedAchievements = achievements.filter((achievement) => !achievement.unlocked);
  const nextAchievements = [...lockedAchievements]
    .sort((left, right) => right.percent - left.percent || left.target - right.target)
    .slice(0, 3);

  return {
    ...levelProgress,
    ...metrics,
    achievements,
    unlockedAchievements,
    lockedAchievements,
    nextAchievements,
  };
}

export function buildAnimeLevelProgress(totalXp: number): AnimeLevelProgress {
  const cleanXp = Math.max(0, Math.floor(totalXp));
  let level = 1;

  for (let nextLevel = 2; nextLevel <= ANIME_LEVEL_COUNT; nextLevel += 1) {
    if (cleanXp < animeLevelRequiredXp(nextLevel)) {
      break;
    }

    level = nextLevel;
  }

  const currentLevelXp = animeLevelRequiredXp(level);
  const isMaxLevel = level >= ANIME_LEVEL_COUNT;
  const nextLevelXp = isMaxLevel ? currentLevelXp : animeLevelRequiredXp(level + 1);
  const xpForNextLevel = Math.max(0, nextLevelXp - currentLevelXp);
  const xpIntoLevel = isMaxLevel ? xpForNextLevel : Math.max(0, cleanXp - currentLevelXp);
  const progressPercent = isMaxLevel || xpForNextLevel === 0
    ? 100
    : Math.min(100, Math.floor((xpIntoLevel / xpForNextLevel) * 100));
  const rank = animeLevelRank(level);

  return {
    totalXp: cleanXp,
    level,
    levelTitle: rank.name,
    levelTier: `Rang ${rank.index + 1}/${HALO_REACH_RANKS.length}`,
    rankIndex: rank.index,
    rankCode: rank.code,
    rankImageUrl: rank.imageUrl,
    rankLevelStart: rank.levelStart,
    rankLevelEnd: rank.levelEnd,
    currentLevelXp,
    nextLevelXp,
    xpIntoLevel,
    xpForNextLevel,
    progressPercent,
    isMaxLevel,
  };
}

export function animeLevelRequiredXp(level: number): number {
  const cleanLevel = Math.min(ANIME_LEVEL_COUNT, Math.max(1, Math.floor(level)));
  if (cleanLevel <= 1) {
    return 0;
  }

  const step = cleanLevel - 1;
  return Math.round(step * 100 + Math.pow(step, 1.4) * 45);
}

export function animeLevelHue(level: number): number {
  const rank = animeLevelRank(level);
  return Math.round((rank.index / (HALO_REACH_RANKS.length - 1)) * 320 + 28);
}

export function animeLevelNextHue(level: number): number {
  return (animeLevelHue(level) + 42) % 360;
}

export function animeLevelRank(level: number): AnimeLevelRank {
  const cleanLevel = Math.min(ANIME_LEVEL_COUNT, Math.max(1, Math.floor(level)));
  return HALO_REACH_RANKS.find((rank) => cleanLevel >= rank.levelStart && cleanLevel <= rank.levelEnd)
    ?? HALO_REACH_RANKS[HALO_REACH_RANKS.length - 1];
}

function watchedEpisodesForXp(entry: AnimethequeEntry): number {
  if (isMovieEntry(entry)) {
    return 0;
  }

  const totalEpisodes = Math.max(0, Number(entry.totalEpisodes || 0));
  const watchedEpisodes = Math.max(0, Number(entry.watchedEpisodes || 0));

  if (entry.status === 'COMPLETED' && totalEpisodes > 0) {
    return totalEpisodes;
  }

  return totalEpisodes > 0 ? Math.min(watchedEpisodes, totalEpisodes) : watchedEpisodes;
}

function isMovieWatched(entry: AnimethequeEntry): boolean {
  return entry.status === 'COMPLETED' || Number(entry.watchedEpisodes || 0) > 0;
}

function estimateAchievementUnlockedAt(
  entries: AnimethequeEntry[],
  metric: keyof AnimeAchievementMetrics,
  target: number,
): string | null {
  if (target <= 0) {
    return null;
  }

  switch (metric) {
    case 'episodesWatched':
      return dateWhenCumulativeReaches(
        entries.filter((entry) => !isMovieEntry(entry)),
        target,
        watchedEpisodesForXp,
      );
    case 'moviesWatched':
      return dateWhenCumulativeReaches(
        entries.filter((entry) => isMovieEntry(entry) && isMovieWatched(entry)),
        target,
        () => 1,
      );
    case 'completedCount':
      return dateWhenCumulativeReaches(
        entries.filter((entry) => entry.status === 'COMPLETED'),
        target,
        () => 1,
      );
    case 'favoriteCount':
      return dateWhenCumulativeReaches(
        entries.filter((entry) => entry.favorite),
        target,
        () => 1,
      );
    case 'seasonCount':
      return dateWhenCumulativeReaches(
        entries.filter((entry) => entry.trackingMode === 'SEASON'),
        target,
        () => 1,
      );
    case 'level':
      return dateWhenCumulativeReaches(
        entries,
        animeLevelRequiredXp(target),
        (entry) => watchedEpisodesForXp(entry) * ANIME_EPISODE_XP + (isMovieEntry(entry) && isMovieWatched(entry) ? ANIME_MOVIE_XP : 0),
      );
  }
}

function dateWhenCumulativeReaches(
  entries: AnimethequeEntry[],
  target: number,
  valueForEntry: (entry: AnimethequeEntry) => number,
): string | null {
  let total = 0;

  for (const entry of entriesSortedByUpdate(entries)) {
    total += Math.max(0, Number(valueForEntry(entry) || 0));
    if (total >= target) {
      return validUpdatedAt(entry);
    }
  }

  return null;
}

function entriesSortedByUpdate(entries: AnimethequeEntry[]): AnimethequeEntry[] {
  return [...entries].sort((left, right) => entryUpdatedAtValue(left) - entryUpdatedAtValue(right) || left.id - right.id);
}

function entryUpdatedAtValue(entry: AnimethequeEntry): number {
  const time = new Date(entry.updatedAt).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function validUpdatedAt(entry: AnimethequeEntry): string | null {
  return Number.isFinite(new Date(entry.updatedAt).getTime()) ? entry.updatedAt : null;
}
