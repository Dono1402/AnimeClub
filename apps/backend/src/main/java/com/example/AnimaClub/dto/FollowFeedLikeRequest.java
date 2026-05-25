package com.example.AnimaClub.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record FollowFeedLikeRequest(
        @NotBlank String type,
        @NotNull Integer entryId
) {
}
