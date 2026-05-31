package com.example.AnimaClub.dto;

import java.time.Instant;

public record LoginResponse(
        AccountResponse account,
        String sessionToken,
        Instant expiresAt
) {
    public LoginResponse withoutSessionToken() {
        return new LoginResponse(account, null, expiresAt);
    }
}
