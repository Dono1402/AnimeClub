package com.example.AnimaClub.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AnimeLibraryEntryRequest(
        @NotBlank
        @Size(max = 140)
        String animeSlug,

        @Size(max = 140)
        String parentAnimeSlug,

        @Size(max = 180)
        String parentTitle,

        @Size(max = 140)
        String seasonSlug,

        @Size(max = 180)
        String seasonTitle,

        @Min(1)
        Integer seasonNumber,

        @Size(max = 20)
        String trackingMode,

        @Size(max = 40)
        String mediaType,

        @NotBlank
        @Size(max = 180)
        String title,

        @Size(max = 500)
        String coverUrl,

        @NotBlank
        String status,

        @NotNull
        @Min(0)
        Integer watchedEpisodes,

        @NotNull
        @Min(0)
        Integer totalEpisodes,

        @Min(0)
        @Max(10)
        Integer score,

        Boolean favorite,

        @Size(max = 1200)
        String notes
) {
}
