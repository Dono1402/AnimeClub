package com.example.AnimaClub.dto;

import java.util.List;

public record AnimeCatalogPageResponse(
        List<AnimeCatalogEntryResponse> items,
        boolean hasNextPage,
        long totalItems,
        int page,
        int pageSize
) {
}
