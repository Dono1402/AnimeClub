package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.TranslationResponse;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
public class TranslationService {

    private static final int MAX_TEXT_LENGTH = 5000;

    public TranslationResponse translate(String text, String sourceLanguage, String targetLanguage) {
        String cleanText = normalizeText(text);
        String source = normalizeLanguage(sourceLanguage);
        String target = normalizeLanguage(targetLanguage);
        if (cleanText.isBlank() || source.equals(target)) {
            return new TranslationResponse(cleanText, "original");
        }

        throw new IllegalStateException("No backend translation provider is configured.");
    }

    private String normalizeText(String text) {
        String cleanText = text == null ? "" : text.trim().replaceAll("[ \\t]+", " ");
        return cleanText.length() > MAX_TEXT_LENGTH ? cleanText.substring(0, MAX_TEXT_LENGTH) : cleanText;
    }

    private String normalizeLanguage(String language) {
        String cleanLanguage = language == null ? "" : language.trim().toLowerCase(Locale.ROOT);
        return switch (cleanLanguage) {
            case "fr", "fr-fr", "french" -> "fr";
            case "en", "en-us", "en-gb", "english" -> "en";
            default -> cleanLanguage.isBlank() ? "en" : cleanLanguage;
        };
    }
}
