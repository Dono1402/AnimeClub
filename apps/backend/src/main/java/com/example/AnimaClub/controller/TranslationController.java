package com.example.AnimaClub.controller;

import com.example.AnimaClub.dto.TranslationRequest;
import com.example.AnimaClub.dto.TranslationResponse;
import com.example.AnimaClub.services.TranslationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/translation")
public class TranslationController {

    private final TranslationService translationService;

    public TranslationController(TranslationService translationService) {
        this.translationService = translationService;
    }

    @PostMapping
    public TranslationResponse translate(@Valid @RequestBody TranslationRequest request) {
        return translationService.translate(request.text(), request.sourceLanguage(), request.targetLanguage());
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleUnavailable(IllegalStateException exception) {
        return ResponseEntity
                .status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("message", exception.getMessage()));
    }
}
