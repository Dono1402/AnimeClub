package com.example.AnimaClub.services;

import com.example.AnimaClub.model.AnimeCatalogEntry;
import com.example.AnimaClub.repository.AnimeCatalogEntryRepository;
import com.example.AnimaClub.repository.AnimeWeeklyRankingRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AnimeCatalogServiceSearchTests {

    @Mock
    private AnimeCatalogEntryRepository animeCatalogEntryRepository;

    @Mock
    private AnimeWeeklyRankingRepository animeWeeklyRankingRepository;

    private AnimeCatalogService service;

    @AfterEach
    void tearDown() {
        if (service != null) {
            service.stop();
        }
    }

    @Test
    void listSearchesPokemonWithAccentedAlternateQuery() {
        service = service();
        AnimeCatalogEntry pokemon = anime(527, "mal-527", "Pok\u00e9mon");
        when(animeCatalogEntryRepository.searchWithFilters(
                eq("Pokemon"),
                eq("Pok\u00e9mon"),
                eq(""),
                eq(""),
                eq(""),
                isNull(),
                eq(""),
                isNull(),
                any(Pageable.class)
        )).thenReturn(new PageImpl<>(List.of(pokemon)));

        var result = service.list("Pokemon", 1, 9, "", "", "", null, "", null, "popularity-asc");

        assertThat(result.items()).extracting("malId").containsExactly(527);
    }

    @Test
    void listSearchesAccentedPokemonWithPlainAlternateQuery() {
        service = service();
        AnimeCatalogEntry pokemon = anime(527, "mal-527", "Pok\u00e9mon");
        when(animeCatalogEntryRepository.searchWithFilters(
                eq("Pok\u00e9mon"),
                eq("Pokemon"),
                eq(""),
                eq(""),
                eq(""),
                isNull(),
                eq(""),
                isNull(),
                any(Pageable.class)
        )).thenReturn(new PageImpl<>(List.of(pokemon)));

        var result = service.list("Pok\u00e9mon", 1, 9, "", "", "", null, "", null, "popularity-asc");

        assertThat(result.items()).extracting("malId").containsExactly(527);
    }

    private AnimeCatalogService service() {
        return new AnimeCatalogService(
                animeCatalogEntryRepository,
                animeWeeklyRankingRepository,
                new ObjectMapper(),
                "https://api.jikan.moe/v4/anime",
                "https://graphql.anilist.co",
                "https://kitsu.io/api/edge/anime",
                1300,
                false,
                false
        );
    }

    private AnimeCatalogEntry anime(Integer malId, String slug, String title) {
        AnimeCatalogEntry anime = new AnimeCatalogEntry(malId);
        anime.setSlug(slug);
        anime.setTitle(title);
        anime.setType("TV");
        anime.setEpisodes(276);
        anime.setStatus("Finished Airing");
        anime.setPopularity(355);
        anime.setLastSyncedAt(Instant.now());
        return anime;
    }
}
