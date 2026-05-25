package com.example.AnimaClub.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdatePseudoRequest(
        @NotBlank
        @Size(max = 16, message = "doit faire 16 caracteres maximum.")
        String pseudo
) {
}
