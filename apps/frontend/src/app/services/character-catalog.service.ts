import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  CharacterCatalogEntry,
  CharacterCatalogImportStatus,
  CharacterCatalogPage,
} from '../models/character.model';

interface BackendImageColor {
  rgb?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CharacterCatalogService {
  private readonly http = inject(HttpClient);
  private readonly characterCatalogUrl = `${environment.apiUrl}/character-catalog`;
  private readonly animeCatalogUrl = `${environment.apiUrl}/anime-catalog`;

  listCharacters(query: string, page: number, pageSize = 24): Observable<CharacterCatalogPage> {
    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);

    if (query.trim()) {
      params = params.set('query', query.trim());
    }

    return this.http.get<CharacterCatalogPage>(this.characterCatalogUrl, { params });
  }

  getPopularCharacters(limit = 12): Observable<CharacterCatalogEntry[]> {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<CharacterCatalogEntry[]>(`${this.characterCatalogUrl}/popular`, { params });
  }

  searchSuggestions(query: string, limit = 5): Observable<CharacterCatalogEntry[]> {
    const params = new HttpParams()
      .set('query', query.trim())
      .set('limit', limit);

    return this.http.get<CharacterCatalogEntry[]>(`${this.characterCatalogUrl}/suggestions`, { params });
  }

  getCharacterBySlug(slug: string): Observable<CharacterCatalogEntry> {
    return this.http.get<CharacterCatalogEntry>(`${this.characterCatalogUrl}/slug/${encodeURIComponent(slug)}`);
  }

  getCharactersByAnimeMalId(malId: number, limit = 12): Observable<CharacterCatalogEntry[]> {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<CharacterCatalogEntry[]>(`${this.characterCatalogUrl}/anime/${malId}`, { params });
  }

  getImportStatus(): Observable<CharacterCatalogImportStatus> {
    return this.http.get<CharacterCatalogImportStatus>(`${this.characterCatalogUrl}/import/status`);
  }

  getDominantImageColor(imageUrl: string): Observable<string | null> {
    const cleanImageUrl = imageUrl.trim();
    if (!cleanImageUrl) {
      return of(null);
    }

    const params = new HttpParams().set('url', cleanImageUrl);
    return this.http.get<BackendImageColor>(`${this.animeCatalogUrl}/image-color`, { params }).pipe(
      map((response) => this.cleanRgbValue(response.rgb)),
      catchError(() => of(null)),
    );
  }

  startImport(
    maxPages?: number,
    reset = false,
    retryErrors = false,
    globalCatalog = false,
  ): Observable<CharacterCatalogImportStatus> {
    return this.http.post<CharacterCatalogImportStatus>(
      `${this.characterCatalogUrl}/import/start`,
      {
        ...(maxPages ? { maxPages } : {}),
        reset,
        retryErrors,
        globalCatalog,
      },
    );
  }

  private cleanRgbValue(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const channels = value.split(',').map((channel) => Number(channel.trim()));
    if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
      return null;
    }

    return channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel)))).join(', ');
  }
}
