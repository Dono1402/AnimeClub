import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { DecimalPipe } from "@angular/common";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { combineLatest } from "rxjs";

import { MenuBarComponent } from "../menu-bar/menu-bar.component";
import { AnimethequeEntry, WatchStatus } from "../models/animetheque.model";
import { MangaLibraryEntry } from "../models/manga.model";
import { PublicProfile } from "../models/public-profile.model";
import { AnimethequeService } from "../services/animetheque.service";
import { AuthService } from "../services/auth.service";
import { MangaLibraryService } from "../services/manga-library.service";
import { ProfileService } from "../services/profile.service";
import { SeoService } from "../services/seo.service";
import { isMovieEntry } from "../utils/anime-format.util";

type PublicLibraryMode = "anime" | "manga";
type PublicLibraryStatusFilter = "ALL" | WatchStatus;
type PublicLibrarySortMode =
  | "updated-desc"
  | "title-asc"
  | "score-desc"
  | "progress-desc";
type PublicLibraryStatKind =
  | "anime"
  | "manga"
  | "watching"
  | "reading"
  | "completed"
  | "episodes"
  | "volumes"
  | "score";

interface PublicLibraryStat {
  value: string;
  label: string;
  caption: string;
  kind: PublicLibraryStatKind;
  showOutOfTen?: boolean;
}

const PUBLIC_LIBRARY_PAGE_SIZE = 12;

