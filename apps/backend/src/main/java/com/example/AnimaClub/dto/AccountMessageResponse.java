package com.example.AnimaClub.dto;

import java.time.Instant;

public record AccountMessageResponse(
        Integer id,
        PublicProfileResponse sender,
        PublicProfileResponse recipient,
        Boolean own,
        String content,
        String imageUrl,
        Boolean read,
        Instant createdAt
) {
}
