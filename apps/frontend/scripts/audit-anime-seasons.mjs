import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_URL = process.env.ANIME_CATALOG_URL ?? 'http://127.0.0.1:8080/anime-catalog';
const PAGE_SIZE = Number(process.env.ANIME_AUDIT_PAGE_SIZE ?? 100);
const OUTPUT_LIMIT = Number(process.env.ANIME_AUDIT_OUTPUT_LIMIT ?? 120);
const STRICT = process.argv.includes('--strict');

const {
  explicitSeasonNumber,
  labelMainSeason,
  normalizeSeasonTitle,
  seasonPartNumber,
  splitSeasonContinuationDetail,
} = await loadSeasonLabelUtils();

const SERIES_ALIASES = [
  [/^attack on titan/i, 'Attack on Titan'],
  [/^assassination classroom/i, 'Assassination Classroom'],
  [/^boku no hero academia/i, 'My Hero Academia'],
  [/^blue exorcist/i, 'Blue Exorcist'],
  [/^bungo stray dogs/i, 'Bungo Stray Dogs'],
  [/^classroom of the elite/i, 'Classroom of the Elite'],
  [/^clannad/i, 'Clannad'],
  [/^demon slayer/i, 'Demon Slayer: Kimetsu no Yaiba'],
  [/^durarara/i, 'Durarara!!'],
  [/^fairy tail/i, 'Fairy Tail'],
  [/^fire force/i, 'Fire Force'],
  [/^(frieren|sousou no frieren)/i, "Frieren: Beyond Journey's End"],
  [/^food wars/i, 'Food Wars! Shokugeki no Soma'],
  [/^jujutsu kaisen/i, 'Jujutsu Kaisen'],
  [/^kaguya-sama/i, 'Kaguya-sama: Love is War'],
  [/^konosuba/i, "KonoSuba: God's Blessing on This Wonderful World!"],
  [/^my hero academia/i, 'My Hero Academia'],
  [/^made in abyss/i, 'Made in Abyss'],
  [/^mushoku tensei/i, 'Mushoku Tensei: Jobless Reincarnation'],
  [/^my teen romantic comedy snafu/i, 'My Teen Romantic Comedy SNAFU'],
  [/^noragami/i, 'Noragami'],
  [/^is it wrong to try to pick up girls in a dungeon/i, 'Is It Wrong to Try to Pick Up Girls in a Dungeon?'],
  [/^sword art online/i, 'Sword Art Online'],
  [/^haikyu/i, 'Haikyu!!'],
  [/^high school dxd/i, 'High School DxD'],
  [/^one punch man/i, 'One Punch Man'],
  [/^overlord/i, 'Overlord'],
  [/^psycho-pass/i, 'Psycho-Pass'],
  [/^rascal does not dream/i, 'Rascal Does Not Dream'],
  [/^seishun buta yarou/i, 'Rascal Does Not Dream'],
  [/^spy\s*x\s*family/i, 'Spy x Family'],
  [/^the quintessential quintuplets/i, 'The Quintessential Quintuplets'],
  [/^gotoubun no hanayome/i, 'The Quintessential Quintuplets'],
  [/^mob psycho 100/i, 'Mob Psycho 100'],
  [/^tokyo ghoul/i, 'Tokyo Ghoul'],
  [/^the devil is a part-timer/i, 'The Devil is a Part-Timer!'],
  [/^the promised neverland/i, 'The Promised Neverland'],
  [/^the rising of the shield hero/i, 'The Rising of the Shield Hero'],
  [/^the seven deadly sins/i, 'The Seven Deadly Sins'],
  [/^nanatsu no taizai/i, 'The Seven Deadly Sins'],
  [/^that time i got reincarnated as a slime/i, 'That Time I Got Reincarnated as a Slime'],
  [/^re:zero/i, 'Re:Zero'],
  [/^code geass/i, 'Code Geass'],
  [/^jojo/i, "JoJo's Bizarre Adventure"],
  [/^dr\.?\s*stone/i, 'Dr. Stone'],
  [/^black clover/i, 'Black Clover'],
  [/^bleach/i, 'Bleach'],
  [/^naruto/i, 'Naruto'],
  [/^dragon ball/i, 'Dragon Ball'],
];

const allEntries = await fetchCatalogEntries();
const groups = buildGroups(allEntries);
const issues = [];
let okGroups = 0;

for (const group of groups) {
  const groupIssues = auditGroup(group);
  if (groupIssues.length === 0) {
    okGroups += 1;
  } else {
    issues.push(...groupIssues);
  }
}

const suspectGroups = new Set(issues.map((issue) => issue.groupSlug)).size;
const errorCount = issues.filter((issue) => issue.severity === 'ERROR').length;
const warningCount = issues.length - errorCount;

console.log('Audit saisons anime');
console.log(`Source: ${CATALOG_URL}`);
console.log(`Entrees scannees: ${allEntries.length}`);
console.log(`Groupes OK: ${okGroups}`);
console.log(`Groupes suspects: ${suspectGroups}`);
console.log(`Erreurs: ${errorCount}`);
console.log(`Alertes: ${warningCount}`);

