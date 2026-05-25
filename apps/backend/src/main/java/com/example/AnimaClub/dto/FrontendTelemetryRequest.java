package com.example.AnimaClub.dto;

public record FrontendTelemetryRequest(
        String type,
        String name,
        String route,
        String path,
        String method,
        String endpoint,
        Integer status,
        Double durationMs,
        Double value,
        String source,
        String message,
        String userAgent
) {
}
