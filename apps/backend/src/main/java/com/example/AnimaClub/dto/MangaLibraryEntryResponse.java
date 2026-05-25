package com.example.AnimaClub.dto;

import com.example.AnimaClub.model.AnimeWatchStatus;

import java.time.Instant;
import java.util.List;

public record MangaLibraryEntryResponse(
        Integer id,
        Integer accountId,
        String mangaSlug,
        String title,
        String coverUrl,
        AnimeWatchStatus status,
        Integer readChapters,
        Integer totalChapters,
        Integer readVolumes,
        Integer totalVolumes,
        Integer score,
        Boolean favorite,
        String notes,
        Instant updatedAt,
        String catalogType,
        Double catalogScore,
        Integer catalogYear,
        List<String> catalogGenres,
        List<String> catalogAuthors
) {
}
