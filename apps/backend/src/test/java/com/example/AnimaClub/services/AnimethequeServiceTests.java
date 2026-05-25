package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.AnimeLibraryEntryRequest;
import com.example.AnimaClub.dto.AnimeLibraryEntryResponse;
import com.example.AnimaClub.model.AnimeCatalogEntry;
import com.example.AnimaClub.model.AnimeLibraryEntry;
import com.example.AnimaClub.model.AnimeWatchStatus;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.repository.AnimeCatalogEntryRepository;
import com.example.AnimaClub.repository.AnimeLibraryEntryRepository;
import com.example.AnimaClub.repository.CompteRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
@Transactional
class AnimethequeServiceTests {

    @Autowired
    private AnimethequeService animethequeService;

    @Autowired
    private AnimeLibraryEntryRepository animeLibraryEntryRepository;

    @Autowired
    private AnimeCatalogEntryRepository animeCatalogEntryRepository;

    @Autowired
    private CompteRepository compteRepository;

    @Test
    void seasonSaveReusesSingleSeasonSeriesEntry() {
        Compte account = account("madoka-s1");
        AnimeLibraryEntryResponse series = animethequeService.save(
                account.getId(),
                request("series-madoka", null, null, null, "SERIES", 12, 12)
        );

        AnimeLibraryEntryResponse season = animethequeService.save(
                account.getId(),
                request("mal-9756", "series-madoka", "mal-9756", 1, "SEASON", 4, 12)
        );

        List<AnimeLibraryEntry> entries = entries(account);
        assertEquals(series.id(), season.id());
        assertEquals(1, entries.size());
        assertEquals("mal-9756", entries.get(0).getAnimeSlug());
        assertEquals("mal-9756", entries.get(0).getSeasonSlug());
        assertEquals("SEASON", entries.get(0).getTrackingMode());
    }

    @Test
    void seriesSaveReusesSingleSeasonEntry() {
        Compte account = account("madoka-s2");
        AnimeLibraryEntryResponse season = animethequeService.save(
                account.getId(),
                request("mal-9756", "series-madoka", "mal-9756", 1, "SEASON", 4, 12)
        );

        AnimeLibraryEntryResponse series = animethequeService.save(
                account.getId(),
                request("series-madoka", null, null, null, "SERIES", 12, 12)
        );

        List<AnimeLibraryEntry> entries = entries(account);
        assertEquals(season.id(), series.id());
        assertEquals(1, entries.size());
        assertEquals("series-madoka", entries.get(0).getAnimeSlug());
        assertEquals(null, entries.get(0).getSeasonSlug());
        assertEquals("SERIES", entries.get(0).getTrackingMode());
    }

    @Test
    void differentSeasonsStaySeparate() {
        Compte account = account("two-seasons");

        animethequeService.save(account.getId(), request("mal-1", "series-example", "mal-1", 1, "SEASON", 12, 12));
        animethequeService.save(account.getId(), request("mal-2", "series-example", "mal-2", 2, "SEASON", 0, 13));

        assertEquals(2, entries(account).size());
    }

    @Test
    void seriesSaveDoesNotAbsorbSeasonWhenEpisodeTotalsDiffer() {
        Compte account = account("multi-season");

        animethequeService.save(account.getId(), request("mal-1", "series-example", "mal-1", 1, "SEASON", 12, 12));
        animethequeService.save(account.getId(), request("series-example", null, null, null, "SERIES", 12, 24));

        assertEquals(2, entries(account).size());
    }

    @Test
    void savePersistsScore() {
        Compte account = account("score-anime");

        AnimeLibraryEntryResponse response = animethequeService.save(
                account.getId(),
                requestWithScore("score-example", null, null, null, "SERIES", 6, 12, 8)
        );

        assertEquals(8, response.score());
        assertEquals(8, entries(account).get(0).getScore());
    }

    @Test
    void saveRejectsWatchingWithoutStartedEpisode() {
        Compte account = account("watching-zero");

        assertThrows(
                IllegalArgumentException.class,
                () -> animethequeService.save(
                        account.getId(),
                        requestWithStatus("zero-progress", null, null, null, "SERIES", "WATCHING", 0, 13, null)
                )
        );

        assertEquals(0, entries(account).size());
    }

