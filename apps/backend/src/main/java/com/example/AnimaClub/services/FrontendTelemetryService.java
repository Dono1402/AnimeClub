package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.FrontendTelemetryRequest;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Locale;

@Service
public class FrontendTelemetryService {

    private static final int TAG_MAX_LENGTH = 80;
    private static final int MESSAGE_MAX_LENGTH = 120;
    private final MeterRegistry meterRegistry;

    public FrontendTelemetryService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    public void record(FrontendTelemetryRequest request) {
        if (request == null) {
            return;
        }

        String type = cleanTag(request.type(), "unknown").toLowerCase(Locale.ROOT);
        switch (type) {
            case "api" -> recordApi(request);
            case "error" -> recordError(request);
            case "web_vital" -> recordWebVital(request);
            case "page_view" -> recordPageView(request);
            default -> recordCustom(type, request);
        }
    }

    private void recordPageView(FrontendTelemetryRequest request) {
        Counter.builder("animaclub.frontend.page.views")
                .description("Pages vues cote navigateur")
                .tag("route", cleanTag(request.route(), "unknown"))
                .tag("path", cleanTag(request.path(), "unknown"))
                .register(meterRegistry)
                .increment();
    }

    private void recordApi(FrontendTelemetryRequest request) {
        String method = cleanTag(request.method(), "GET").toUpperCase(Locale.ROOT);
        String endpoint = cleanTag(request.endpoint(), "unknown");
        String status = request.status() == null ? "0" : String.valueOf(request.status());
        double durationMs = positive(request.durationMs());

        Counter.builder("animaclub.frontend.api.requests")
                .description("Requetes API declenchees par le frontend")
                .tag("method", method)
                .tag("endpoint", endpoint)
                .tag("status", status)
                .register(meterRegistry)
                .increment();

        Timer.builder("animaclub.frontend.api.request.duration")
                .description("Temps des requetes API mesure cote navigateur")
                .tag("method", method)
                .tag("endpoint", endpoint)
                .tag("status", status)
                .register(meterRegistry)
                .record(Duration.ofMillis(Math.round(durationMs)));
    }

    private void recordError(FrontendTelemetryRequest request) {
        Counter.builder("animaclub.frontend.errors")
                .description("Erreurs JavaScript cote navigateur")
                .tag("source", cleanTag(request.source(), "window"))
                .tag("name", cleanTag(request.name(), "Error"))
                .tag("route", cleanTag(request.route(), "unknown"))
                .tag("message", cleanMessage(request.message()))
                .register(meterRegistry)
                .increment();
    }

    private void recordWebVital(FrontendTelemetryRequest request) {
        DistributionSummary.builder("animaclub.frontend.web.vital")
                .description("Mesures navigateur cote frontend")
                .tag("name", cleanTag(request.name(), "unknown"))
                .tag("route", cleanTag(request.route(), "unknown"))
                .register(meterRegistry)
                .record(positive(request.value()));
    }

    private void recordCustom(String type, FrontendTelemetryRequest request) {
        Counter.builder("animaclub.frontend.events")
                .description("Evenements frontend generiques")
                .tag("type", cleanTag(type, "unknown"))
                .tag("name", cleanTag(request.name(), "unknown"))
                .tag("route", cleanTag(request.route(), "unknown"))
                .register(meterRegistry)
                .increment();
    }

    private double positive(Double value) {
        if (value == null || value.isNaN() || value.isInfinite()) {
            return 0;
        }

        return Math.max(0, value);
    }

    private String cleanTag(String value, String fallback) {
        String cleaned = value == null ? "" : value.trim();
        if (cleaned.isBlank()) {
            cleaned = fallback;
        }

        cleaned = cleaned
                .replaceAll("\\?.*$", "")
                .replaceAll("\\s+", "_")
                .replaceAll("[^a-zA-Z0-9_./:{}-]", "_");

        return cleaned.length() > TAG_MAX_LENGTH ? cleaned.substring(0, TAG_MAX_LENGTH) : cleaned;
    }

    private String cleanMessage(String value) {
        String cleaned = cleanTag(value, "unknown");
        return cleaned.length() > MESSAGE_MAX_LENGTH ? cleaned.substring(0, MESSAGE_MAX_LENGTH) : cleaned;
    }
}
