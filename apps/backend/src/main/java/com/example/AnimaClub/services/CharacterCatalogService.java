package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.CharacterCatalogEntryResponse;
import com.example.AnimaClub.dto.CharacterCatalogImportStatusResponse;
import com.example.AnimaClub.dto.CharacterCatalogPageResponse;
import com.example.AnimaClub.model.AnimeCharacterAppearance;
import com.example.AnimaClub.model.AnimeCatalogEntry;
import com.example.AnimaClub.model.CharacterCatalogEntry;
import com.example.AnimaClub.repository.AnimeCharacterAppearanceRepository;
import com.example.AnimaClub.repository.AnimeCatalogEntryRepository;
import com.example.AnimaClub.repository.CharacterCatalogEntryRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class CharacterCatalogService {

    private static final int DEFAULT_PAGE_SIZE = 24;
    private static final int MAX_PAGE_SIZE = 100;
    private static final int ANIME_BATCH_SIZE = 20;
    private static final int LOCAL_SCAN_PAGE_SIZE = 1000;
    private static final int GLOBAL_CHARACTER_PAGE_SIZE = 25;
    private static final int TOP_CHARACTER_CACHE_LIMIT = 25;
    private static final int CHARACTER_REQUEST_TIMEOUT_SECONDS = 8;
    private static final int RETRY_RATE_LIMIT_ATTEMPTS = 2;
    private static final int RETRY_RATE_LIMIT_DELAY_MILLIS = 6000;
    private static final int MIN_IMPORT_DELAY_MILLIS = 350;
    private static final Duration TOP_CHARACTER_CACHE_TTL = Duration.ofMinutes(15);
    private static final String LIST_SEPARATOR = "\n";

    private final AnimeCatalogEntryRepository animeCatalogEntryRepository;
    private final CharacterCatalogEntryRepository characterCatalogEntryRepository;
    private final AnimeCharacterAppearanceRepository animeCharacterAppearanceRepository;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final ExecutorService importExecutor;
    private final String jikanAnimeUrl;
    private final String jikanCharactersUrl;
    private final String jikanTopCharactersUrl;
    private final int importDelayMillis;

    private final AtomicBoolean importRunning = new AtomicBoolean(false);
    private volatile Integer currentPage = 0;
    private volatile Integer totalPages = 0;
    private volatile Long imported = 0L;
    private volatile Long skipped = 0L;
    private volatile Long failed = 0L;
    private volatile Long linked = 0L;
    private volatile Long scannedExisting = 0L;
    private volatile Long apiTotalCharacters = 0L;
    private volatile String lastError = "";
    private volatile Instant startedAt;
    private volatile Instant finishedAt;
    private volatile boolean retryMode = false;
    private volatile String importMode = "anime-links";
    private volatile List<CharacterCatalogEntryResponse> topCharacterCache = List.of();
    private volatile Instant topCharacterCacheUpdatedAt;

    public CharacterCatalogService(
            AnimeCatalogEntryRepository animeCatalogEntryRepository,
            CharacterCatalogEntryRepository characterCatalogEntryRepository,
            AnimeCharacterAppearanceRepository animeCharacterAppearanceRepository,
            ObjectMapper objectMapper,
            @Value("${app.jikan.anime-url:https://api.jikan.moe/v4/anime}") String jikanAnimeUrl,
            @Value("${app.jikan.characters-url:https://api.jikan.moe/v4/characters}") String jikanCharactersUrl,
            @Value("${app.jikan.top-characters-url:https://api.jikan.moe/v4/top/characters}") String jikanTopCharactersUrl,
            @Value("${app.jikan.character-import-delay-ms:${app.jikan.import-delay-ms:1300}}") int importDelayMillis
    ) {
        this.animeCatalogEntryRepository = animeCatalogEntryRepository;
        this.characterCatalogEntryRepository = characterCatalogEntryRepository;
        this.animeCharacterAppearanceRepository = animeCharacterAppearanceRepository;
        this.objectMapper = objectMapper;
        this.jikanAnimeUrl = jikanAnimeUrl;
        this.jikanCharactersUrl = jikanCharactersUrl;
        this.jikanTopCharactersUrl = jikanTopCharactersUrl;
        this.importDelayMillis = Math.max(MIN_IMPORT_DELAY_MILLIS, importDelayMillis);
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.importExecutor = Executors.newSingleThreadExecutor(new ImportThreadFactory());
    }

    public CharacterCatalogPageResponse list(String query, int page, int pageSize) {
        int cleanPage = Math.max(1, page);
        int cleanPageSize = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE));
        String cleanQuery = normalizeQuery(query);
        if (cleanQuery.isBlank() && cleanPage == 1) {
            topCharactersFromJikan(Math.min(cleanPageSize, TOP_CHARACTER_CACHE_LIMIT));
        }

        Page<CharacterCatalogEntry> result = characterCatalogEntryRepository.search(
                cleanQuery,
                PageRequest.of(cleanPage - 1, cleanPageSize, popularFirstSort())
        );

        return new CharacterCatalogPageResponse(
                result.getContent().stream().map(this::toResponse).toList(),
                result.hasNext(),
                result.getTotalElements(),
                cleanPage,
                cleanPageSize
        );
    }

    public List<CharacterCatalogEntryResponse> popular(int limit) {
        int cleanLimit = Math.max(1, Math.min(limit, MAX_PAGE_SIZE));
        List<CharacterCatalogEntryResponse> topCharacters = topCharactersFromJikan(cleanLimit);
        if (!topCharacters.isEmpty()) {
            return topCharacters;
        }

        return localPopular(cleanLimit);
    }

    private List<CharacterCatalogEntryResponse> localPopular(int limit) {
        return characterCatalogEntryRepository
                .search("", PageRequest.of(0, limit, popularFirstSort()))
                .getContent()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public List<CharacterCatalogEntryResponse> suggestions(String query, int limit) {
        int cleanLimit = Math.max(1, Math.min(limit, MAX_PAGE_SIZE));
        String cleanQuery = normalizeQuery(query);
        if (cleanQuery.length() < 2) {
            return List.of();
        }

        return characterCatalogEntryRepository
                .search(cleanQuery, PageRequest.of(0, cleanLimit, popularFirstSort()))
                .getContent()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    private Sort popularFirstSort() {
        return Sort.by(
                Sort.Order.desc("favorites").nullsLast(),
                Sort.Order.asc("name")
        );
    }

    public List<CharacterCatalogEntryResponse> charactersForAnime(Integer animeMalId, int limit) {
        if (animeMalId == null || animeMalId <= 0) {
            return List.of();
        }

        int cleanLimit = Math.max(1, Math.min(limit, MAX_PAGE_SIZE));
        Sort mainCharactersFirst = Sort.by(
                Sort.Order.asc("role"),
                Sort.Order.asc("characterMalId")
        );
        List<AnimeCharacterAppearance> appearances = animeCharacterAppearanceRepository
                .findByAnimeMalId(animeMalId, PageRequest.of(0, cleanLimit, mainCharactersFirst));

        if (appearances.isEmpty()) {
            return characterCatalogEntryRepository
                    .findBySourceAnimeMalId(animeMalId, PageRequest.of(0, cleanLimit, Sort.by(
                            Sort.Order.asc("role"),
                            Sort.Order.desc("favorites"),
                            Sort.Order.asc("name")
                    )))
                    .stream()
                    .map(this::toResponse)
                    .toList();
        }

        Map<Integer, CharacterCatalogEntry> charactersByMalId = characterCatalogEntryRepository
                .findByMalIdIn(appearances.stream().map(AnimeCharacterAppearance::getCharacterMalId).toList())
                .stream()
                .collect(Collectors.toMap(CharacterCatalogEntry::getMalId, character -> character));

        return appearances.stream()
                .map(appearance -> toResponse(charactersByMalId.get(appearance.getCharacterMalId()), appearance))
                .filter(response -> response != null && hasDisplayImageUrl(response.imageUrl()))
                .toList();
    }

    public CharacterCatalogEntryResponse findByMalId(Integer malId) {
        return characterCatalogEntryRepository.findByMalId(malId)
                .map(this::toResponse)
                .orElse(null);
    }

    public CharacterCatalogEntryResponse findBySlug(String slug) {
        return characterCatalogEntryRepository.findBySlug(slug)
                .map(this::toResponse)
                .orElse(null);
    }

    public CharacterCatalogImportStatusResponse startAnimeLinkImport(Integer maxPages, boolean resetCatalog, boolean retryErrors) {
        return startImport(maxPages, resetCatalog, retryErrors, "anime-links", () -> runAnimeLinkImport(maxPages, retryErrors));
    }

    public CharacterCatalogImportStatusResponse startGlobalImport(Integer maxPages, Integer startPage, boolean resetCatalog, boolean retryErrors) {
        return startImport(maxPages, resetCatalog, retryErrors, "global", () -> runGlobalCharacterImport(maxPages, startPage, retryErrors));
    }

    private CharacterCatalogImportStatusResponse startImport(
            Integer maxPages,
            boolean resetCatalog,
            boolean retryErrors,
            String mode,
            Runnable task
    ) {
        if (!importRunning.compareAndSet(false, true)) {
            return status();
        }

        currentPage = 0;
        totalPages = 0;
        imported = 0L;
        skipped = 0L;
        failed = 0L;
        linked = 0L;
        scannedExisting = 0L;
        lastError = "";
        startedAt = Instant.now();
        finishedAt = null;
        retryMode = retryErrors;
        importMode = mode;

        if (resetCatalog) {
            try {
                animeCharacterAppearanceRepository.deleteAllInBatch();
                characterCatalogEntryRepository.deleteAllInBatch();
                animeCatalogEntryRepository.clearCharacterSyncState();
            } catch (Exception exception) {
                failed++;
                lastError = "Impossible de vider l'ancien catalogue personnages : " + readableMessage(exception);
                finishedAt = Instant.now();
                importRunning.set(false);
                return status();
            }
        }

        importExecutor.submit(task);
        return status();
    }

    public CharacterCatalogImportStatusResponse status() {
        return new CharacterCatalogImportStatusResponse(
                importRunning.get(),
                currentPage,
                totalPages,
                imported,
                skipped,
                failed,
                characterCatalogEntryRepository.count(),
                linked,
                scannedExisting,
                safeCount(animeCatalogEntryRepository::countByMalIdIsNotNull),
                safeCount(animeCatalogEntryRepository::countByMalIdIsNotNullAndCharactersSyncedAtIsNotNull),
                safeCount(animeCatalogEntryRepository::countByMalIdIsNotNullAndCharactersSyncedAtIsNull),
                apiTotalCharacters,
                pendingGlobalCharacters(),
                importMode,
                lastError,
                startedAt,
                finishedAt,
                retryMode
        );
    }

    @PreDestroy
    public void stop() {
        importExecutor.shutdownNow();
    }

    private void runAnimeLinkImport(Integer maxPages, boolean retryErrors) {
        try {
            scanExistingCharacterLinks();

            long missingAnimeCount = animeCatalogEntryRepository.countByMalIdIsNotNullAndCharactersSyncedAtIsNull();
            if (missingAnimeCount <= 0) {
                lastError = "";
                return;
            }

            int animeLimit = maxPages == null
                    ? Math.toIntExact(Math.min(missingAnimeCount, Integer.MAX_VALUE))
                    : Math.min(Math.toIntExact(Math.min(missingAnimeCount, Integer.MAX_VALUE)), Math.max(1, maxPages) * ANIME_BATCH_SIZE);
            List<AnimeCatalogEntry> remainingAnimes = animeCatalogEntryRepository.findByMalIdIsNotNullAndCharactersSyncedAtIsNull(
                    PageRequest.of(0, animeLimit, animeImportSort())
            );
            totalPages = Math.max(1, (int) Math.ceil(remainingAnimes.size() / (double) ANIME_BATCH_SIZE));

            for (int offset = 0; offset < remainingAnimes.size() && !Thread.currentThread().isInterrupted(); offset += ANIME_BATCH_SIZE) {
                currentPage = (offset / ANIME_BATCH_SIZE) + 1;
                importAnimeCharacters(
                        remainingAnimes.subList(offset, Math.min(offset + ANIME_BATCH_SIZE, remainingAnimes.size())),
                        retryErrors
                );
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            lastError = "Import personnages interrompu.";
        } catch (Exception exception) {
            failed++;
            lastError = readableMessage(exception);
        } finally {
            finishedAt = Instant.now();
            retryMode = false;
            importRunning.set(false);
        }
    }

    private void runGlobalCharacterImport(Integer maxPages, Integer startPage, boolean retryErrors) {
        try {
            JsonNode firstPage = fetchGlobalCharactersPage(1, retryErrors);
            JsonNode pagination = firstPage.get("pagination");
            JsonNode items = pagination == null ? null : pagination.get("items");
            apiTotalCharacters = longValue(items, "total", apiTotalCharacters);

            int lastVisiblePage = Math.max(1, intValue(pagination, "last_visible_page", 1));
            int firstImportPage = Math.min(lastVisiblePage, Math.max(1, startPage == null ? 1 : startPage));
            int pageLimit = maxPages == null
                    ? lastVisiblePage
                    : Math.min(lastVisiblePage, firstImportPage + Math.max(1, maxPages) - 1);
            totalPages = pageLimit;

            if (firstImportPage == 1) {
                importGlobalCharacters(1, firstPage);
            } else {
                currentPage = firstImportPage - 1;
            }

            if (firstImportPage < pageLimit) {
                sleepBetweenRequests();
            }

            for (int page = Math.max(2, firstImportPage); page <= pageLimit && !Thread.currentThread().isInterrupted(); page++) {
                currentPage = page;
                boolean requestSucceeded = false;
                try {
                    JsonNode pageBody = fetchGlobalCharactersPage(page, retryErrors);
                    requestSucceeded = true;
                    importGlobalCharacters(page, pageBody);
                } catch (InterruptedException exception) {
                    throw exception;
                } catch (Exception exception) {
                    failed++;
                    lastError = "Page personnages Jikan " + page + " : " + readableMessage(exception);
                    if (isRateLimitException(exception)) {
                        sleepAfterRateLimit();
                    }
                }

                if (requestSucceeded) {
                    sleepBetweenRequests();
                }
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            lastError = "Import global personnages interrompu.";
        } catch (Exception exception) {
            failed++;
            lastError = readableMessage(exception);
        } finally {
            finishedAt = Instant.now();
            retryMode = false;
            importRunning.set(false);
        }
    }

    private Sort animeImportSort() {
        return Sort.by(
                Sort.Order.asc("popularity"),
                Sort.Order.asc("title"),
                Sort.Order.asc("malId")
        );
    }

    private void scanExistingCharacterLinks() {
        Instant now = Instant.now();
        int page = 0;
        Page<CharacterCatalogEntry> entries;
        do {
            entries = characterCatalogEntryRepository.findMissingSourceAnimeAppearances(
                    PageRequest.of(page, LOCAL_SCAN_PAGE_SIZE, Sort.by("malId").ascending())
            );

            scannedExisting += entries.getNumberOfElements();
            for (CharacterCatalogEntry entry : entries.getContent()) {
                if (linkExistingSourceCharacter(entry, now)) {
                    linked++;
                }
            }

            page++;
        } while (entries.hasNext() && !Thread.currentThread().isInterrupted());

        animeCatalogEntryRepository.markEntriesWithCharacterAppearancesAsSynced(now);
    }

    private void importAnimeCharacters(List<AnimeCatalogEntry> animes, boolean retryErrors) throws InterruptedException {
        for (AnimeCatalogEntry anime : animes) {
            if (Thread.currentThread().isInterrupted()) {
                throw new InterruptedException("Import personnages interrompu.");
            }

            if (anime.getCharactersSyncedAt() != null) {
                continue;
            }

            boolean requestSucceeded = false;
            try {
                List<JsonNode> characters = fetchAnimeCharacters(anime, retryErrors);
                requestSucceeded = true;
                if (characters.isEmpty()) {
                    skipped++;
                } else {
                    importCharactersFromAnime(anime, characters);
                }
                anime.setCharactersSyncedAt(Instant.now());
                animeCatalogEntryRepository.save(anime);
            } catch (InterruptedException exception) {
                throw exception;
            } catch (Exception exception) {
                failed++;
                lastError = "Anime MAL " + anime.getMalId() + " : " + readableMessage(exception);
                if (isRateLimitException(exception)) {
                    sleepAfterRateLimit();
                }
            }

            if (requestSucceeded) {
                sleepBetweenRequests();
            }
        }
    }

    private JsonNode fetchGlobalCharactersPage(int page, boolean retryErrors) throws IOException, InterruptedException {
        String url = normalizeBaseUrl(jikanCharactersUrl) + "?page=" + page + "&limit=" + GLOBAL_CHARACTER_PAGE_SIZE;
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(CHARACTER_REQUEST_TIMEOUT_SECONDS))
                .header("Accept", "application/json")
                .GET()
                .build();

        int attempts = retryErrors ? RETRY_RATE_LIMIT_ATTEMPTS : 1;
        for (int attempt = 1; attempt <= attempts; attempt++) {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                lastError = "";
                return objectMapper.readTree(response.body());
            }

            if (response.statusCode() == 429 && retryErrors && attempt < attempts) {
                lastError = "Jikan 429 sur la page personnages " + page + " - pause anti rate-limit";
                sleepAfterRateLimit();
                continue;
            }

            throw new IllegalStateException("Jikan " + response.statusCode() + " sur la page personnages " + page);
        }

        return objectMapper.createObjectNode();
    }

    private List<CharacterCatalogEntryResponse> topCharactersFromJikan(int limit) {
        Instant cacheTime = topCharacterCacheUpdatedAt;
        if (
                cacheTime != null
                        && cacheTime.plus(TOP_CHARACTER_CACHE_TTL).isAfter(Instant.now())
                        && topCharacterCache.size() >= limit
        ) {
            return topCharacterCache.subList(0, limit);
        }

        try {
            List<CharacterCatalogEntryResponse> characters = fetchTopCharacters(Math.max(limit, TOP_CHARACTER_CACHE_LIMIT));
            topCharacterCache = List.copyOf(characters);
            topCharacterCacheUpdatedAt = Instant.now();
            return characters.subList(0, Math.min(limit, characters.size()));
        } catch (Exception exception) {
            lastError = "Top personnages Jikan : " + readableMessage(exception);
            return List.of();
        }
    }

    private List<CharacterCatalogEntryResponse> fetchTopCharacters(int limit) throws IOException, InterruptedException {
        String url = normalizeBaseUrl(jikanTopCharactersUrl) + "?limit=" + Math.max(1, Math.min(limit, MAX_PAGE_SIZE));
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(CHARACTER_REQUEST_TIMEOUT_SECONDS))
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Jikan " + response.statusCode() + " sur le top personnages");
        }

        JsonNode root = objectMapper.readTree(response.body());
        List<CharacterCatalogEntryResponse> characters = new ArrayList<>();
        Instant now = Instant.now();
        for (JsonNode character : charactersFromRoot(root)) {
            CharacterCatalogEntryResponse responseItem = cacheTopCharacter(character, now);
            if (responseItem != null) {
                characters.add(responseItem);
            }
        }

        return characters;
    }

    private CharacterCatalogEntryResponse cacheTopCharacter(JsonNode character, Instant now) {
        Integer malId = intValue(character, "mal_id", null);
        if (malId == null || malId <= 0) {
            return null;
        }

        String imageUrl = imageUrl(character);
        if (!hasDisplayImageUrl(imageUrl)) {
            return null;
        }

        CharacterCatalogEntry entry = characterCatalogEntryRepository.findByMalId(malId).orElseGet(() -> new CharacterCatalogEntry(malId));
        applyGlobalCharacterData(entry, character, now, imageUrl);
        return toResponse(characterCatalogEntryRepository.save(entry));
    }

    private List<JsonNode> fetchAnimeCharacters(AnimeCatalogEntry anime, boolean retryErrors) throws IOException, InterruptedException {
        String url = normalizeBaseUrl(jikanAnimeUrl) + "/" + anime.getMalId() + "/characters";
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(CHARACTER_REQUEST_TIMEOUT_SECONDS))
                .header("Accept", "application/json")
                .GET()
                .build();

        int attempts = retryErrors ? RETRY_RATE_LIMIT_ATTEMPTS : 1;
        for (int attempt = 1; attempt <= attempts; attempt++) {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                lastError = "";
                return charactersFromBody(response.body());
            }

            if (response.statusCode() == 429 && retryErrors && attempt < attempts) {
                lastError = "Jikan 429 sur " + anime.getTitle() + " - pause anti rate-limit";
                sleepAfterRateLimit();
                continue;
            }

            throw new IllegalStateException("Jikan " + response.statusCode() + " sur les personnages de " + anime.getTitle());
        }

        return List.of();
    }

    private List<JsonNode> charactersFromBody(String body) throws IOException {
        JsonNode root = objectMapper.readTree(body);
        JsonNode data = root.get("data");
        return charactersFromData(data);
    }

    private List<JsonNode> charactersFromRoot(JsonNode root) {
        JsonNode data = root == null ? null : root.get("data");
        return charactersFromData(data);
    }

    private List<JsonNode> charactersFromData(JsonNode data) {
        List<JsonNode> characters = new ArrayList<>();
        if (data != null && data.isArray()) {
            for (JsonNode character : data) {
                characters.add(character);
            }
        }

        return characters;
    }

    private void importGlobalCharacters(int page, JsonNode pageBody) {
        currentPage = page;
        Instant now = Instant.now();
        for (JsonNode character : charactersFromRoot(pageBody)) {
            try {
                Integer malId = intValue(character, "mal_id", null);
                if (malId == null) {
                    skipped++;
                    continue;
                }

                String imageUrl = imageUrl(character);
                if (!hasDisplayImageUrl(imageUrl)) {
                    skipped++;
                    continue;
                }

                CharacterCatalogEntry entry = characterCatalogEntryRepository.findByMalId(malId).orElse(null);
                boolean created = entry == null;
                if (created) {
                    entry = new CharacterCatalogEntry(malId);
                }

                applyGlobalCharacterData(entry, character, now, imageUrl);
                characterCatalogEntryRepository.save(entry);
                if (created) {
                    imported++;
                } else {
                    skipped++;
                }
            } catch (Exception exception) {
                failed++;
                lastError = readableMessage(exception);
            }
        }
    }

    private void importCharactersFromAnime(AnimeCatalogEntry anime, List<JsonNode> characterWrappers) {
        Instant now = Instant.now();
        for (JsonNode wrapper : characterWrappers) {
            try {
                JsonNode character = wrapper.get("character");
                Integer malId = intValue(character, "mal_id", null);
                if (malId == null) {
                    skipped++;
                    continue;
                }

                CharacterCatalogEntry entry = characterCatalogEntryRepository.findByMalId(malId).orElse(null);
                String role = translateRole(textValue(wrapper, "role", ""));
                if (entry == null) {
                    skipped++;
                    continue;
                }

                applyMissingSourceData(entry, anime, role);
                skipped++;
                if (linkCharacterToAnime(anime, malId, role, now)) {
                    linked++;
                }
            } catch (Exception exception) {
                failed++;
                lastError = readableMessage(exception);
            }
        }
    }

    private void applyCharacterData(
            CharacterCatalogEntry entry,
            JsonNode character,
            JsonNode wrapper,
            AnimeCatalogEntry anime,
            String role,
            Instant now
    ) {
        Integer malId = intValue(character, "mal_id", entry.getMalId());
        String name = textValue(character, "name", "Personnage " + malId);
        String imageUrl = imageUrl(character);

        entry.setSlug("mal-" + malId);
        entry.setName(limit(name, 260));
        entry.setNameKanji(limit(textValue(character, "name_kanji", ""), 260));
        entry.setImageUrl(limit(imageUrl, 700));
        entry.setFavorites(intValue(character, "favorites", intValue(wrapper, "favorites", null)));
        entry.setAbout(limit(characterDescription(character, anime), 12000));
        entry.setNicknames(limit(joinTextValues(character.get("nicknames")), 1600));
        entry.setLastSyncedAt(now);

        if (entry.getSourceAnimeMalId() == null) {
            applyMissingSourceData(entry, anime, role);
        }
    }

    private void applyGlobalCharacterData(CharacterCatalogEntry entry, JsonNode character, Instant now, String imageUrl) {
        Integer malId = intValue(character, "mal_id", entry.getMalId());
        String name = textValue(character, "name", "Personnage " + malId);

        entry.setSlug("mal-" + malId);
        entry.setName(limit(name, 260));
        entry.setNameKanji(limit(textValue(character, "name_kanji", ""), 260));
        entry.setImageUrl(limit(imageUrl, 700));
        entry.setFavorites(intValue(character, "favorites", entry.getFavorites()));
        entry.setAbout(limit(globalCharacterDescription(character), 12000));
        entry.setNicknames(limit(joinTextValues(character.get("nicknames")), 1600));
        entry.setLastSyncedAt(now);
    }

    private void applyMissingSourceData(CharacterCatalogEntry entry, AnimeCatalogEntry anime, String role) {
        if (entry.getSourceAnimeMalId() != null) {
            return;
        }

        entry.setSourceAnimeMalId(anime.getMalId());
        entry.setSourceAnimeTitle(limit(anime.getTitle(), 260));
        entry.setSourceAnimeSlug(limit(anime.getSlug(), 140));
        entry.setSourceAnimeImageUrl(limit(anime.getImageUrl(), 700));
        entry.setRole(limit(role, 40));
        characterCatalogEntryRepository.save(entry);
    }

    private boolean linkExistingSourceCharacter(CharacterCatalogEntry entry, Instant now) {
        if (entry.getSourceAnimeMalId() == null || entry.getMalId() == null) {
            return false;
        }

        AnimeCharacterAppearance appearance = animeCharacterAppearanceRepository
                .findByAnimeMalIdAndCharacterMalId(entry.getSourceAnimeMalId(), entry.getMalId())
                .orElse(null);
        boolean created = appearance == null;
        if (created) {
            appearance = new AnimeCharacterAppearance(entry.getSourceAnimeMalId(), entry.getMalId());
            appearance.setCreatedAt(now);
        }

        appearance.setAnimeSlug(limit(entry.getSourceAnimeSlug(), 140));
        appearance.setAnimeTitle(limit(entry.getSourceAnimeTitle(), 260));
        appearance.setAnimeImageUrl(limit(entry.getSourceAnimeImageUrl(), 700));
        appearance.setRole(limit(entry.getRole(), 40));
        animeCharacterAppearanceRepository.save(appearance);
        return created;
    }

    private boolean linkCharacterToAnime(AnimeCatalogEntry anime, Integer characterMalId, String role, Instant now) {
        if (anime.getMalId() == null || characterMalId == null) {
            return false;
        }

        AnimeCharacterAppearance appearance = animeCharacterAppearanceRepository
                .findByAnimeMalIdAndCharacterMalId(anime.getMalId(), characterMalId)
                .orElse(null);
        boolean created = appearance == null;
        if (created) {
            appearance = new AnimeCharacterAppearance(anime.getMalId(), characterMalId);
            appearance.setCreatedAt(now);
        }

        appearance.setAnimeSlug(limit(anime.getSlug(), 140));
        appearance.setAnimeTitle(limit(anime.getTitle(), 260));
        appearance.setAnimeImageUrl(limit(anime.getImageUrl(), 700));
        appearance.setRole(limit(role, 40));
        animeCharacterAppearanceRepository.save(appearance);
        return created;
    }

    private CharacterCatalogEntryResponse toResponse(CharacterCatalogEntry entry) {
        if (entry == null) {
            return null;
        }

        return new CharacterCatalogEntryResponse(
                entry.getMalId(),
                entry.getSlug(),
                entry.getName(),
                entry.getNameKanji(),
                entry.getImageUrl(),
                entry.getFavorites(),
                entry.getAbout(),
                splitList(entry.getNicknames()),
                entry.getSourceAnimeMalId(),
                entry.getSourceAnimeTitle(),
                entry.getSourceAnimeSlug(),
                entry.getSourceAnimeImageUrl(),
                entry.getRole(),
                entry.getLastSyncedAt()
        );
    }

    private CharacterCatalogEntryResponse toResponse(CharacterCatalogEntry entry, AnimeCharacterAppearance appearance) {
        if (entry == null || appearance == null) {
            return null;
        }

        return new CharacterCatalogEntryResponse(
                entry.getMalId(),
                entry.getSlug(),
                entry.getName(),
                entry.getNameKanji(),
                entry.getImageUrl(),
                entry.getFavorites(),
                entry.getAbout(),
                splitList(entry.getNicknames()),
                appearance.getAnimeMalId(),
                appearance.getAnimeTitle(),
                appearance.getAnimeSlug(),
                appearance.getAnimeImageUrl(),
                appearance.getRole(),
                entry.getLastSyncedAt()
        );
    }

    private String characterDescription(JsonNode character, AnimeCatalogEntry anime) {
        String about = textValue(character, "about", "");
        if (!about.isBlank()) {
            return cleanAbout(about);
        }

        return "Personnage de " + anime.getTitle() + ".";
    }

    private String globalCharacterDescription(JsonNode character) {
        String about = textValue(character, "about", "");
        if (!about.isBlank()) {
            return cleanAbout(about);
        }

        return "Aucune description disponible pour le moment.";
    }

    private String imageUrl(JsonNode character) {
        JsonNode images = character.get("images");
        if (images == null) {
            return "";
        }

        JsonNode webp = images.get("webp");
        String webpImage = textValue(webp, "image_url", "");
        if (hasDisplayImageUrl(webpImage)) {
            return webpImage.trim();
        }

        JsonNode jpg = images.get("jpg");
        String jpgImage = textValue(jpg, "image_url", "");
        return hasDisplayImageUrl(jpgImage) ? jpgImage.trim() : "";
    }

    private boolean hasDisplayImageUrl(String imageUrl) {
        if (imageUrl == null || imageUrl.isBlank()) {
            return false;
        }

        String cleanImageUrl = imageUrl.toLowerCase();
        return !cleanImageUrl.contains("questionmark") && !cleanImageUrl.contains("apple-touch-icon");
    }

    private String joinTextValues(JsonNode nodes) {
        if (nodes == null || !nodes.isArray()) {
            return "";
        }

        List<String> values = new ArrayList<>();
        for (JsonNode node : nodes) {
            String value = node.asText("").trim();
            if (!value.isBlank()) {
                values.add(value);
            }
        }

        return String.join(LIST_SEPARATOR, values);
    }

    private List<String> splitList(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }

        return List.of(value.split(LIST_SEPARATOR)).stream()
                .map(String::trim)
                .filter(item -> !item.isBlank())
                .toList();
    }

    private String cleanAbout(String about) {
        String cleaned = about == null ? "" : about
                .replaceAll("\\s*\\((?:[^)]*(?:Source:|MAL Rewrite|Written by)[^)]*)\\)", "")
                .replaceAll("[ \\t]+\\n", "\n")
                .trim();

        return cleaned.isBlank() ? "Aucune description disponible pour le moment." : cleaned;
    }

    private String normalizeQuery(String query) {
        return query == null ? "" : query.trim();
    }

    private String normalizeBaseUrl(String url) {
        return url == null ? "" : url.replaceAll("/+$", "");
    }

    private String limit(String value, int maxLength) {
        if (value == null) {
            return "";
        }

        return value.length() > maxLength ? value.substring(0, maxLength) : value;
    }

    private String textValue(JsonNode node, String field, String fallback) {
        if (node == null) {
            return fallback;
        }

        JsonNode value = node.get(field);
        return value == null || value.isNull() ? fallback : value.asText(fallback).trim();
    }

    private Integer intValue(JsonNode node, String field, Integer fallback) {
        if (node == null) {
            return fallback;
        }

        JsonNode value = node.get(field);
        if (value == null || value.isNull() || !value.canConvertToInt()) {
            return fallback;
        }

        return value.asInt();
    }

    private Long longValue(JsonNode node, String field, Long fallback) {
        if (node == null) {
            return fallback;
        }

        JsonNode value = node.get(field);
        if (value == null || value.isNull() || !value.canConvertToLong()) {
            return fallback;
        }

        return value.asLong();
    }

    private String translateRole(String role) {
        return switch (role) {
            case "Main" -> "Principal";
            case "Supporting" -> "Secondaire";
            default -> role == null ? "" : role;
        };
    }

    private String readableMessage(Exception exception) {
        return exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage();
    }

    private Long safeCount(Supplier<Long> counter) {
        try {
            return counter.get();
        } catch (Exception exception) {
            return 0L;
        }
    }

    private Long pendingGlobalCharacters() {
        if (apiTotalCharacters == null || apiTotalCharacters <= 0) {
            return 0L;
        }

        return Math.max(0L, apiTotalCharacters - characterCatalogEntryRepository.count());
    }

    private boolean isRateLimitException(Exception exception) {
        return readableMessage(exception).contains("Jikan 429");
    }

    private void sleepBetweenRequests() throws InterruptedException {
        Thread.sleep(importDelayMillis);
    }

    private void sleepAfterRateLimit() throws InterruptedException {
        Thread.sleep(RETRY_RATE_LIMIT_DELAY_MILLIS);
    }

    private static final class ImportThreadFactory implements ThreadFactory {
        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "animaclub-character-catalog-import");
            thread.setDaemon(true);
            return thread;
        }
    }
}
