package com.example.AnimaClub.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TranslationRequest(
        @NotBlank
        @Size(max = 5000)
        String text,

        @NotBlank
        @Size(max = 8)
        String sourceLanguage,

        @NotBlank
        @Size(max = 8)
        String targetLanguage
) {
}
