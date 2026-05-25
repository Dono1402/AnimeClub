import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { WatchStatus } from '../models/animetheque.model';
import { MangaLibraryEntry, MangaLibraryEntryRequest, PopularManga } from '../models/manga.model';
import { AuthService } from '../services/auth.service';
import { MangaCatalogService } from '../services/manga-catalog.service';
import { MangaLibraryService } from '../services/manga-library.service';
import { SeoService } from '../services/seo.service';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

@Component({
  selector: 'app-manga-detail',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MenuBarComponent],
  templateUrl: './manga-detail.component.html',
  styleUrl: './manga-detail.component.scss',
})
export class MangaDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly mangaCatalogService = inject(MangaCatalogService);
  private readonly mangaLibraryService = inject(MangaLibraryService);
  private readonly seoService = inject(SeoService);

  readonly account = toSignal(this.authService.account$, {
    initialValue: this.authService.currentAccount(),
  });
  readonly manga = signal<PopularManga | null>(null);
  readonly libraryEntries = signal<MangaLibraryEntry[]>([]);
  readonly loading = signal(true);
  readonly saving = signal<SaveState>('idle');
  readonly feedback = signal('');
  readonly errorMessage = signal('');

  readonly inLibrary = computed(() => {
    const manga = this.manga();
    return manga ? this.libraryEntries().some((entry) => entry.mangaSlug === manga.slug) : false;
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => this.loadManga(params.get('slug') ?? ''));
  }

  addToMangatheque(): void {
    const account = this.account();
    const manga = this.manga();
    if (!manga || this.saving() === 'saving') {
      return;
    }

    if (!account) {
      void this.router.navigate(['/login']);
      return;
    }

    this.saving.set('saving');
    this.feedback.set('');
    this.errorMessage.set('');

    this.mangaLibraryService.save(account.id, this.toLibraryRequest(manga)).subscribe({
      next: (entry) => {
        this.libraryEntries.update((entries) => {
          const exists = entries.some((currentEntry) => currentEntry.id === entry.id || currentEntry.mangaSlug === entry.mangaSlug);
          return exists
            ? entries.map((currentEntry) => (currentEntry.id === entry.id || currentEntry.mangaSlug === entry.mangaSlug ? entry : currentEntry))
            : [entry, ...entries];
        });
        this.saving.set('saved');
        this.feedback.set(`${entry.title} ajoute a ta Mangatheque.`);
      },
      error: () => {
        this.saving.set('error');
        this.errorMessage.set('Ajout a la Mangatheque impossible.');
      },
    });
  }

  libraryButtonLabel(): string {
    if (this.saving() === 'saving') {
      return 'Ajout...';
    }

    if (this.inLibrary() || this.saving() === 'saved') {
      return 'Dans ma Mangatheque';
    }

    return 'Ajouter a ma Mangatheque';
  }

  heroImageStyle(manga: PopularManga): string {
    return manga.imageUrl ? `url("${manga.imageUrl}")` : 'none';
  }

  formatScore(score: number | null): string {
    return score === null ? 'N/A' : score.toFixed(2).replace(/\.00$/, '');
  }

  rankLabel(rank: number | null): string {
    return rank ? `#${rank.toLocaleString('fr-FR')}` : 'N/A';
  }

  popularityLabel(popularity: number | null): string {
    return popularity ? `#${popularity.toLocaleString('fr-FR')}` : 'N/A';
  }

  volumeLabel(manga: PopularManga): string {
    return manga.volumes > 0 ? `${manga.volumes.toLocaleString('fr-FR')} tomes` : 'Tomes inconnus';
  }

  chapterLabel(manga: PopularManga): string {
    return manga.chapters > 0 ? `${manga.chapters.toLocaleString('fr-FR')} chapitres` : 'Chapitres inconnus';
  }

  statusDisplay(status: string): string {
    switch (this.normalize(status)) {
      case 'publishing':
        return 'En cours';
      case 'finished':
      case 'complete':
        return 'Termine';
      case 'on hiatus':
        return 'En pause';
      case 'discontinued':
        return 'Arrete';
      case 'not yet published':
        return 'A venir';
      default:
        return status || 'Statut inconnu';
    }
  }

  publishedLabel(manga: PopularManga): string {
    return manga.published || 'Publication inconnue';
  }

  authorsLine(manga: PopularManga): string {
    return manga.authors.length ? manga.authors.join(', ') : 'Auteur inconnu';
  }

  malUrl(manga: PopularManga): string {
    return `https://myanimelist.net/manga/${manga.id}`;
  }

  wikipediaSearchUrl(manga: PopularManga): string {
    return `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(`${manga.title} manga`)}`;
  }

  private loadManga(slug: string): void {
    this.loading.set(true);
    this.feedback.set('');
    this.errorMessage.set('');
    this.manga.set(null);

    this.mangaCatalogService.getMangaBySlug(slug).subscribe({
      next: (manga) => {
        this.loading.set(false);
        if (!manga) {
          this.errorMessage.set('Manga introuvable.');
          return;
        }

        this.manga.set(manga);
        this.updateSeo(manga);
        this.loadLibraryEntries();
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger ce manga.');
      },
    });
  }

  private loadLibraryEntries(): void {
    const account = this.account();
    if (!account) {
      this.libraryEntries.set([]);
      return;
    }

    this.mangaLibraryService.list(account.id).subscribe({
      next: (entries) => this.libraryEntries.set(entries),
      error: () => this.libraryEntries.set([]),
    });
  }

  private updateSeo(manga: PopularManga): void {
    const synopsis = manga.synopsis.replace(/\s+/g, ' ').trim();
    this.seoService.setPageMeta({
      title: `${manga.title} - AnimeClub`,
      description: synopsis
        ? `Fiche manga de ${manga.title} : ${synopsis.slice(0, 145)}`
        : `Fiche manga de ${manga.title} : volumes, chapitres, auteurs, note et suivi dans votre Mangathèque.`,
      image: manga.imageUrl,
      type: 'article',
    });
  }

  private toLibraryRequest(manga: PopularManga): MangaLibraryEntryRequest {
    return {
      mangaSlug: manga.slug,
      title: manga.title,
      coverUrl: manga.imageUrl,
      status: 'PLANNED' as WatchStatus,
      readChapters: 0,
      totalChapters: Math.max(0, Number(manga.chapters || 0)),
      readVolumes: 0,
      totalVolumes: Math.max(0, Number(manga.volumes || 0)),
      score: null,
      favorite: false,
      notes: '',
      catalogType: manga.type || null,
      catalogScore: manga.score ?? null,
      catalogYear: this.catalogYear(manga),
      catalogGenres: manga.genres,
      catalogAuthors: manga.authors,
    };
  }

  private catalogYear(manga: PopularManga): number | null {
    const match = /\b(19|20)\d{2}\b/.exec(manga.published);
    return match ? Number(match[0]) : null;
  }

  private normalize(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
