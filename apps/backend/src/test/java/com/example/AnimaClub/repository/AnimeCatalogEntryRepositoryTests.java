package com.example.AnimaClub.repository;

import com.example.AnimaClub.model.AnimeCatalogEntry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class AnimeCatalogEntryRepositoryTests {

    @Autowired
    private AnimeCatalogEntryRepository repository;

    @Test
    void searchMatchesHyphenatedTitlesWithSpaceSeparatedQuery() {
        AnimeCatalogEntry onePunchMan = anime(30276, "mal-30276", "One-Punch Man", 4);
        AnimeCatalogEntry special = anime(31772, "mal-31772", "One Punch Man Specials", 798);
        repository.save(onePunchMan);
        repository.save(special);

        var results = repository.search(
                "one punch",
                "",
                PageRequest.of(0, 5, Sort.by("popularity").ascending())
        );

        assertThat(results.getContent())
                .extracting(AnimeCatalogEntry::getMalId)
                .contains(30276);
    }

    @Test
    void filteredSearchMatchesHyphenatedTitlesWithSpaceSeparatedQuery() {
        repository.save(anime(30276, "mal-30276", "One-Punch Man", 4));

        var results = repository.searchWithFilters(
                "one punch",
                "",
                "",
                "tv",
                "",
                null,
                "",
                null,
                PageRequest.of(0, 5, Sort.by("popularity").ascending())
        );

        assertThat(results.getContent())
                .extracting(AnimeCatalogEntry::getMalId)
                .containsExactly(30276);
    }

    private AnimeCatalogEntry anime(Integer malId, String slug, String title, Integer popularity) {
        AnimeCatalogEntry anime = new AnimeCatalogEntry(malId);
        anime.setSlug(slug);
        anime.setTitle(title);
        anime.setType("TV");
        anime.setPopularity(popularity);
        anime.setLastSyncedAt(Instant.now());
        return anime;
    }
}
