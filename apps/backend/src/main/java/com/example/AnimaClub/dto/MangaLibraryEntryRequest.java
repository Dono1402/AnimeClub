package com.example.AnimaClub.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record MangaLibraryEntryRequest(
        @NotBlank
        @Size(max = 140)
        String mangaSlug,

        @NotBlank
        @Size(max = 180)
        String title,

        @Size(max = 500)
        String coverUrl,

        @NotBlank
        String status,

        @NotNull
        @Min(0)
        Integer readChapters,

        @NotNull
        @Min(0)
        Integer totalChapters,

        @NotNull
        @Min(0)
        Integer readVolumes,

        @NotNull
        @Min(0)
        Integer totalVolumes,

        @Min(0)
        @Max(10)
        Integer score,

        Boolean favorite,

        @Size(max = 1200)
        String notes,

        @Size(max = 80)
        String catalogType,

        Double catalogScore,

        @Min(0)
        Integer catalogYear,

        List<@Size(max = 120) String> catalogGenres,

        List<@Size(max = 120) String> catalogAuthors
) {
}
