package com.example.AnimaClub.dto;

public record CreateAccountResponse(
        AccountResponse account,
        String confirmationLink
) {
}
