import type { PopularAnime } from '../models/anime.model';
import {
  MADOKA_MOVIE_COLLECTION_SLUG,
  buildMadokaMovieCollection,
  isMadokaCanonicalFollowupMovieId,
  isMadokaRecapMovieId,
  madokaMovieNumber,
} from './anime-franchise-overrides.util';

function movie(id: number, title: string, year: number): PopularAnime {
  const slug = `mal-${id}`;
  return {
    id,
    slug,
    title,
    titleJapanese: null,
    imageUrl: `${slug}.webp`,
    backgroundUrl: `${slug}.webp`,
    synopsis: `${title} synopsis`,
    type: 'Movie',
    episodes: 1,
    status: 'Finished Airing',
    score: 8,
    rank: null,
    popularity: id,
    season: null,
    year,
    genres: ['Drama'],
    studios: ['Shaft'],
    trailerUrl: null,
    seasons: [
      {
        malId: id,
        slug,
        title,
        titleJapanese: null,
        synopsis: `${title} synopsis`,
        type: 'Movie',
        imageUrl: `${slug}.webp`,
        trailerUrl: null,
        episodes: 1,
        status: 'Finished Airing',
        score: 8,
        rank: null,
        popularity: id,
        season: null,
        year,
        genres: ['Drama'],
        studios: ['Shaft'],
      },
    ],
  };
}

describe('Madoka franchise overrides', () => {
  it('keeps the recap films outside the episodic chronology', () => {
    expect(isMadokaRecapMovieId(11977)).toBe(true);
    expect(isMadokaRecapMovieId(11979)).toBe(true);
    expect(isMadokaCanonicalFollowupMovieId(11977)).toBe(false);
    expect(isMadokaCanonicalFollowupMovieId(11981)).toBe(true);
    expect(isMadokaCanonicalFollowupMovieId(48820)).toBe(true);
  });

  it('uses the official movie numbering', () => {
    expect([11977, 11979, 11981, 48820].map(madokaMovieNumber)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(madokaMovieNumber(32153)).toBeNull();
  });

  it('builds the film path in order and excludes the concept movie', () => {
    const collection = buildMadokaMovieCollection([
      movie(11981, 'Puella Magi Madoka Magica the Movie: Rebellion', 2013),
      movie(32153, 'Puella Magi Madoka Magica Concept Movie', 2015),
      movie(
        11977,
        'Puella Magi Madoka Magica the Movie Part 1: Beginnings',
        2012,
      ),
      movie(
        48820,
        'Puella Magi Madoka Magica the Movie Part 4: Walpurgisnacht: Rising',
        2026,
      ),
      movie(11979, 'Puella Magi Madoka Magica the Movie Part 2: Eternal', 2012),
    ]);

    expect(collection?.slug).toBe(MADOKA_MOVIE_COLLECTION_SLUG);
    expect(collection?.seasons.map((season) => season.malId)).toEqual([
      11977, 11979, 11981, 48820,
    ]);
  });
});
