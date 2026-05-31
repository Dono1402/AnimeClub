package com.example.AnimaClub.dto;

import jakarta.validation.constraints.NotBlank;

public record DiscordLoginRequest(
        @NotBlank
        String code,

        @NotBlank
        String redirectUri,

        Boolean rememberSession
) {
    public boolean persistentSessionRequested() {
        return Boolean.TRUE.equals(rememberSession);
    }
}
