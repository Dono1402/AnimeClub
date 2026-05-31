package com.example.AnimaClub.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record DiscordSignupRequest(
        @NotBlank
        String signupToken,

        @NotBlank
        @Size(min = 3, max = 16)
        @Pattern(regexp = "^[A-Za-z0-9_-]+$", message = "doit contenir uniquement lettres, chiffres, tirets ou underscores.")
        String pseudo,

        @NotBlank
        @Size(min = 8, max = 128)
        String password
) {
}
