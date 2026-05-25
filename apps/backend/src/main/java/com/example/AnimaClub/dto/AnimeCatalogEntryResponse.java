package com.example.AnimaClub.dto;

import java.time.Instant;
import java.util.List;

public record AnimeCatalogEntryResponse(
        Integer malId,
        String slug,
        String title,
        String titleEnglish,
        String titleJapanese,
        String imageUrl,
        String backgroundUrl,
        String synopsis,
        String type,
        Integer episodes,
        String status,
        Double score,
        Integer rank,
        Integer popularity,
        String season,
        Integer year,
        List<String> genres,
        List<String> studios,
        String trailerUrl,
        Instant lastSyncedAt
) {
}