for (const issue of issues.slice(0, OUTPUT_LIMIT)) {
  console.log(
    `[${issue.severity}] ${issue.groupSlug} mal-${issue.malId} "${issue.title}" => "${issue.label}" :: ${issue.reason}`,
  );
}

if (issues.length > OUTPUT_LIMIT) {
  console.log(`... ${issues.length - OUTPUT_LIMIT} alerte(s) masquee(s). Ajuster ANIME_AUDIT_OUTPUT_LIMIT pour tout afficher.`);
}

if (STRICT && errorCount > 0) {
  process.exitCode = 1;
}

async function loadSeasonLabelUtils() {
  const utilPath = resolve(ROOT_DIR, 'src/app/utils/anime-season-label.util.ts');
  const source = await readFile(utilPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', output)(module.exports, module);
  return module.exports;
}

async function fetchCatalogEntries() {
  const entries = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const url = new URL(CATALOG_URL);
    url.searchParams.set('page', String(page));
    url.searchParams.set('pageSize', String(PAGE_SIZE));
    url.searchParams.set('sort', 'title-asc');
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      throw new Error(`Backend anime-catalog indisponible: HTTP ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const pageItems = Array.isArray(payload.items) ? payload.items : [];
    entries.push(...pageItems);
    hasNextPage = Boolean(payload.hasNextPage) && pageItems.length > 0;
    page += 1;
  }

  return entries;
}

function buildGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const identity = seriesIdentity(entry);
    const current = groups.get(identity.key) ?? { slug: identity.key, title: identity.title, entries: [] };
    current.entries.push(entry);
    groups.set(identity.key, current);
  }

  return Array.from(groups.values()).map((group) => toPopularAnimeGroup(group));
}

function toPopularAnimeGroup(group) {
  const orderedEntries = [...group.entries].sort(compareCatalogEntry);
  const primary = [...orderedEntries].sort((left, right) => (left.popularity ?? 999999) - (right.popularity ?? 999999))[0];
  const seasons = orderedEntries.map((entry) => ({
    malId: entry.malId,
    slug: entry.slug || `mal-${entry.malId}`,
    title: entry.title || entry.titleEnglish || `Anime ${entry.malId}`,
    titleJapanese: entry.titleJapanese ?? null,
    synopsis: entry.synopsis ?? '',
    type: entry.type ?? 'Anime',
    imageUrl: entry.imageUrl ?? '',
    trailerUrl: entry.trailerUrl ?? null,
    episodes: entry.episodes ?? 0,
    status: entry.status ?? null,
    score: entry.score ?? null,
    rank: entry.rank ?? null,
    popularity: entry.popularity ?? null,
    season: entry.season ?? null,
    year: entry.year ?? null,
    genres: entry.genres ?? [],
    studios: entry.studios ?? [],
  }));

  return {
    id: primary?.malId ?? 0,
    slug: group.slug,
    title: group.title,
    titleJapanese: primary?.titleJapanese ?? null,
    imageUrl: primary?.imageUrl ?? '',
    backgroundUrl: primary?.backgroundUrl ?? primary?.imageUrl ?? '',
    synopsis: primary?.synopsis ?? '',
    type: 'Serie',
    episodes: seasons.reduce((total, season) => total + Math.max(0, season.episodes), 0),
    status: 'Audit',
    score: primary?.score ?? null,
    rank: primary?.rank ?? null,
    popularity: primary?.popularity ?? null,
    season: null,
    year: Math.min(...seasons.map((season) => season.year ?? 9999)) || null,
    genres: [],
    studios: [],
    trailerUrl: primary?.trailerUrl ?? null,
    seasons,
  };
}

function auditGroup(anime) {
  const mainSeasons = anime.seasons.filter((season) => isAuditMainSeason(anime, season));
  if (mainSeasons.length <= 1) {
    return [];
  }

  const rows = mainSeasons.map((season) => ({
    season,
    label: labelMainSeason(anime, season, { isMainSeason: isAuditMainSeason }),
  }));
  const issues = [];

  for (const row of rows) {
    const normalizedTitle = normalizeSeasonTitle(row.season.title);
    const partNumber = seasonPartNumber(row.season.title);
    const ordinalContinuation = hasSubtitleContinuation(anime, row.season);

    if (/\sx\s/.test(` ${normalizedTitle} `) && row.label.number === 10) {
      issues.push(issue('ERROR', anime, row, 'x interprete comme chiffre romain'));
    } else if (/\sx$/.test(normalizedTitle)) {
      issues.push(issue('WARN', anime, row, 'x final conserve comme titre, controle manuel recommande'));
    }

    if (partNumber && partNumber > 1 && !row.label.isContinuation) {
      issues.push(issue(partNumber === 2 ? 'WARN' : 'WARN', anime, row, 'Part/Cour ambigu non converti automatiquement'));
    }

    if (ordinalContinuation && !row.label.isContinuation) {
      issues.push(issue('ERROR', anime, row, '2nd Season devrait rester dans la saison precedente'));
    }
  }

  for (const duplicate of duplicateLabels(rows)) {
    issues.push(issue('WARN', anime, duplicate, 'label calcule en doublon'));
  }

  for (const jump of seasonNumberJumps(rows)) {
    issues.push(issue('WARN', anime, jump, 'saut de numero de saison'));
  }

  return issues;
}

function issue(severity, anime, row, reason) {
  return {
    severity,
    groupSlug: anime.slug,
    malId: row.season.malId,
    title: row.season.title,
    label: row.label.title,
    reason,
  };
}

function duplicateLabels(rows) {
  const byLabel = new Map();
  for (const row of rows) {
    const current = byLabel.get(row.label.title) ?? [];
    current.push(row);
    byLabel.set(row.label.title, current);
  }

  return Array.from(byLabel.values())
    .filter((matches) => matches.length > 1)
    .flatMap((matches) => matches.slice(1));
}

function seasonNumberJumps(rows) {
  const jumps = [];
  let previousNumber = 0;
  for (const row of rows) {
    if (row.label.isContinuation) {
      continue;
    }

    if (previousNumber > 0 && row.label.number > previousNumber + 1) {
      jumps.push(row);
    }

    previousNumber = Math.max(previousNumber, row.label.number);
  }

  return jumps;
}

function hasSubtitleContinuation(anime, season) {
  const explicitNumber = explicitSeasonNumber(season.title);
  if (!explicitNumber || explicitNumber < 2) {
    return false;
  }

  const detail = splitSeasonContinuationDetail(anime, season.title);
  if (!detail) {
    return false;
  }

  const seasonIndex = anime.seasons.findIndex((candidate) => candidate.slug === season.slug);
  return anime.seasons.slice(0, Math.max(0, seasonIndex)).some(
    (candidate) =>
      isAuditMainSeason(anime, candidate) && splitSeasonContinuationDetail(anime, candidate.title) === detail,
  );
}

function isAuditMainSeason(_anime, season) {
  const normalizedType = normalizeSeasonTitle(season.type ?? '');
  return normalizedType === 'tv' || normalizedType === 'ona' || normalizedType === 'anime' || normalizedType === 'serie';
}

function seriesIdentity(entry) {
  const title = entry.title || entry.titleEnglish || `Anime ${entry.malId}`;
  const alias = seriesAliasForTitle(title);
  const baseTitle = (alias ?? baseSeriesTitle(title)) || title;
  return { key: `series-${slugify(baseTitle)}`, title: baseTitle };
}

function seriesAliasForTitle(title) {
  return SERIES_ALIASES.find(([match]) => match.test(title))?.[1] ?? null;
}

function baseSeriesTitle(title) {
  let normalizedTitle = title.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  const subtitleSplit = normalizedTitle.match(/^(.+?)\s*[:：]\s+(.+)$/);
  if (subtitleSplit && looksLikeSeasonSubtitle(subtitleSplit[2])) {
    normalizedTitle = subtitleSplit[1].trim();
  }

  return normalizedTitle
    .replace(/\s*\([^)]*(?:season|part|cour|arc|special|ova|ona)[^)]*\)\s*$/i, '')
    .replace(/\s+(the\s+)?final\s+season.*$/i, '')
    .replace(/\s+(the\s+)?final\s+(?:chapters?|arc|part).*$/i, '')
    .replace(/\s+\d+(st|nd|rd|th)\s+season.*$/i, '')
    .replace(/\s+(?:second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+season.*$/i, '')
    .replace(/\s+season\s+\d+.*$/i, '')
    .replace(/\s+s\d+\b.*$/i, '')
    .replace(/\s+part\s+\d+.*$/i, '')
    .replace(/\s+cour\s+\d+.*$/i, '')
    .replace(/\s+specials?.*$/i, '')
    .replace(/\s+ova.*$/i, '')
    .replace(/\s+ona.*$/i, '')
    .replace(/\s+(?:ii|iii|iv|v|vi|vii|viii|ix|x)\s+(?:part|cour)\s+\d+.*$/i, '')
    .replace(/\s+(?:ii|iii|iv|v|vi|vii|viii|ix|x)\s*$/i, '')
    .trim();
}

function looksLikeSeasonSubtitle(subtitle) {
  return /\b(?:season|part|cour|arc|final|chapter|train|district|village|kyoto|mugen|entertainment|swordsmith|war|invasion|underworld|return|returns|revival|commandments|wrath|judgement|judgment|second|third|fourth|ii|iii|iv|v)\b/i.test(
    subtitle,
  );
}

function compareCatalogEntry(left, right) {
  const yearDiff = (left.year ?? 9999) - (right.year ?? 9999);
  if (yearDiff !== 0) {
    return yearDiff;
  }

  const seasonDiff = seasonOrder(left.season) - seasonOrder(right.season);
  if (seasonDiff !== 0) {
    return seasonDiff;
  }

  return (left.malId ?? 0) - (right.malId ?? 0);
}

function seasonOrder(season) {
  switch (season) {
    case 'winter':
      return 1;
    case 'spring':
      return 2;
    case 'summer':
      return 3;
    case 'fall':
      return 4;
    default:
      return 5;
  }
}

function slugify(value) {
  return normalizeSeasonTitle(value).replace(/\s+/g, '-');
}
