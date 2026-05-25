package com.example.AnimaClub.dto;

public record ChangePendingEmailResponse(
        String message,
        String confirmationLink
) {
}
