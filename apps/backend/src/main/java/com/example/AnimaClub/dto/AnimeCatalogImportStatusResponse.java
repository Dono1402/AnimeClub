package com.example.AnimaClub.dto;

import java.time.Instant;

public record AnimeCatalogImportStatusResponse(
        boolean running,
        Integer currentPage,
        Integer totalPages,
        Long imported,
        Long skipped,
        Long failed,
        Long stored,
        String lastError,
        Instant startedAt,
        Instant finishedAt
) {
}
