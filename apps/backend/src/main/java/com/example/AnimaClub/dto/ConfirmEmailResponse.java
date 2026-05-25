package com.example.AnimaClub.dto;

public record ConfirmEmailResponse(
        AccountResponse account,
        String message
) {
}