@Component({
  selector: "app-public-library",
  standalone: true,
  imports: [RouterLink, DecimalPipe, MenuBarComponent],
  templateUrl: "./public-library.component.html",
  styleUrl: "./public-library.component.scss",
})
export class PublicLibraryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly profileService = inject(ProfileService);
  private readonly animethequeService = inject(AnimethequeService);
  private readonly mangaLibraryService = inject(MangaLibraryService);
  private readonly authService = inject(AuthService);
  private readonly seoService = inject(SeoService);

  readonly mode = signal<PublicLibraryMode>("anime");
  readonly account = toSignal(this.authService.account$, {
    initialValue: this.authService.currentAccount(),
  });
  readonly profile = signal<PublicProfile | null>(null);
  readonly animeEntries = signal<AnimethequeEntry[]>([]);
  readonly mangaEntries = signal<MangaLibraryEntry[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal("");
  readonly query = signal("");
  readonly statusFilter = signal<PublicLibraryStatusFilter>("ALL");
  readonly favoritesOnly = signal(false);
  readonly sortMode = signal<PublicLibrarySortMode>("updated-desc");
  readonly visibleCount = signal(PUBLIC_LIBRARY_PAGE_SIZE);

  readonly displayName = computed(
    () => this.profile()?.displayName || this.profile()?.pseudo || "Profil",
  );
  readonly initials = computed(
    () => this.displayName().slice(0, 1).toUpperCase() || "A",
  );
  readonly profilePictureUrl = computed(() =>
    this.profileService.assetUrl(this.profile()?.profilePictureUrl),
  );
  readonly profileBackgroundUrl = computed(() =>
    this.profileService.assetUrl(this.profile()?.backgroundUrl),
  );
  readonly accentColor = computed(
    () => this.profile()?.accentColor || "#ff4f93",
  );
  readonly bannerStyle = computed(() => {
    const backgroundUrl = this.profileBackgroundUrl();
    return backgroundUrl
      ? `linear-gradient(90deg, rgba(5, 8, 12, 0.94), rgba(5, 8, 12, 0.58) 58%, rgba(5, 8, 12, 0.9)), url("${backgroundUrl}")`
      : 'linear-gradient(90deg, rgba(5, 8, 12, 0.94), rgba(5, 8, 12, 0.56) 58%, rgba(5, 8, 12, 0.9)), url("assets/home-hero/call-of-the-night-hero.jpg")';
  });
  readonly titleLabel = computed(() =>
    this.mode() === "anime" ? "Animethèque" : "Mangathèque",
  );
  readonly entryCount = computed(() =>
    this.mode() === "anime"
      ? this.animeEntries().length
      : this.mangaEntries().length,
  );
  readonly isOwnProfile = computed(() =>
    Boolean(this.profile() && this.account()?.id === this.profile()?.id),
  );
  readonly browseRoute = computed(() =>
    this.mode() === "anime" ? "/animes" : "/manga",
  );
  readonly manageRoute = computed(() =>
    this.mode() === "anime" ? "/anime-library" : "/manga-library",
  );
  readonly plannedLabel = computed(() =>
    this.mode() === "anime" ? "À voir" : "À lire",
  );

  readonly filteredAnimeEntries = computed(() =>
    this.filterAndSortEntries(
      this.animeEntries(),
      (entry) => [
        entry.title,
        entry.parentTitle,
        entry.seasonTitle,
        ...(entry.catalogGenres || []),
      ],
      (entry) => this.animeProgressPercent(entry),
    ),
  );
  readonly filteredMangaEntries = computed(() =>
    this.filterAndSortEntries(
      this.mangaEntries(),
      (entry) => [
        entry.title,
        ...(entry.catalogAuthors || []),
        ...(entry.catalogGenres || []),
      ],
      (entry) => this.mangaProgressPercent(entry),
    ),
  );
  readonly visibleAnimeEntries = computed(() =>
    this.filteredAnimeEntries().slice(0, this.visibleCount()),
  );
  readonly visibleMangaEntries = computed(() =>
    this.filteredMangaEntries().slice(0, this.visibleCount()),
  );
  readonly filteredEntryCount = computed(() =>
    this.mode() === "anime"
      ? this.filteredAnimeEntries().length
      : this.filteredMangaEntries().length,
  );
  readonly hasActiveFilters = computed(
    () =>
      Boolean(this.query().trim()) ||
      this.statusFilter() !== "ALL" ||
      this.favoritesOnly(),
  );
  readonly canShowMore = computed(
    () => this.visibleCount() < this.filteredEntryCount(),
  );
  readonly remainingCount = computed(() =>
    Math.max(0, this.filteredEntryCount() - this.visibleCount()),
  );
  readonly nextBatchCount = computed(() =>
    Math.min(PUBLIC_LIBRARY_PAGE_SIZE, this.remainingCount()),
  );
  readonly librarySummary = computed(() => {
    const entries =
      this.mode() === "anime" ? this.animeEntries() : this.mangaEntries();
    return {
      total: entries.length,
      watching: entries.filter((entry) => entry.status === "WATCHING").length,
      completed: entries.filter((entry) => entry.status === "COMPLETED").length,
      favorites: entries.filter((entry) => entry.favorite).length,
    };
  });
  readonly libraryStats = computed<PublicLibraryStat[]>(() => {
    const animeMode = this.mode() === "anime";
    const entries = animeMode ? this.animeEntries() : this.mangaEntries();
    const completedEntries = entries.filter(
      (entry) => entry.status === "COMPLETED",
    );
    const completedScores = completedEntries
      .map((entry) => entry.catalogScore)
      .filter(
        (score): score is number =>
          score !== null &&
          score !== undefined &&
          Number.isFinite(Number(score)),
      )
      .map(Number);
    const averageScore = completedScores.length
      ? completedScores.reduce((total, score) => total + score, 0) /
        completedScores.length
      : null;
    const progressTotal = animeMode
      ? this.animeEntries().reduce(
          (total, entry) =>
            total + Math.max(0, Number(entry.watchedEpisodes || 0)),
          0,
        )
      : this.mangaEntries().reduce(
          (total, entry) => total + Math.max(0, Number(entry.readVolumes || 0)),
          0,
        );

    return [
      {
        value: this.formatNumber(entries.length),
        label: animeMode ? "Animes suivis" : "Mangas suivis",
        caption: "Collection totale",
        kind: animeMode ? "anime" : "manga",
      },
      {
        value: this.formatNumber(
          entries.filter((entry) => entry.status === "WATCHING").length,
        ),
        label: "En cours",
        caption: animeMode ? "En attente" : "Lecture active",
        kind: animeMode ? "watching" : "reading",
      },
      {
        value: this.formatNumber(completedEntries.length),
        label: "Terminés",
        caption: "Complétés",
        kind: "completed",
      },
      {
        value: this.formatNumber(progressTotal),
        label: animeMode ? "Épisodes vus" : "Tomes lus",
        caption: animeMode ? "Temps de visionnage" : "Progression",
        kind: animeMode ? "episodes" : "volumes",
      },
      {
        value: averageScore === null ? "-" : this.formatScore(averageScore),
        label: "Note moyenne",
        caption: completedScores.length
          ? `Sur ${completedScores.length} terminés`
          : "Score catalogue",
        kind: "score",
        showOutOfTen: averageScore !== null,
      },
    ];
  });

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.data]).subscribe(
      ([params, data]) => {
        const pseudo = params.get("pseudo")?.trim();
        const mode = data["libraryMode"] === "manga" ? "manga" : "anime";

        if (!pseudo) {
          this.showNotFound();
          return;
        }

        this.load(pseudo, mode);
      },
    );
  }

  animeRoute(entry: AnimethequeEntry): string[] {
    if (
      entry.trackingMode === "SEASON" &&
      entry.parentAnimeSlug &&
      entry.seasonSlug
    ) {
      return ["/animes", entry.parentAnimeSlug, "seasons", entry.seasonSlug];
    }

    return ["/animes", entry.parentAnimeSlug || entry.animeSlug];
  }

  mangaRoute(entry: MangaLibraryEntry): string[] {
    return entry.mangaSlug ? ["/manga", entry.mangaSlug] : ["/manga"];
  }

  updateQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.resetVisibleCount();
  }

  setStatusFilter(event: Event): void {
    this.statusFilter.set(
      (event.target as HTMLSelectElement).value as PublicLibraryStatusFilter,
    );
    this.resetVisibleCount();
  }

  setSortMode(event: Event): void {
    this.sortMode.set(
      (event.target as HTMLSelectElement).value as PublicLibrarySortMode,
    );
    this.resetVisibleCount();
  }

  setFavoritesOnly(event: Event): void {
    this.favoritesOnly.set((event.target as HTMLInputElement).checked);
    this.resetVisibleCount();
  }

  clearFilters(): void {
    this.query.set("");
    this.statusFilter.set("ALL");
    this.favoritesOnly.set(false);
    this.sortMode.set("updated-desc");
    this.resetVisibleCount();
  }

  showMore(): void {
    this.visibleCount.update((count) => count + PUBLIC_LIBRARY_PAGE_SIZE);
  }

  statusLabel(status: WatchStatus): string {
    switch (status) {
      case "WATCHING":
        return "En cours";
      case "COMPLETED":
        return "Terminé";
      case "PAUSED":
        return "En pause";
      case "DROPPED":
        return "Abandonné";
      case "PLANNED":
      default:
        return this.plannedLabel();
    }
  }

  statusClass(status: WatchStatus): string {
    return `status-${status.toLowerCase()}`;
  }

  animeTypeLabel(entry: AnimethequeEntry): string {
    return this.mediaTypeLabel(
      entry.catalogType || entry.mediaType,
      isMovieEntry(entry) ? "Film" : "Anime",
    );
  }

  mangaTypeLabel(entry: MangaLibraryEntry): string {
    return this.mediaTypeLabel(entry.catalogType, "Manga");
  }

  animeSubtitle(entry: AnimethequeEntry): string {
    if (entry.seasonTitle && entry.seasonTitle !== entry.title) {
      return entry.seasonTitle;
    }

    return entry.parentTitle && entry.parentTitle !== entry.title
      ? entry.parentTitle
      : "";
  }

  mangaSubtitle(entry: MangaLibraryEntry): string {
    return entry.catalogAuthors?.slice(0, 2).join(", ") || "";
  }

  animeScoreLabel(entry: AnimethequeEntry): string {
    return this.scoreLabel(entry.score ?? entry.catalogScore);
  }

  mangaScoreLabel(entry: MangaLibraryEntry): string {
    return this.scoreLabel(entry.score ?? entry.catalogScore);
  }

  animeProgressLabel(entry: AnimethequeEntry): string {
    if (isMovieEntry(entry)) {
      return entry.status === "COMPLETED" || entry.watchedEpisodes > 0
        ? "Film terminé"
        : "Film non terminé";
    }

    const total = entry.totalEpisodes > 0 ? entry.totalEpisodes : "?";
    return `${entry.watchedEpisodes}/${total} épisodes`;
  }

  mangaProgressLabel(entry: MangaLibraryEntry): string {
    const total = entry.totalVolumes > 0 ? entry.totalVolumes : "?";
    return `${entry.readVolumes}/${total} tomes`;
  }

  animeProgressPercent(entry: AnimethequeEntry): number {
    if (isMovieEntry(entry)) {
      return entry.status === "COMPLETED" || entry.watchedEpisodes > 0
        ? 100
        : 0;
    }

    return this.progressPercent(entry.watchedEpisodes, entry.totalEpisodes);
  }

  mangaProgressPercent(entry: MangaLibraryEntry): number {
    return this.progressPercent(entry.readVolumes, entry.totalVolumes);
  }

  updatedAtLabel(value: string | undefined): string {
    if (!value) {
      return "";
    }

    return new Intl.DateTimeFormat("fr-BE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  }

  private load(pseudo: string, mode: PublicLibraryMode): void {
    this.mode.set(mode);
    this.profile.set(null);
    this.animeEntries.set([]);
    this.mangaEntries.set([]);
    this.errorMessage.set("");
    this.loading.set(true);
    this.clearFilters();

    this.profileService.getPublicProfile(pseudo).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.updateSeo(profile, mode);
        this.loadEntries(profile.id, mode);
      },
      error: () => this.showNotFound(),
    });
  }

  private loadEntries(accountId: number, mode: PublicLibraryMode): void {
    const ownProfile = this.account()?.id === accountId;
    const profile = this.profile();

    if (
      !ownProfile &&
      mode === "anime" &&
      profile?.showAnimeLibrary === false
    ) {
      this.errorMessage.set("Cette Animethèque est privée.");
      this.loading.set(false);
      return;
    }

    if (
      !ownProfile &&
      mode === "manga" &&
      profile?.showMangaLibrary === false
    ) {
      this.errorMessage.set("Cette Mangathèque est privée.");
      this.loading.set(false);
      return;
    }

    if (mode === "manga") {
      const request = ownProfile
        ? this.mangaLibraryService.list(accountId)
        : this.mangaLibraryService.publicList(accountId);

      request.subscribe({
        next: (entries) => {
          this.mangaEntries.set(this.sortByUpdate(entries));
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set(
            "Impossible de charger cette liste pour le moment.",
          );
          this.loading.set(false);
        },
      });
      return;
    }

    const request = ownProfile
      ? this.animethequeService.list(accountId)
      : this.animethequeService.publicList(accountId);

    request.subscribe({
      next: (entries) => {
        this.animeEntries.set(this.sortByUpdate(entries));
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set(
          "Impossible de charger cette liste pour le moment.",
        );
        this.loading.set(false);
      },
    });
  }

  private progressPercent(current: number, total: number): number {
    if (total <= 0) {
      return 0;
    }

    return Math.min(100, Math.max(0, (current / total) * 100));
  }

  private filterAndSortEntries<
    T extends {
      title: string;
      status: WatchStatus;
      favorite: boolean;
      score: number | null;
      updatedAt?: string;
      catalogScore?: number | null;
    },
  >(
    entries: T[],
    searchValues: (entry: T) => Array<string | null | undefined>,
    progress: (entry: T) => number,
  ): T[] {
    const normalizedQuery = this.normalizeSearch(this.query());
    const statusFilter = this.statusFilter();
    const favoritesOnly = this.favoritesOnly();

    const filtered = entries.filter((entry) => {
      if (statusFilter !== "ALL" && entry.status !== statusFilter) {
        return false;
      }

      if (favoritesOnly && !entry.favorite) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return searchValues(entry).some((value) =>
        this.normalizeSearch(value || "").includes(normalizedQuery),
      );
    });

    return [...filtered].sort((left, right) => {
      switch (this.sortMode()) {
        case "title-asc":
          return left.title.localeCompare(right.title, "fr", {
            sensitivity: "base",
          });
        case "score-desc": {
          const scoreDifference =
            (right.score ?? right.catalogScore ?? -1) -
            (left.score ?? left.catalogScore ?? -1);
          return (
            scoreDifference ||
            left.title.localeCompare(right.title, "fr", { sensitivity: "base" })
          );
        }
        case "progress-desc": {
          const progressDifference = progress(right) - progress(left);
          return (
            progressDifference ||
            left.title.localeCompare(right.title, "fr", { sensitivity: "base" })
          );
        }
        case "updated-desc":
        default:
          return (
            this.dateValue(right.updatedAt) - this.dateValue(left.updatedAt)
          );
      }
    });
  }

  private normalizeSearch(value: string): string {
    return value
      .trim()
      .toLocaleLowerCase("fr")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private scoreLabel(score: number | null | undefined): string {
    return score == null
      ? ""
      : `${Number(score).toFixed(Number(score) % 1 === 0 ? 0 : 1)}/10`;
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat("fr-BE").format(value);
  }

  private formatScore(value: number): string {
    return value.toLocaleString("fr-BE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  private mediaTypeLabel(
    value: string | null | undefined,
    fallback: string,
  ): string {
    switch ((value || "").trim().toLocaleLowerCase("en")) {
      case "movie":
      case "film":
        return "Film";
      case "special":
        return "Spécial";
      case "music":
        return "Musical";
      case "light novel":
        return "Light novel";
      case "one-shot":
      case "one shot":
        return "One-shot";
      case "tv":
        return "TV";
      case "ova":
        return "OVA";
      case "ona":
        return "ONA";
      case "manga":
        return "Manga";
      case "novel":
        return "Roman";
      case "manhwa":
        return "Manhwa";
      case "manhua":
        return "Manhua";
      default:
        return value?.trim() || fallback;
    }
  }

  private dateValue(value: string | undefined): number {
    if (!value) {
      return 0;
    }

    const date = new Date(value).getTime();
    return Number.isFinite(date) ? date : 0;
  }

  private resetVisibleCount(): void {
    this.visibleCount.set(PUBLIC_LIBRARY_PAGE_SIZE);
  }

  private updateSeo(profile: PublicProfile, mode: PublicLibraryMode): void {
    const libraryLabel = mode === "anime" ? "Animethèque" : "Mangathèque";
    this.seoService.setPageMeta({
      title: `${libraryLabel} de ${profile.displayName || profile.pseudo} - AnimeClub`,
      description: `${libraryLabel} publique de ${profile.displayName || profile.pseudo} sur AnimeClub.`,
      image:
        this.profileService.assetUrl(
          profile.profilePictureUrl || profile.backgroundUrl,
        ) || undefined,
      type: "profile",
    });
  }

  private sortByUpdate<T extends { updatedAt?: string }>(entries: T[]): T[] {
    return [...entries].sort((left, right) => {
      const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
      const rightTime = right.updatedAt
        ? new Date(right.updatedAt).getTime()
        : 0;
      return rightTime - leftTime;
    });
  }

  private showNotFound(): void {
    this.profile.set(null);
    this.animeEntries.set([]);
    this.mangaEntries.set([]);
    this.errorMessage.set("Profil introuvable.");
    this.loading.set(false);
  }
}
