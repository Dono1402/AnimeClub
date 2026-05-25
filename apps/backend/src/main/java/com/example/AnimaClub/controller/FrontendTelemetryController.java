package com.example.AnimaClub.controller;

import com.example.AnimaClub.dto.FrontendTelemetryRequest;
import com.example.AnimaClub.services.FrontendTelemetryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/telemetry/frontend")
public class FrontendTelemetryController {

    private final FrontendTelemetryService frontendTelemetryService;

    public FrontendTelemetryController(FrontendTelemetryService frontendTelemetryService) {
        this.frontendTelemetryService = frontendTelemetryService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Boolean>> record(@RequestBody FrontendTelemetryRequest request) {
        frontendTelemetryService.record(request);
        return ResponseEntity.accepted().body(Map.of("accepted", true));
    }
}
