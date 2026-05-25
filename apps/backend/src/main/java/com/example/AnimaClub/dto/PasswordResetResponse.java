package com.example.AnimaClub.dto;

public record PasswordResetResponse(
        String message,
        String resetLink
) {
}
