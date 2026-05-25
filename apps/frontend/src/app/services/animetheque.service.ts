import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { AnimethequeEntry, AnimethequeEntryRequest, WatchStatus } from '../models/animetheque.model';

@Injectable({ providedIn: 'root' })
export class AnimethequeService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/animetheque`;

  list(accountId: number): Observable<AnimethequeEntry[]> {
    return this.http
      .get<AnimethequeEntry[]>(`${this.url}/${accountId}`)
      .pipe(map((entries) => entries.map((entry) => this.normalizeEntry(entry))));
  }

  publicList(accountId: number): Observable<AnimethequeEntry[]> {
    return this.http
      .get<AnimethequeEntry[]>(`${this.url}/public/${accountId}`)
      .pipe(map((entries) => entries.map((entry) => this.normalizeEntry(entry))));
  }

  save(accountId: number, request: AnimethequeEntryRequest): Observable<AnimethequeEntry> {
    return this.http.post<AnimethequeEntry>(`${this.url}/${accountId}`, request).pipe(map((entry) => this.normalizeEntry(entry)));
  }

  delete(accountId: number, entryId: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${accountId}/${entryId}`);
  }

  private normalizeEntry(entry: AnimethequeEntry): AnimethequeEntry {
    const status = this.normalizeStatus(entry.status, entry.watchedEpisodes, entry.totalEpisodes);
    return status === entry.status ? entry : { ...entry, status };
  }

  private normalizeStatus(status: WatchStatus, watchedEpisodes: number, totalEpisodes: number): WatchStatus {
    if (status !== 'WATCHING') {
      return status;
    }

    const watched = Math.max(0, Number(watchedEpisodes || 0));
    const total = Math.max(0, Number(totalEpisodes || 0));
    if (watched <= 0) {
      return 'PLANNED';
    }

    return total > 0 && watched >= total ? 'COMPLETED' : 'WATCHING';
  }
}
