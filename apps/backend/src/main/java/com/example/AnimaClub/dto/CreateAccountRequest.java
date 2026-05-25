package com.example.AnimaClub.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateAccountRequest(
        @NotBlank
        @Size(max = 16, message = "doit faire 16 caracteres maximum.")
        String pseudo,

        @NotBlank
        @Email
        @Size(max = 255)
        String mail,

        @NotBlank
        @Size(min = 8, max = 128)
        String password
) {
}
