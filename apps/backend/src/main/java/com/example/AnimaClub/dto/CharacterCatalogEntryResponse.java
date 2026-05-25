package com.example.AnimaClub.dto;

import java.time.Instant;
import java.util.List;

public record CharacterCatalogEntryResponse(
        Integer malId,
        String slug,
        String name,
        String nameKanji,
        String imageUrl,
        Integer favorites,
        String about,
        List<String> nicknames,
        Integer sourceAnimeMalId,
        String sourceAnimeTitle,
        String sourceAnimeSlug,
        String sourceAnimeImageUrl,
        String role,
        Instant lastSyncedAt
) {
}
