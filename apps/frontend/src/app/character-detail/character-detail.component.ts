import { Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { catchError, map, of, switchMap } from 'rxjs';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { CharacterCatalogEntry } from '../models/character.model';
import { CharacterCatalogService } from '../services/character-catalog.service';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-character-detail',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MenuBarComponent],
  templateUrl: './character-detail.component.html',
  styleUrl: './character-detail.component.scss',
})
export class CharacterDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly characterCatalogService = inject(CharacterCatalogService);
  private readonly seoService = inject(SeoService);

  readonly character = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('id') ?? ''),
      switchMap((slug) =>
        slug
          ? this.characterCatalogService.getCharacterBySlug(slug).pipe(catchError(() => of(null)))
          : of(null),
      ),
    ),
    { initialValue: null },
  );

  constructor() {
    effect(() => {
      const character = this.character();
      if (!character) {
        return;
      }

      this.seoService.setPageMeta({
        title: `${character.name} - AnimeClub`,
        description: `${character.name} sur AnimeClub : fiche personnage, origine, rôle et informations associées.`,
        image: this.imageFor(character),
        type: 'article',
      });
    });
  }

  backgroundStyle(character: CharacterCatalogEntry): string {
    const image = this.imageFor(character);
    return image
      ? `linear-gradient(90deg, rgba(12, 12, 12, 0.97), rgba(12, 12, 12, 0.7), rgba(12, 12, 12, 0.9)), url("${image}")`
      : 'linear-gradient(135deg, #15110f, #32251a)';
  }

  imageFor(character: CharacterCatalogEntry): string {
    return character.imageUrl || '';
  }

  descriptionFor(character: CharacterCatalogEntry): string {
    if (character.about?.trim()) {
      return character.about.trim();
    }

    return character.sourceAnimeTitle
      ? `${character.name} est un personnage de ${character.sourceAnimeTitle}.`
      : `${character.name} est un personnage dont la fiche sera complétée avec plus de détails.`;
  }

  favoritesFor(character: CharacterCatalogEntry): string {
    return character.favorites && character.favorites > 0
      ? `${character.favorites.toLocaleString('fr-FR')} favoris`
      : 'Favoris inconnus';
  }

  sourceFor(character: CharacterCatalogEntry): string | null {
    if (character.sourceAnimeTitle && character.role) {
      return `${character.role} dans ${character.sourceAnimeTitle}`;
    }

    return character.sourceAnimeTitle || character.role;
  }
}
