package com.example.AnimaClub.dto;

import java.util.List;

public record AnimeCatalogFilterOptionsResponse(
        List<String> genres,
        List<String> types,
        List<String> statuses,
        List<Integer> years
) {
}
