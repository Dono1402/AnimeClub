package com.example.AnimaClub.dto;

import java.time.Instant;

public record AccountNotificationResponse(
        Integer id,
        String type,
        PublicProfileResponse actor,
        Boolean read,
        Instant createdAt
) {
}
