package com.example.AnimaClub.dto;

import jakarta.validation.constraints.Min;

public record StartAnimeCatalogImportRequest(
        @Min(1)
        Integer maxPages
) {
}
