package com.example.AnimaClub.dto;

import java.util.List;

public record CharacterCatalogPageResponse(
        List<CharacterCatalogEntryResponse> items,
        boolean hasNextPage,
        long totalItems,
        int page,
        int pageSize
) {
}