    @Test
    void saveCompletesWatchingAtEpisodeLimit() {
        Compte account = account("watch-done");

        AnimeLibraryEntryResponse response = animethequeService.save(
                account.getId(),
                requestWithStatus("complete-progress", null, null, null, "SERIES", "WATCHING", 13, 13, null)
        );

        assertEquals(AnimeWatchStatus.COMPLETED, response.status());
        assertEquals(AnimeWatchStatus.COMPLETED, entries(account).get(0).getStatus());
    }

    @Test
    void listDisplaysLegacyWatchingAtEpisodeLimitAsCompleted() {
        Compte account = account("legacy-done");
        AnimeLibraryEntry entry = new AnimeLibraryEntry(account, "legacy-complete-progress");
        entry.setTitle("Legacy Complete Anime");
        entry.setCoverUrl("https://cdn.example.test/legacy.jpg");
        entry.setStatus(AnimeWatchStatus.WATCHING);
        entry.setWatchedEpisodes(13);
        entry.setTotalEpisodes(13);
        animeLibraryEntryRepository.save(entry);

        List<AnimeLibraryEntryResponse> responses = animethequeService.list(account.getId());

        assertEquals(AnimeWatchStatus.COMPLETED, responses.get(0).status());
    }

    @Test
    void publicListHidesEntriesWhenAnimePrivacyFlagIsFalse() {
        Compte account = account("anime-pub");
        account.setShowAnimeLibrary(false);
        compteRepository.save(account);
        animethequeService.save(account.getId(), request("always-public-anime", null, null, null, "SERIES", 6, 12));

        List<AnimeLibraryEntryResponse> responses = animethequeService.publicList(account.getId());

        assertEquals(0, responses.size());
    }

    @Test
    void listIncludesCatalogFactsWhenSlugMatchesCatalog() {
        Compte account = account("catalog-facts");
        AnimeCatalogEntry catalogEntry = catalogEntry("catalog-match", 8.72, 2024, "TV", "Action\nDrama");
        animeCatalogEntryRepository.save(catalogEntry);
        animethequeService.save(account.getId(), request("catalog-match", null, null, null, "SERIES", 6, 12));

        AnimeLibraryEntryResponse response = animethequeService.list(account.getId()).get(0);

        assertEquals(8.72, response.catalogScore());
        assertEquals(2024, response.catalogYear());
        assertEquals("TV", response.catalogType());
        assertEquals(List.of("Action", "Drama"), response.catalogGenres());
    }

    @Test
    void listIncludesCatalogFactsWhenTitleMatchesCatalogAfterSlugMisses() {
        Compte account = account("catalog-title");
        AnimeCatalogEntry catalogEntry = catalogEntry("mal-22199", 7.48, 2014, "TV", "Action\nFantasy");
        catalogEntry.setTitle("Akame ga Kill!");
        catalogEntry.setTitleEnglish("Akame ga Kill!");
        catalogEntry.setEpisodes(24);
        animeCatalogEntryRepository.save(catalogEntry);
        animethequeService.save(
                account.getId(),
                requestWithTitle("old-akame-slug", null, null, null, "SERIES", "Akame ga Kill!", 24, 24)
        );

        AnimeLibraryEntryResponse response = animethequeService.list(account.getId()).get(0);

        assertEquals(7.48, response.catalogScore());
        assertEquals(2014, response.catalogYear());
        assertEquals("TV", response.catalogType());
        assertEquals(List.of("Action", "Fantasy"), response.catalogGenres());
    }

    @Test
    void listLeavesCatalogFactsEmptyWhenNoCatalogEntryMatches() {
        Compte account = account("catalog-missing");
        animethequeService.save(account.getId(), request("missing-catalog", null, null, null, "SERIES", 6, 12));

        AnimeLibraryEntryResponse response = animethequeService.list(account.getId()).get(0);

        assertEquals(null, response.catalogScore());
        assertEquals(null, response.catalogYear());
        assertEquals(null, response.catalogType());
        assertEquals(List.of(), response.catalogGenres());
    }

