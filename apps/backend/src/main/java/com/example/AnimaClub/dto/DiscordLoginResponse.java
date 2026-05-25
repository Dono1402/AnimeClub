package com.example.AnimaClub.dto;

import java.time.Instant;

public record DiscordLoginResponse(
        String mode,
        LoginResponse login,
        String signupToken,
        String email,
        String suggestedPseudo,
        Instant expiresAt,
        String message
) {
    public static DiscordLoginResponse login(LoginResponse login) {
        return new DiscordLoginResponse("login", login, null, null, null, null, null);
    }

    public static DiscordLoginResponse signupRequired(
            String signupToken,
            String email,
            String suggestedPseudo,
            Instant expiresAt,
            String message
    ) {
        return new DiscordLoginResponse("signupRequired", null, signupToken, email, suggestedPseudo, expiresAt, message);
    }
}
