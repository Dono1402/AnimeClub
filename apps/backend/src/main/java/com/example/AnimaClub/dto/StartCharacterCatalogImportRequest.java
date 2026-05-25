package com.example.AnimaClub.dto;

import jakarta.validation.constraints.Min;

public record StartCharacterCatalogImportRequest(
        @Min(1)
        Integer maxPages,
        @Min(1)
        Integer startPage,
        Boolean reset,
        Boolean retryErrors,
        Boolean globalCatalog
) {
}
