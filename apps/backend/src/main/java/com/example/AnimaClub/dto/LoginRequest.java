package com.example.AnimaClub.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank
        String pseudo,

        @NotBlank
        String password,

        Boolean rememberSession
) {
    public boolean persistentSessionRequested() {
        return Boolean.TRUE.equals(rememberSession);
    }
}
