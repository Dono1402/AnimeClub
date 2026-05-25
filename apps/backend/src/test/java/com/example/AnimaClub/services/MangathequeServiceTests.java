package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.MangaLibraryEntryRequest;
import com.example.AnimaClub.dto.MangaLibraryEntryResponse;
import com.example.AnimaClub.model.AnimeWatchStatus;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.model.MangaLibraryEntry;
import com.example.AnimaClub.repository.CompteRepository;
import com.example.AnimaClub.repository.MangaLibraryEntryRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
@Transactional
class MangathequeServiceTests {

    @Autowired
    private MangathequeService mangathequeService;

    @Autowired
    private MangaLibraryEntryRepository mangaLibraryEntryRepository;

    @Autowired
    private CompteRepository compteRepository;

    @Test
    void savePersistsVolumesAndCatalogFacts() {
        Compte account = account("manga-facts");

        MangaLibraryEntryResponse response = mangathequeService.save(
                account.getId(),
                request("manga-1", "PLANNED", 0, 12)
        );

        assertEquals(0, response.readVolumes());
        assertEquals(12, response.totalVolumes());
        assertEquals("Manga", response.catalogType());
        assertEquals(8.63, response.catalogScore());
        assertEquals(2024, response.catalogYear());
        assertEquals(List.of("Action", "Drama"), response.catalogGenres());
        assertEquals(List.of("Author One", "Author Two"), response.catalogAuthors());
    }

    @Test
    void saveRejectsWatchingWithoutStartedVolume() {
        Compte account = account("manga-zero");

        assertThrows(
                IllegalArgumentException.class,
                () -> mangathequeService.save(account.getId(), request("manga-zero", "WATCHING", 0, 12))
        );

        assertEquals(0, entries(account).size());
    }

    @Test
    void saveResetsReadVolumesForPlannedStatus() {
        Compte account = account("manga-plan");

        MangaLibraryEntryResponse response = mangathequeService.save(
                account.getId(),
                request("manga-planned-reset", "PLANNED", 6, 12)
        );

        assertEquals(AnimeWatchStatus.PLANNED, response.status());
        assertEquals(0, response.readVolumes());
        assertEquals(0, entries(account).get(0).getReadVolumes());
    }

    @Test
    void saveCompletesWatchingAtVolumeLimit() {
        Compte account = account("manga-complete");

        MangaLibraryEntryResponse response = mangathequeService.save(
                account.getId(),
                request("manga-complete", "WATCHING", 12, 12)
        );

        assertEquals(AnimeWatchStatus.COMPLETED, response.status());
        assertEquals(AnimeWatchStatus.COMPLETED, entries(account).get(0).getStatus());
    }

    @Test
    void saveCompletesAnyStatusAtVolumeLimit() {
        Compte account = account("manga-pause");

        MangaLibraryEntryResponse response = mangathequeService.save(
                account.getId(),
                request("manga-paused-complete", "PAUSED", 12, 12)
        );

        assertEquals(AnimeWatchStatus.COMPLETED, response.status());
        assertEquals(AnimeWatchStatus.COMPLETED, entries(account).get(0).getStatus());
    }

    @Test
    void listDisplaysLegacyWatchingWithoutVolumeAsPlanned() {
        Compte account = account("manga-legacy");
        MangaLibraryEntry entry = new MangaLibraryEntry(account, "manga-legacy");
        entry.setTitle("Legacy Manga");
        entry.setCoverUrl("https://cdn.example.test/manga.jpg");
        entry.setStatus(AnimeWatchStatus.WATCHING);
        entry.setReadVolumes(0);
        entry.setTotalVolumes(12);
        mangaLibraryEntryRepository.save(entry);

        MangaLibraryEntryResponse response = mangathequeService.list(account.getId()).get(0);

        assertEquals(AnimeWatchStatus.PLANNED, response.status());
    }

    @Test
    void publicListHidesEntriesWhenMangaPrivacyFlagIsFalse() {
        Compte account = account("manga-pub");
        account.setShowMangaLibrary(false);
        compteRepository.save(account);
        mangathequeService.save(account.getId(), request("always-public-manga", "PLANNED", 0, 12));

        List<MangaLibraryEntryResponse> responses = mangathequeService.publicList(account.getId());

        assertEquals(0, responses.size());
    }

    private Compte account(String pseudo) {
        return compteRepository.save(new Compte(pseudo, pseudo + "@example.test", "{noop}password"));
    }

    private List<MangaLibraryEntry> entries(Compte account) {
        return mangaLibraryEntryRepository.findByAccount_IdOrderByUpdatedAtDesc(account.getId());
    }

    private MangaLibraryEntryRequest request(String slug, String status, int readVolumes, int totalVolumes) {
        return new MangaLibraryEntryRequest(
                slug,
                "Example Manga",
                "https://cdn.example.test/manga.jpg",
                status,
                0,
                0,
                readVolumes,
                totalVolumes,
                null,
                false,
                "",
                "Manga",
                8.63,
                2024,
                List.of("Action", "Drama"),
                List.of("Author One", "Author Two")
        );
    }
}
