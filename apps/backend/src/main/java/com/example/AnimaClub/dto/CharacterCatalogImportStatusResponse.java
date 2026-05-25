package com.example.AnimaClub.dto;

import java.time.Instant;

public record CharacterCatalogImportStatusResponse(
        boolean running,
        Integer currentPage,
        Integer totalPages,
        Long imported,
        Long skipped,
        Long failed,
        Long stored,
        Long linked,
        Long scannedExisting,
        Long totalAnime,
        Long syncedAnime,
        Long pendingAnime,
        Long apiTotalCharacters,
        Long pendingGlobalCharacters,
        String mode,
        String lastError,
        Instant startedAt,
        Instant finishedAt,
        boolean retryMode
) {
}
