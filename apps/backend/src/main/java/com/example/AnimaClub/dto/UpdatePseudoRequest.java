package com.example.AnimaClub.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdatePseudoRequest(
        @NotBlank
        @Size(min = 3, max = 16, message = "doit faire entre 3 et 16 caracteres.")
        @Pattern(regexp = "^[A-Za-z0-9_-]+$", message = "doit contenir uniquement lettres, chiffres, tirets ou underscores.")
        String pseudo
) {
}
