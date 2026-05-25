import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { CATALOG_ITEMS, KIND_LABELS } from '../data/catalog.data';
import { AnimethequeEntryRequest, WatchStatus } from '../models/animetheque.model';
import { CatalogItem, CatalogKind } from '../models/catalog.model';
import { AuthService } from '../services/auth.service';
import { AnimethequeService } from '../services/animetheque.service';
import { MenuBarComponent } from '../menu-bar/menu-bar.component';

type KindFilter = CatalogKind | 'all';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MenuBarComponent,
  ],
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.scss',
})
export class CatalogComponent {
  private readonly authService = inject(AuthService);
  private readonly animethequeService = inject(AnimethequeService);
  private readonly formBuilder = inject(FormBuilder);

  readonly account$ = this.authService.account$;
  readonly items = CATALOG_ITEMS;
  readonly kindLabels = KIND_LABELS;
  readonly kindFilters: { value: KindFilter; label: string }[] = [
    { value: 'all', label: 'Tout' },
    { value: 'anime', label: 'Animes' },
    { value: 'manga', label: 'Mangas' },
    { value: 'drama', label: 'Dramas' },
    { value: 'music', label: 'Musique' },
  ];
  readonly moods = ['Tous', ...Array.from(new Set(CATALOG_ITEMS.map((item) => item.mood)))];

  readonly query = signal('');
  readonly kind = signal<KindFilter>('all');
  readonly mood = signal('Tous');
  readonly selected = signal<CatalogItem>(CATALOG_ITEMS[0]);
  readonly feedback = signal('');
  readonly saving = signal(false);

  readonly libraryForm = this.formBuilder.nonNullable.group({
    status: ['WATCHING' as WatchStatus, [Validators.required]],
    watchedEpisodes: [1, [Validators.required, Validators.min(0)]],
    score: [8, [Validators.min(0), Validators.max(10)]],
    favorite: [false],
    notes: [''],
  });

  readonly filteredItems = computed(() => {
    const query = this.query().trim().toLowerCase();
    const kind = this.kind();
    const mood = this.mood();

    return this.items.filter((item) => {
      const matchesKind = kind === 'all' || item.kind === kind;
      const matchesMood = mood === 'Tous' || item.mood === mood;
      const haystack = [
        item.title,
        item.originalTitle,
        item.format,
        item.studio,
        item.season,
        item.mood,
        ...item.genres,
      ]
        .join(' ')
        .toLowerCase();

      return matchesKind && matchesMood && (!query || haystack.includes(query));
    });
  });

  readonly topItems = computed(() =>
    [...this.items]
      .filter((item) => item.kind === 'anime')
      .sort((left, right) => right.communityScore - left.communityScore)
      .slice(0, 3),
  );

  setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  selectKind(kind: KindFilter): void {
    this.kind.set(kind);
  }

  selectMood(mood: string): void {
    this.mood.set(mood);
  }

  selectItem(item: CatalogItem): void {
    this.selected.set(item);
    this.feedback.set('');
    this.libraryForm.patchValue({
      status: item.kind === 'anime' ? 'WATCHING' : 'PLANNED',
      watchedEpisodes: item.kind === 'anime' ? Math.min(1, item.episodes) : 0,
      score: Math.round(item.communityScore),
      favorite: false,
      notes: '',
    });
  }

  completeSelectionIfNeeded(status: WatchStatus): void {
    if (status !== 'COMPLETED') {
      return;
    }

    this.libraryForm.patchValue({
      watchedEpisodes: this.completedEpisodeValue(this.selected()),
    });
  }

  isCompletedSelected(): boolean {
    return this.libraryForm.controls.status.value === 'COMPLETED';
  }

  selectedCompletionLabel(): string {
    return this.selected().format.toLowerCase() === 'film' ? 'FILM TERMINE' : 'ANIME TERMINÉ';
  }

  addToAnimetheque(accountId: number): void {
    const item = this.selected();
    if (item.kind !== 'anime' || this.libraryForm.invalid || this.saving()) {
      this.libraryForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.feedback.set('');

    this.animethequeService.save(accountId, this.toRequest(item)).subscribe({
      next: () => {
        this.feedback.set('Anime ajouté à ton Animethèque.');
        this.saving.set(false);
      },
      error: () => {
        this.feedback.set('Impossible de mettre à jour ton Animethèque.');
        this.saving.set(false);
      },
    });
  }

  private toRequest(item: CatalogItem): AnimethequeEntryRequest {
    const form = this.libraryForm.getRawValue();
    const maxEpisodes = item.episodes > 0 ? item.episodes : Number.MAX_SAFE_INTEGER;
    const watchedEpisodes =
      form.status === 'COMPLETED'
        ? this.completedEpisodeValue(item)
        : Math.min(Math.max(0, Number(form.watchedEpisodes || 0)), maxEpisodes);
    const status = this.normalizedWatchStatus(form.status, watchedEpisodes, item);

    return {
      animeSlug: item.slug,
      title: item.title,
      coverUrl: item.imageUrl,
      status,
      watchedEpisodes,
      totalEpisodes: item.episodes,
      mediaType: item.format,
      score: form.score,
      favorite: form.favorite,
      notes: form.notes,
    };
  }

  private completedEpisodeValue(item: CatalogItem): number {
    return item.episodes > 0 ? item.episodes : Math.max(0, Number(this.libraryForm.controls.watchedEpisodes.value || 0));
  }

  private normalizedWatchStatus(status: WatchStatus, watchedEpisodes: number, item: CatalogItem): WatchStatus {
    if (status === 'WATCHING' && watchedEpisodes <= 0) {
      return 'PLANNED';
    }

    if (item.episodes > 0 && watchedEpisodes >= item.episodes) {
      return status === 'DROPPED' || status === 'PAUSED' ? status : 'COMPLETED';
    }

    if (status === 'PLANNED' && watchedEpisodes > 0) {
      return 'WATCHING';
    }

    return status;
  }
}
