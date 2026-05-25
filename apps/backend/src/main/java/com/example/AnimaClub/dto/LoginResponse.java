package com.example.AnimaClub.dto;

import java.time.Instant;

public record LoginResponse(
        AccountResponse account,
        String sessionToken,
        Instant expiresAt
) {
}
