import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, switchMap, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { MangaLibraryEntry, MangaLibraryEntryRequest } from '../models/manga.model';

const STORAGE_PREFIX = 'animaclub.mangatheque';

@Injectable({ providedIn: 'root' })
export class MangaLibraryService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/mangatheque`;
  private readonly migratedAccounts = new Set<number>();

  list(accountId: number): Observable<MangaLibraryEntry[]> {
    if (this.migratedAccounts.has(accountId)) {
      return this.fetch(accountId);
    }

    const localEntries = this.readLocal(accountId);
    this.migratedAccounts.add(accountId);
    if (localEntries.length === 0) {
      return this.fetch(accountId);
    }

    return forkJoin(localEntries.map((entry) => this.save(accountId, this.toRequest(entry)))).pipe(
      switchMap(() => this.fetch(accountId)),
      tap(() => this.clearLocal(accountId)),
    );
  }

  save(accountId: number, request: MangaLibraryEntryRequest): Observable<MangaLibraryEntry> {
    return this.http.post<MangaLibraryEntry>(`${this.url}/${accountId}`, request);
  }

  delete(accountId: number, entryId: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${accountId}/${entryId}`);
  }

  publicList(accountId: number): Observable<MangaLibraryEntry[]> {
    return this.fetchPublic(accountId);
  }

  private fetch(accountId: number): Observable<MangaLibraryEntry[]> {
    return this.http.get<MangaLibraryEntry[]>(`${this.url}/${accountId}`);
  }

  private fetchPublic(accountId: number): Observable<MangaLibraryEntry[]> {
    return this.http.get<MangaLibraryEntry[]>(`${this.url}/public/${accountId}`);
  }

  private key(accountId: number): string {
    return `${STORAGE_PREFIX}.${accountId}`;
  }

  private readLocal(accountId: number): MangaLibraryEntry[] {
    const rawValue = localStorage.getItem(this.key(accountId));
    if (!rawValue) {
      return [];
    }

    try {
      return JSON.parse(rawValue) as MangaLibraryEntry[];
    } catch {
      this.clearLocal(accountId);
      return [];
    }
  }

  private clearLocal(accountId: number): void {
    localStorage.removeItem(this.key(accountId));
  }

  private toRequest(entry: MangaLibraryEntry): MangaLibraryEntryRequest {
    return {
      mangaSlug: entry.mangaSlug,
      title: entry.title,
      coverUrl: entry.coverUrl,
      status: entry.status,
      readChapters: entry.readChapters,
      totalChapters: entry.totalChapters,
      readVolumes: Math.max(0, Number(entry.readVolumes || 0)),
      totalVolumes: Math.max(0, Number(entry.totalVolumes || 0)),
      score: entry.score === null || entry.score === undefined ? null : Math.max(0, Math.min(Number(entry.score), 10)),
      favorite: entry.favorite,
      notes: entry.notes || '',
      catalogType: entry.catalogType ?? null,
      catalogScore: entry.catalogScore ?? null,
      catalogYear: entry.catalogYear ?? null,
      catalogGenres: entry.catalogGenres ?? [],
      catalogAuthors: entry.catalogAuthors ?? [],
    };
  }
}
