import type { PopularAnime, PopularAnimeSeason } from '../models/anime.model';
import { labelMainSeason } from './anime-season-label.util';

function anime(title: string, seasonTitles: string[]): PopularAnime {
  const seasons = seasonTitles.map((seasonTitle, index) => season(seasonTitle, index + 1));
  return {
    id: 1,
    slug: slug(title),
    title,
    titleJapanese: null,
    imageUrl: '',
    backgroundUrl: '',
    synopsis: '',
    type: 'Serie',
    episodes: 0,
    status: 'Finished Airing',
    score: null,
    rank: null,
    popularity: null,
    season: null,
    year: null,
    genres: [],
    studios: [],
    trailerUrl: null,
    seasons,
  };
}

function season(title: string, index: number): PopularAnimeSeason {
  return {
    malId: index,
    slug: slug(`${title}-${index}`),
    title,
    titleJapanese: null,
    synopsis: '',
    type: 'TV',
    imageUrl: '',
    trailerUrl: null,
    episodes: 12,
    status: 'Finished Airing',
    season: null,
    year: 2000 + index,
  };
}

function labelsFor(title: string, seasonTitles: string[]): string[] {
  const currentAnime = anime(title, seasonTitles);
  return currentAnime.seasons.map((currentSeason) => labelMainSeason(currentAnime, currentSeason).title);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

describe('anime season labels', () => {
  it('keeps the x from Spy x Family as a title letter', () => {
    expect(
      labelsFor('Spy x Family', ['Spy x Family', 'Spy x Family Part 2', 'Spy x Family Season 2', 'Spy x Family Season 3']),
    ).toEqual(['Saison 1', 'Saison 1 - Suite', 'Saison 2', 'Saison 3']);
  });

  it('keeps Tokyo Ghoul:re 2nd Season as the continuation of :re', () => {
    expect(labelsFor('Tokyo Ghoul', ['Tokyo Ghoul', 'Tokyo Ghoul √A', 'Tokyo Ghoul:re', 'Tokyo Ghoul:re 2nd Season'])).toEqual([
      'Saison 1',
      'Saison 2 - √A',
      'Saison 3 - re',
      'Saison 3 - Suite',
    ]);
  });

  it('keeps DanMachi IV Part 2 inside season 4 before season 5', () => {
    expect(
      labelsFor('Is It Wrong to Try to Pick Up Girls in a Dungeon?', [
        'Is It Wrong to Try to Pick Up Girls in a Dungeon?',
        'Is It Wrong to Try to Pick Up Girls in a Dungeon? II',
        'Is It Wrong to Try to Pick Up Girls in a Dungeon? III',
        'Is It Wrong to Try to Pick Up Girls in a Dungeon? IV',
        'Is It Wrong to Try to Pick Up Girls in a Dungeon? IV Part 2',
        'Is It Wrong to Try to Pick Up Girls in a Dungeon? V',
      ]),
    ).toEqual(['Saison 1', 'Saison 2', 'Saison 3', 'Saison 4', 'Saison 4 - Suite', 'Saison 5']);
  });

  it('treats Date A Live roman numerals as season numbers', () => {
    expect(labelsFor('Date A Live', ['Date A Live', 'Date A Live II', 'Date A Live III', 'Date A Live IV', 'Date A Live V'])).toEqual([
      'Saison 1',
      'Saison 2',
      'Saison 3',
      'Saison 4',
      'Saison 5',
    ]);
  });

  it('does not treat a repeated franchise subtitle as a split season', () => {
    expect(
      labelsFor('Re:ZERO', [
        'Re:ZERO -Starting Life in Another World-',
        'Re:ZERO -Starting Life in Another World- Season 2',
        'Re:ZERO -Starting Life in Another World- Season 2 Part 2',
        'Re:ZERO -Starting Life in Another World- Season 3',
        'Re:ZERO -Starting Life in Another World- Season 4',
      ]),
    ).toEqual(['Saison 1', 'Saison 2', 'Saison 2 - Suite', 'Saison 3', 'Saison 4']);
  });

  it('does not treat a bare X suffix as season 10', () => {
    expect(labelsFor('Beyblade', ['Beyblade', 'Beyblade X'])).toEqual(['Saison 1', 'Saison 2 - X']);
  });

  it('keeps X Part 2 as the continuation of an X-titled season', () => {
    expect(labelsFor('Miniforce', ['Miniforce', 'Miniforce X', 'Miniforce X Part 2'])).toEqual([
      'Saison 1',
      'Saison 2 - X',
      'Saison 2 - Suite',
    ]);
  });

  it('still supports explicit Season X Part 2 as season 10 continuation', () => {
    expect(labelsFor('Example Anime', ['Example Anime Season X', 'Example Anime Season X Part 2'])).toEqual([
      'Saison 10',
      'Saison 10 - Suite',
    ]);
  });

  it('does not auto-convert franchise Part titles without a base season', () => {
    expect(labelsFor('Example Part Franchise', ['Example Part Franchise Part 4', 'Example Part Franchise Part 5'])).toEqual([
      'Saison 1 - Partie 4',
      'Saison 2 - Partie 5',
    ]);
  });
});
