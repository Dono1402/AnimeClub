package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.TranslationResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class TranslationService {

    private static final int MAX_TEXT_LENGTH = 5000;
    private static final int MAX_CACHE_ENTRIES = 2_000;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String googleTranslateUrl;
    private final String myMemoryTranslateUrl;
    private final Map<String, TranslationResponse> cache = new ConcurrentHashMap<>();

    @Autowired
    public TranslationService(
            ObjectMapper objectMapper,
            @Value("${app.translation.google-url:https://translate.googleapis.com/translate_a/single}") String googleTranslateUrl,
            @Value("${app.translation.mymemory-url:https://api.mymemory.translated.net/get}") String myMemoryTranslateUrl
    ) {
        this(
                objectMapper,
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(8))
                        .followRedirects(HttpClient.Redirect.NORMAL)
                        .build(),
                googleTranslateUrl,
                myMemoryTranslateUrl
        );
    }

    TranslationService(
            ObjectMapper objectMapper,
            HttpClient httpClient,
            String googleTranslateUrl,
            String myMemoryTranslateUrl
    ) {
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
        this.googleTranslateUrl = googleTranslateUrl;
        this.myMemoryTranslateUrl = myMemoryTranslateUrl;
    }

    public TranslationResponse translate(String text, String sourceLanguage, String targetLanguage) {
        String cleanText = normalizeText(text);
        String source = normalizeLanguage(sourceLanguage);
        String target = normalizeLanguage(targetLanguage);
        if (cleanText.isBlank() || source.equals(target)) {
            return new TranslationResponse(cleanText, "original");
        }

        String cacheKey = source + ':' + target + ':' + cleanText;
        TranslationResponse cached = cache.get(cacheKey);
        if (cached != null) {
            return cached;
        }

        TranslationResponse translated = translateWithGoogle(cleanText, source, target);
        if (translated == null) {
            translated = translateWithMyMemory(cleanText, source, target);
        }
        if (translated == null) {
            throw new IllegalStateException("Translation providers are temporarily unavailable.");
        }

        if (cache.size() >= MAX_CACHE_ENTRIES) {
            cache.clear();
        }
        cache.put(cacheKey, translated);
        return translated;
    }

    private TranslationResponse translateWithGoogle(String text, String source, String target) {
        URI uri = URI.create(googleTranslateUrl
                + "?client=gtx&dt=t&sl=" + encode(source)
                + "&tl=" + encode(target)
                + "&q=" + encode(text));
        JsonNode response = requestJson(uri);
        if (response == null || !response.isArray() || !response.path(0).isArray()) {
            return null;
        }

        StringBuilder translation = new StringBuilder();
        for (JsonNode segment : response.path(0)) {
            if (segment.isArray() && segment.path(0).isTextual()) {
                translation.append(segment.path(0).asText());
            }
        }

        String translatedText = translation.toString().trim();
        return isUsableTranslation(translatedText, text)
                ? new TranslationResponse(translatedText, "google")
                : null;
    }

    private TranslationResponse translateWithMyMemory(String text, String source, String target) {
        URI uri = URI.create(myMemoryTranslateUrl
                + "?langpair=" + encode(source + '|' + target)
                + "&q=" + encode(text));
        JsonNode response = requestJson(uri);
        if (response == null || response.path("responseStatus").asInt(200) >= 400) {
            return null;
        }

        String translatedText = HtmlUtils.htmlUnescape(response.path("responseData").path("translatedText").asText("")).trim();
        return isUsableTranslation(translatedText, text)
                ? new TranslationResponse(translatedText, "mymemory")
                : null;
    }

    private JsonNode requestJson(URI uri) {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(12))
                .header("Accept", "application/json")
                .header("User-Agent", "AnimeClub/1.0")
                .GET()
                .build();

        try {
            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return null;
            }
            return objectMapper.readTree(response.body());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return null;
        } catch (IOException | IllegalArgumentException exception) {
            return null;
        }
    }

    private boolean isUsableTranslation(String translatedText, String originalText) {
        if (translatedText.isBlank()) {
            return false;
        }

        String normalizedTranslation = translatedText.toLowerCase(Locale.ROOT);
        if (normalizedTranslation.contains("mymemory warning")
                || normalizedTranslation.contains("available free translations")
                || normalizedTranslation.contains("quota")) {
            return false;
        }

        boolean longSentence = originalText.matches(".*[.!?].*") || originalText.split("\\s+").length >= 5;
        return !longSentence || !normalizeForComparison(translatedText).equals(normalizeForComparison(originalText));
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

    private String normalizeForComparison(String text) {
        return text.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