    private Compte account(String pseudo) {
        return compteRepository.save(new Compte(pseudo, pseudo + "@example.test", "{noop}password"));
    }

    private List<AnimeLibraryEntry> entries(Compte account) {
        return animeLibraryEntryRepository.findByAccount_IdOrderByUpdatedAtDesc(account.getId());
    }

    private AnimeCatalogEntry catalogEntry(String slug, Double score, Integer year, String type, String genres) {
        AnimeCatalogEntry entry = new AnimeCatalogEntry(Math.abs(slug.hashCode()));
        entry.setSlug(slug);
        entry.setTitle("Catalog " + slug);
        entry.setImageUrl("https://cdn.example.test/" + slug + ".jpg");
        entry.setBackgroundUrl("");
        entry.setSynopsis("");
        entry.setType(type);
        entry.setEpisodes(12);
        entry.setStatus("Finished Airing");
        entry.setScore(score);
        entry.setRank(100);
        entry.setPopularity(100);
        entry.setSeason("spring");
        entry.setYear(year);
        entry.setGenres(genres);
        entry.setStudios("Studio Test");
        entry.setTrailerUrl("");
        entry.setLastSyncedAt(Instant.now());
        return entry;
    }

    private AnimeLibraryEntryRequest request(
            String animeSlug,
            String parentAnimeSlug,
            String seasonSlug,
            Integer seasonNumber,
            String trackingMode,
            int watchedEpisodes,
            int totalEpisodes
    ) {
        return requestWithScore(animeSlug, parentAnimeSlug, seasonSlug, seasonNumber, trackingMode, watchedEpisodes, totalEpisodes, null);
    }

    private AnimeLibraryEntryRequest requestWithScore(
            String animeSlug,
            String parentAnimeSlug,
            String seasonSlug,
            Integer seasonNumber,
            String trackingMode,
            int watchedEpisodes,
            int totalEpisodes,
            Integer score
    ) {
        String status = watchedEpisodes >= totalEpisodes ? "COMPLETED" : watchedEpisodes > 0 ? "WATCHING" : "PLANNED";
        return requestWithStatus(animeSlug, parentAnimeSlug, seasonSlug, seasonNumber, trackingMode, status, watchedEpisodes, totalEpisodes, score);
    }

    private AnimeLibraryEntryRequest requestWithTitle(
            String animeSlug,
            String parentAnimeSlug,
            String seasonSlug,
            Integer seasonNumber,
            String trackingMode,
            String title,
            int watchedEpisodes,
            int totalEpisodes
    ) {
        AnimeLibraryEntryRequest request = request(animeSlug, parentAnimeSlug, seasonSlug, seasonNumber, trackingMode, watchedEpisodes, totalEpisodes);
        return new AnimeLibraryEntryRequest(
                request.animeSlug(),
                request.parentAnimeSlug(),
                request.parentTitle(),
                request.seasonSlug(),
                request.seasonTitle(),
                request.seasonNumber(),
                request.trackingMode(),
                request.mediaType(),
                title,
                request.coverUrl(),
                request.status(),
                request.watchedEpisodes(),
                request.totalEpisodes(),
                request.score(),
                request.favorite(),
                request.notes()
        );
    }

    private AnimeLibraryEntryRequest requestWithStatus(
            String animeSlug,
            String parentAnimeSlug,
            String seasonSlug,
            Integer seasonNumber,
            String trackingMode,
            String status,
            int watchedEpisodes,
            int totalEpisodes,
            Integer score
    ) {
        return new AnimeLibraryEntryRequest(
                animeSlug,
                parentAnimeSlug,
                parentAnimeSlug == null ? null : "Example Series",
                seasonSlug,
                seasonSlug == null ? null : "Example Season",
                seasonNumber,
                trackingMode,
                "TV",
                "Example Anime",
                "https://cdn.myanimelist.net/images/anime/example.jpg",
                status,
                watchedEpisodes,
                totalEpisodes,
                score,
                false,
                ""
        );
    }
}
