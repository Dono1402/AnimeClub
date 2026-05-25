package com.example.AnimaClub.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DiscordSignupRequest(
        @NotBlank
        String signupToken,

        @NotBlank
        @Size(max = 16)
        String pseudo,

        @NotBlank
        @Size(min = 8, max = 128)
        String password
) {
}
