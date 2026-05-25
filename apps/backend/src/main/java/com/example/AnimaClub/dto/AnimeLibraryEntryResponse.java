package com.example.AnimaClub.dto;

import com.example.AnimaClub.model.AnimeWatchStatus;

import java.time.Instant;
import java.util.List;

public record AnimeLibraryEntryResponse(
        Integer id,
        Integer accountId,
        String animeSlug,
        String parentAnimeSlug,
        String parentTitle,
        String seasonSlug,
        String seasonTitle,
        Integer seasonNumber,
        String trackingMode,
        String mediaType,
        String title,
        String coverUrl,
        AnimeWatchStatus status,
        Integer watchedEpisodes,
        Integer totalEpisodes,
        Integer score,
        Boolean favorite,
        String notes,
        Instant updatedAt,
        Double catalogScore,
        Integer catalogYear,
        String catalogType,
        List<String> catalogGenres
) {
}
