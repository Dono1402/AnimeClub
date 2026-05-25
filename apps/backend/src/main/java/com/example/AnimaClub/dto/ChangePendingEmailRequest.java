package com.example.AnimaClub.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePendingEmailRequest(
        @NotBlank
        @Size(max = 255)
        String identifier,

        @NotBlank
        @Size(min = 8, max = 128)
        String password,

        @NotBlank
        @Email
        @Size(max = 255)
        String mail
) {
}
