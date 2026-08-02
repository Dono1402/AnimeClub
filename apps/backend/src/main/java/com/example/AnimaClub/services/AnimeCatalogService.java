package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.AnimeCatalogEntryResponse;
import com.example.AnimaClub.dto.AnimeCatalogFilterOptionsResponse;
import com.example.AnimaClub.dto.AnimeCatalogImportStatusResponse;
import com.example.AnimaClub.dto.AnimeCatalogPageResponse;
import com.example.AnimaClub.model.AnimeCatalogEntry;
import com.example.AnimaClub.repository.AnimeCatalogEntryRepository;
import com.example.AnimaClub.repository.AnimeWeeklyRankingRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class AnimeCatalogService {

    private static final int DEFAULT_PAGE_SIZE = 24;
    private static final int MAX_PAGE_SIZE = 100;
    private static final int JIKAN_PAGE_SIZE = 25;
    private static final int FILTER_FACTS_BACKFILL_SIZE = 50;
    private static final int ANILIST_BATCH_SIZE = 50;
    private static final int IMAGE_COLOR_SAMPLE_SIZE = 36;
    private static final int IMAGE_COLOR_MAX_BYTES = 3 * 1024 * 1024;
    private static final int IMAGE_COLOR_MAX_REDIRECTS = 2;
    private static final int POSTER_BACKFILL_SIZE = 12;
    private static final int ROUTE_CANDIDATE_LIMIT = 64;
    private static final double MAX_POSTER_ASPECT_RATIO = 0.9;
    private static final String WEEKLY_RANKING_SOURCE_ANILIST_TRENDING = "anilist-trending";
    private static final String LIST_SEPARATOR = "\n";
    private static final String DEFAULT_NEON_RGB = "104, 218, 255";
    private static final Set<String> ALLOWED_ANIME_TYPES = Set.of("tv", "movie", "ova", "ona", "special", "tv special");
    private static final Set<String> ALLOWED_IMAGE_HOSTS = Set.of(
            "cdn.myanimelist.net",
            "media.kitsu.app",
            "s4.anilist.co"
    );

    private final AnimeCatalogEntryRepository animeCatalogEntryRepository;
    private final AnimeWeeklyRankingRepository animeWeeklyRankingRepository;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final ExecutorService importExecutor;
    private final Map<String, String> imageColorCache = new ConcurrentHashMap<>();
    private final Map<String, Double> imageAspectRatioCache = new ConcurrentHashMap<>();
    private final Map<Integer, AnimeExternalFacts> externalFactsCache = new ConcurrentHashMap<>();
    private final Map<Integer, String> externalPosterCache = new ConcurrentHashMap<>();
    private final String jikanAnimeUrl;
    private final String anilistGraphqlUrl;
    private final String kitsuAnimeUrl;
    private final int importDelayMillis;
    private final boolean enrichOnRead;
    private final boolean imageColorLookupEnabled;

    private final AtomicBoolean importRunning = new AtomicBoolean(false);
    private volatile Integer currentPage = 0;
    private volatile Integer totalPages = 0;
    private volatile Long imported = 0L;
    private volatile Long skipped = 0L;
    private volatile Long failed = 0L;
    private volatile String lastError = "";
    private volatile Instant startedAt;
    private volatile Instant finishedAt;

    public AnimeCatalogService(
            AnimeCatalogEntryRepository animeCatalogEntryRepository,
            AnimeWeeklyRankingRepository animeWeeklyRankingRepository,
            ObjectMapper objectMapper,
            @Value("${app.jikan.anime-url:https://api.jikan.moe/v4/anime}") String jikanAnimeUrl,
            @Value("${app.anilist.graphql-url:https://graphql.anilist.co}") String anilistGraphqlUrl,
            @Value("${app.kitsu.anime-url:https://kitsu.io/api/edge/anime}") String kitsuAnimeUrl,
            @Value("${app.jikan.import-delay-ms:1300}") int importDelayMillis,
            @Value("${app.catalog.enrich-on-read:false}") boolean enrichOnRead,
            @Value("${app.catalog.image-color-lookup-enabled:false}") boolean imageColorLookupEnabled
    ) {
        this.animeCatalogEntryRepository = animeCatalogEntryRepository;
        this.animeWeeklyRankingRepository = animeWeeklyRankingRepository;
        this.objectMapper = objectMapper;
        this.jikanAnimeUrl = jikanAnimeUrl;
        this.anilistGraphqlUrl = anilistGraphqlUrl;
        this.kitsuAnimeUrl = kitsuAnimeUrl;
        this.importDelayMillis = Math.max(500, importDelayMillis);
        this.enrichOnRead = enrichOnRead;
        this.imageColorLookupEnabled = imageColorLookupEnabled;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.importExecutor = Executors.newSingleThreadExecutor(new ImportThreadFactory());
    }

    public AnimeCatalogPageResponse list(
            String query,
            int page,
            int pageSize,
            String genre,
            String type,
            String status,
            Integer year,
            String season,
            Double minScore,
            String sort
    ) {
        int cleanPage = Math.max(1, page);
        int cleanPageSize = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE));
        String cleanQuery = normalizeQuery(query);
        String alternateQuery = alternateSearchQuery(cleanQuery);
        Page<AnimeCatalogEntry> result = animeCatalogEntryRepository.searchWithFilters(
                cleanQuery,
                alternateQuery,
                normalizeFilter(genre),
                normalizeTypeFilter(type),
                normalizeStatusFilter(status),
                year != null && year > 0 ? year : null,
                normalizeSeasonFilter(season),
                normalizeMinimumScore(minScore),
                PageRequest.of(cleanPage - 1, cleanPageSize, sortFor(sort))
        );
        List<AnimeCatalogEntry> entries = result.getContent();
        enrichReadEntries(entries);

        return new AnimeCatalogPageResponse(
                entries.stream().map(this::toResponse).toList(),
                result.hasNext(),
                result.getTotalElements(),
                cleanPage,
                cleanPageSize
        );
    }

    public AnimeCatalogFilterOptionsResponse filters() {
        TreeSet<String> genres = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        TreeSet<String> types = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        TreeSet<String> statuses = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        TreeSet<Integer> years = new TreeSet<>((left, right) -> right.compareTo(left));

        if (enrichOnRead) {
            completeMissingFacts(
                    animeCatalogEntryRepository.findMissingFacts(PageRequest.of(
                            0,
                            FILTER_FACTS_BACKFILL_SIZE,
                            Sort.by(Sort.Order.asc("popularity").nullsLast(), Sort.Order.asc("title"))
                    )),
                    Instant.now(),
                    false
            );
        }

        for (AnimeCatalogEntry entry : animeCatalogEntryRepository.findAll()) {
            if (!isAllowedAnimeType(entry.getType())) {
                continue;
            }

            splitList(entry.getGenres()).forEach(genres::add);
            if (entry.getType() != null && !entry.getType().isBlank()) {
                types.add(entry.getType().trim());
            }
            if (entry.getStatus() != null && !entry.getStatus().isBlank()) {
                statuses.add(entry.getStatus().trim());
            }
            if (entry.getYear() != null && entry.getYear() > 0) {
                years.add(entry.getYear());
            }
        }

        return new AnimeCatalogFilterOptionsResponse(
                new ArrayList<>(genres),
                new ArrayList<>(types),
                new ArrayList<>(statuses),
                new ArrayList<>(years)
        );
    }

    @Transactional
    public List<AnimeCatalogEntryResponse> weeklyRanking(int limit) {
        int cleanLimit = Math.max(1, Math.min(limit, MAX_PAGE_SIZE));
        if (weeklyRankingNeedsRefresh()) {
            refreshWeeklyRankingFromAniList(Math.max(cleanLimit, 25));
        }

        List<AnimeCatalogEntry> entries = latestWeeklyRankingEntries(cleanLimit);
        if (entries.isEmpty()) {
            refreshWeeklyRankingFromAniList(Math.max(cleanLimit, 25));
            entries = latestWeeklyRankingEntries(cleanLimit);
        }
        enrichReadEntries(entries);

        return entries.stream().map(this::toResponse).toList();
    }

    private List<AnimeCatalogEntry> latestWeeklyRankingEntries(int limit) {
        return animeWeeklyRankingRepository
                .findLatestRanking(PageRequest.of(0, limit))
                .stream()
                .map(ranking -> ranking.getAnime())
                .filter(entry -> isAllowedAnimeType(entry.getType()))
                .toList();
    }

    private boolean weeklyRankingNeedsRefresh() {
        return animeWeeklyRankingRepository
                .findLatestPeriodEnd()
                .map(latestPeriodEnd -> latestPeriodEnd.isBefore(LocalDate.now()))
                .orElse(true);
    }

    private void refreshWeeklyRankingFromAniList(int limit) {
        List<WeeklyRankingItem> rankingItems = fetchAniListTrendingRanking(limit);
        if (rankingItems.isEmpty()) {
            return;
        }

        LocalDate periodEnd = LocalDate.now();
        LocalDate periodStart = periodEnd.minusDays(6);
        Instant capturedAt = Instant.now();
        animeWeeklyRankingRepository.deleteBySourceAndPeriodStartAndPeriodEnd(
                WEEKLY_RANKING_SOURCE_ANILIST_TRENDING,
                periodStart,
                periodEnd
        );

        List<com.example.AnimaClub.model.AnimeWeeklyRanking> rankings = new ArrayList<>();
        for (int index = 0; index < rankingItems.size(); index++) {
            WeeklyRankingItem item = rankingItems.get(index);
            AnimeCatalogEntry anime = animeCatalogEntryRepository.findByMalId(item.malId())
                    .orElseGet(() -> new AnimeCatalogEntry(item.malId()));
            applyAniListTrendingData(anime, item.media(), capturedAt);
            AnimeCatalogEntry savedAnime = animeCatalogEntryRepository.save(anime);
            rankings.add(new com.example.AnimaClub.model.AnimeWeeklyRanking(
                    savedAnime,
                    periodStart,
                    periodEnd,
                    index + 1,
                    item.weeklyScore(),
                    WEEKLY_RANKING_SOURCE_ANILIST_TRENDING,
                    capturedAt
            ));
        }

        animeWeeklyRankingRepository.saveAll(rankings);
    }

    private List<WeeklyRankingItem> fetchAniListTrendingRanking(int limit) {
        String query = """
                query ($limit: Int) {
                  Page(page: 1, perPage: $limit) {
                    media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
                      idMal
                      trending
                      popularity
                      averageScore
                      meanScore
                      title {
                        romaji
                        english
                        native
                      }
                      coverImage {
                        extraLarge
                        large
                      }
                      bannerImage
                      description(asHtml: false)
                      format
                      episodes
                      status
                      season
                      seasonYear
                      genres
                    }
                  }
                }
                """;

        try {
            String body = objectMapper.writeValueAsString(Map.of(
                    "query", query,
                    "variables", Map.of("limit", Math.max(1, Math.min(limit, MAX_PAGE_SIZE)))
            ));
            HttpRequest request = HttpRequest.newBuilder(URI.create(anilistGraphqlUrl))
                    .timeout(Duration.ofSeconds(20))
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return List.of();
            }

            JsonNode mediaNodes = objectMapper.readTree(response.body())
                    .path("data")
                    .path("Page")
                    .path("media");
            if (!mediaNodes.isArray()) {
                return List.of();
            }

            List<WeeklyRankingItem> items = new ArrayList<>();
            for (JsonNode media : mediaNodes) {
                Integer malId = intValue(media, "idMal", null);
                Integer trending = intValue(media, "trending", null);
                if (malId == null || malId <= 0 || trending == null) {
                    continue;
                }

                items.add(new WeeklyRankingItem(malId, trending.doubleValue(), media));
            }

            return items;
        } catch (IOException exception) {
            return List.of();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return List.of();
        }
    }

    private void applyAniListTrendingData(AnimeCatalogEntry entry, JsonNode media, Instant now) {
        Integer malId = intValue(media, "idMal", entry.getMalId());
        JsonNode titleNode = media.path("title");
        String title = textValue(titleNode, "english", "");
        if (title.isBlank()) {
            title = textValue(titleNode, "romaji", "Anime " + malId);
        }
        String imageUrl = aniListCoverImage(media.path("coverImage"));
        String bannerImage = textValue(media, "bannerImage", "");

        entry.setSlug("mal-" + malId);
        entry.setTitle(limit(title, 260));
        if (clean(entry.getTitleEnglish()).isBlank()) {
            entry.setTitleEnglish(limit(textValue(titleNode, "english", ""), 260));
        }
        if (clean(entry.getTitleJapanese()).isBlank()) {
            entry.setTitleJapanese(limit(textValue(titleNode, "native", ""), 260));
        }
        if (clean(entry.getImageUrl()).isBlank()) {
            entry.setImageUrl(limit(imageUrl, 700));
        }
        if (clean(entry.getBackgroundUrl()).isBlank()) {
            entry.setBackgroundUrl(limit(bannerImage.isBlank() ? imageUrl : bannerImage, 700));
        }
        if (clean(entry.getSynopsis()).isBlank() || "Aucun resume disponible pour le moment.".equals(entry.getSynopsis())) {
            entry.setSynopsis(limit(cleanSynopsis(textValue(media, "description", "")), 5000));
        }
        if (clean(entry.getType()).isBlank()) {
            entry.setType(limit(aniListFormat(textValue(media, "format", "Anime")), 40));
        }
        if (entry.getEpisodes() == null || entry.getEpisodes() <= 0) {
            entry.setEpisodes(intValue(media, "episodes", 0));
        }
        if (clean(entry.getStatus()).isBlank()) {
            entry.setStatus(limit(aniListStatus(textValue(media, "status", "Statut inconnu")), 80));
        }
        if (entry.getScore() == null) {
            entry.setScore(resolveAniListScore(media));
        }
        if (entry.getPopularity() == null) {
            entry.setPopularity(intValue(media, "popularity", null));
        }
        if (clean(entry.getSeason()).isBlank()) {
            entry.setSeason(limit(textValue(media, "season", "").toLowerCase(Locale.ROOT), 32));
        }
        if (entry.getYear() == null || entry.getYear() <= 0) {
            entry.setYear(intValue(media, "seasonYear", null));
        }
        if (clean(entry.getGenres()).isBlank()) {
            entry.setGenres(joinTextValues(media.path("genres")));
        }
        entry.setLastSyncedAt(now);
    }

    public List<AnimeCatalogEntryResponse> suggestions(String query, int limit) {
        int cleanLimit = Math.max(1, Math.min(limit, MAX_PAGE_SIZE));
        String cleanQuery = normalizeQuery(query);
        if (cleanQuery.length() < 2) {
            return List.of();
        }

        return animeCatalogEntryRepository
                .search(cleanQuery, alternateSearchQuery(cleanQuery), PageRequest.of(0, cleanLimit, Sort.by("popularity").ascending()))
                .getContent()
                .stream()
                .collect(java.util.stream.Collectors.collectingAndThen(java.util.stream.Collectors.toList(), entries -> {
                    enrichReadEntries(entries);
                    return entries.stream().map(this::toResponse).toList();
                }));
    }

    public AnimeCatalogEntryResponse findByMalId(Integer malId) {
        return animeCatalogEntryRepository.findByMalId(malId)
                .map(entry -> {
                    enrichReadEntries(List.of(entry));
                    return toResponse(entry);
                })
                .orElse(null);
    }

    public AnimeCatalogEntryResponse findBySlug(String slug) {
        String cleanSlug = slug == null ? "" : slug.trim().toLowerCase(Locale.ROOT);
        if (cleanSlug.isBlank() || cleanSlug.length() > 180) {
            return null;
        }

        AnimeCatalogEntry entry = animeCatalogEntryRepository.findBySlug(cleanSlug)
                .orElseGet(() -> findByRouteSlug(cleanSlug));
        if (entry == null) {
            return null;
        }

        enrichReadEntries(List.of(entry));
        return toResponse(entry);
    }

    private AnimeCatalogEntry findByRouteSlug(String slug) {
        String routeKey = canonicalRouteKey(slug.startsWith("series-") ? slug.substring(7) : slug);
        if (routeKey.isBlank()) {
            return null;
        }

        List<AnimeCatalogEntry> candidates = animeCatalogEntryRepository.findRouteCandidates(
                routeKey.replace('-', ' '),
                PageRequest.of(0, ROUTE_CANDIDATE_LIMIT)
        );
        for (int rank = 0; rank <= 3; rank++) {
            for (AnimeCatalogEntry candidate : candidates) {
                if (routeMatchRank(routeKey, candidate) == rank) {
                    return candidate;
                }
            }
        }

        return null;
    }

    private int routeMatchRank(String routeKey, AnimeCatalogEntry entry) {
        List<String> titleKeys = new ArrayList<>();
        titleKeys.add(canonicalRouteKey(entry.getTitle()));
        titleKeys.add(canonicalRouteKey(entry.getTitleEnglish()));
        titleKeys.add(canonicalRouteKey(entry.getTitleJapanese()));

        int bestRank = Integer.MAX_VALUE;
        for (String titleKey : titleKeys) {
            if (titleKey.isBlank()) {
                continue;
            }
            if (titleKey.equals(routeKey)) {
                return 0;
            }
            if (titleKey.startsWith(routeKey + "-")) {
                bestRank = Math.min(bestRank, 1);
                continue;
            }
            if (routeKey.startsWith(titleKey + "-")) {
                bestRank = Math.min(bestRank, 2);
                continue;
            }
            if (containsAllRouteTokens(routeKey, titleKey)) {
                bestRank = Math.min(bestRank, 3);
            }
        }

        return bestRank;
    }

    private boolean containsAllRouteTokens(String routeKey, String titleKey) {
        String[] routeTokens = routeKey.split("-");
        if (routeTokens.length < 2) {
            return false;
        }

        Set<String> titleTokens = new HashSet<>(List.of(titleKey.split("-")));
        for (String token : routeTokens) {
            if (token.length() > 1 && !titleTokens.contains(token)) {
                return false;
            }
        }
        return true;
    }

    private String canonicalRouteKey(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
    }

    public String dominantImageColor(String imageUrl) {
        if (!imageColorLookupEnabled) {
            return DEFAULT_NEON_RGB;
        }

        String cleanImageUrl = imageUrl == null ? "" : imageUrl.trim();
        if (cleanImageUrl.isBlank()) {
            return DEFAULT_NEON_RGB;
        }

        URI imageUri = validateImageColorUri(cleanImageUrl);
        return imageColorCache.computeIfAbsent(imageUri.toString(), ignored -> readDominantImageColor(imageUri));
    }

    public AnimeCatalogImportStatusResponse startImport(Integer maxPages) {
        if (!importRunning.compareAndSet(false, true)) {
            return status();
        }

        currentPage = 0;
        totalPages = 0;
        imported = 0L;
        skipped = 0L;
        failed = 0L;
        lastError = "";
        startedAt = Instant.now();
        finishedAt = null;

        importExecutor.submit(() -> runImport(maxPages));
        return status();
    }

    private void enrichReadEntries(List<AnimeCatalogEntry> entries) {
        if (!enrichOnRead || entries.isEmpty()) {
            return;
        }

        Instant now = Instant.now();
        completeMissingFacts(entries, now);
        completePosterImages(entries, now);
    }

    public AnimeCatalogImportStatusResponse status() {
        return new AnimeCatalogImportStatusResponse(
                importRunning.get(),
                currentPage,
                totalPages,
                imported,
                skipped,
                failed,
                animeCatalogEntryRepository.count(),
                lastError,
                startedAt,
                finishedAt
        );
    }

    @PreDestroy
    public void stop() {
        importExecutor.shutdownNow();
    }

    URI validateImageColorUri(String imageUrl) {
        try {
            URI uri = URI.create(imageUrl);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);

            if ((!scheme.equals("https") && !scheme.equals("http")) || !isAllowedImageHost(host)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image non autorisee.");
            }

            return uri;
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "URL d'image invalide.");
        }
    }

    boolean isAllowedImageHost(String host) {
        return ALLOWED_IMAGE_HOSTS.contains(host);
    }

    private String readDominantImageColor(URI imageUri) {
        for (URI candidate : readableImageCandidates(imageUri)) {
            BufferedImage image = fetchReadableImage(candidate, 0);
            if (image == null) {
                continue;
            }

            String rgb = pickDominantNeonRgb(image);
            if (rgb != null) {
                return rgb;
            }
        }

        return DEFAULT_NEON_RGB;
    }

    private List<URI> readableImageCandidates(URI imageUri) {
        String path = imageUri.getPath() == null ? "" : imageUri.getPath();
        if (!path.toLowerCase(Locale.ROOT).endsWith(".webp")) {
            return List.of(imageUri);
        }

        List<URI> candidates = new ArrayList<>();
        candidates.add(replaceImageExtension(imageUri, ".jpg"));
        candidates.add(imageUri);
        return candidates;
    }

    private URI replaceImageExtension(URI imageUri, String extension) {
        String path = imageUri.getPath();
        int extensionIndex = path.lastIndexOf('.');
        String nextPath = extensionIndex >= 0 ? path.substring(0, extensionIndex) + extension : path + extension;

        try {
            return new URI(imageUri.getScheme(), imageUri.getAuthority(), nextPath, imageUri.getQuery(), imageUri.getFragment());
        } catch (Exception exception) {
            return imageUri;
        }
    }

    private BufferedImage fetchReadableImage(URI imageUri, int redirectCount) {
        try {
            HttpRequest request = HttpRequest.newBuilder(imageUri)
                    .timeout(Duration.ofSeconds(8))
                    .header("User-Agent", "Mozilla/5.0 AnimeClub")
                    .GET()
                    .build();
            HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() >= 300 && response.statusCode() < 400) {
                closeQuietly(response.body());
                return followAllowedImageRedirect(imageUri, response, redirectCount);
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300 || imageBodyTooLarge(response)) {
                closeQuietly(response.body());
                return null;
            }

            byte[] body = readLimitedImageBody(response.body());
            if (body.length == 0) {
                return null;
            }

            return ImageIO.read(new ByteArrayInputStream(body));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return null;
        } catch (IOException exception) {
            return null;
        }
    }

    private BufferedImage followAllowedImageRedirect(
            URI imageUri,
            HttpResponse<InputStream> response,
            int redirectCount
    ) {
        if (redirectCount >= IMAGE_COLOR_MAX_REDIRECTS) {
            return null;
        }

        return response.headers()
                .firstValue("location")
                .map(imageUri::resolve)
                .filter((redirectUri) -> {
                    validateImageColorUri(redirectUri.toString());
                    return true;
                })
                .map((redirectUri) -> fetchReadableImage(redirectUri, redirectCount + 1))
                .orElse(null);
    }

    private boolean imageBodyTooLarge(HttpResponse<?> response) {
        return response.headers()
                .firstValueAsLong("content-length")
                .stream()
                .anyMatch((contentLength) -> contentLength > IMAGE_COLOR_MAX_BYTES);
    }

    private byte[] readLimitedImageBody(InputStream inputStream) throws IOException {
        try (InputStream body = inputStream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int totalBytes = 0;
            int read;
            while ((read = body.read(buffer)) != -1) {
                totalBytes += read;
                if (totalBytes > IMAGE_COLOR_MAX_BYTES) {
                    return new byte[0];
                }
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private void closeQuietly(InputStream inputStream) {
        if (inputStream == null) {
            return;
        }

        try {
            inputStream.close();
        } catch (IOException exception) {
            // Nothing useful to do here; the caller will ignore this image candidate.
        }
    }

    private String pickDominantNeonRgb(BufferedImage image) {
        if (image.getWidth() <= 0 || image.getHeight() <= 0) {
            return null;
        }

        BufferedImage sample = new BufferedImage(IMAGE_COLOR_SAMPLE_SIZE, IMAGE_COLOR_SAMPLE_SIZE, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = sample.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        graphics.drawImage(image, 0, 0, IMAGE_COLOR_SAMPLE_SIZE, IMAGE_COLOR_SAMPLE_SIZE, null);
        graphics.dispose();

        Map<String, ColorBucket> buckets = new HashMap<>();
        for (int y = 0; y < IMAGE_COLOR_SAMPLE_SIZE; y++) {
            for (int x = 0; x < IMAGE_COLOR_SAMPLE_SIZE; x++) {
                int pixel = sample.getRGB(x, y);
                int red = (pixel >> 16) & 0xff;
                int green = (pixel >> 8) & 0xff;
                int blue = pixel & 0xff;
                int max = Math.max(red, Math.max(green, blue));
                int min = Math.min(red, Math.min(green, blue));
                double lightness = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
                double saturation = max == 0 ? 0 : (double) (max - min) / max;

                if (lightness < 0.12 || lightness > 0.9 || saturation < 0.08) {
                    continue;
                }

                String key = Math.round(red / 32.0f) + "-" + Math.round(green / 32.0f) + "-" + Math.round(blue / 32.0f);
                double weight = saturation * 1.4 + 1 - Math.abs(lightness - 0.54);
                ColorBucket bucket = buckets.computeIfAbsent(key, ignored -> new ColorBucket());
                bucket.red += red * weight;
                bucket.green += green * weight;
                bucket.blue += blue * weight;
                bucket.weight += weight;
            }
        }

        ColorBucket dominant = buckets.values().stream()
                .max((left, right) -> Double.compare(left.weight, right.weight))
                .orElse(null);
        if (dominant == null || dominant.weight <= 0) {
            return null;
        }

        return boostNeonRgb(
                dominant.red / dominant.weight,
                dominant.green / dominant.weight,
                dominant.blue / dominant.weight
        );
    }

    private String boostNeonRgb(double red, double green, double blue) {
        double max = Math.max(red, Math.max(green, blue));
        double brightnessBoost = max > 0 && max < 168 ? 168 / max : 1;
        double brightRed = red * brightnessBoost;
        double brightGreen = green * brightnessBoost;
        double brightBlue = blue * brightnessBoost;
        double gray = (brightRed + brightGreen + brightBlue) / 3;
        double saturationBoost = 1.32;

        return "%d, %d, %d".formatted(
                clampNeonChannel(gray + (brightRed - gray) * saturationBoost),
                clampNeonChannel(gray + (brightGreen - gray) * saturationBoost),
                clampNeonChannel(gray + (brightBlue - gray) * saturationBoost)
        );
    }

    private int clampNeonChannel(double value) {
        return Math.max(58, Math.min(245, (int) Math.round(value)));
    }

    private void runImport(Integer maxPages) {
        try {
            int page = 1;
            while (!Thread.currentThread().isInterrupted()) {
                currentPage = page;
                JikanPageData pageData = fetchJikanPage(page);
                if (page == 1) {
                    int detectedTotalPages = Math.max(1, pageData.lastVisiblePage());
                    totalPages = maxPages == null ? detectedTotalPages : Math.min(detectedTotalPages, Math.max(1, maxPages));
                }

                importPageData(pageData.animes());

                if (!pageData.hasNextPage() || page >= totalPages) {
                    break;
                }

                page++;
                sleepBetweenRequests();
            }
        } catch (Exception exception) {
            failed++;
            lastError = exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage();
        } finally {
            finishedAt = Instant.now();
            importRunning.set(false);
        }
    }

    private JikanPageData fetchJikanPage(int page) throws IOException, InterruptedException {
        String url = jikanAnimeUrl
                + "?order_by=title"
                + "&sort=asc"
                + "&sfw=true"
                + "&page=" + page
                + "&limit=" + JIKAN_PAGE_SIZE;
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(30))
                .header("Accept", "application/json")
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Jikan import failed with status " + response.statusCode() + " on page " + page);
        }

        JsonNode root = objectMapper.readTree(response.body());
        JsonNode pagination = root.get("pagination");
        int lastVisiblePage = intValue(pagination, "last_visible_page", page);
        boolean hasNextPage = booleanValue(pagination, "has_next_page");
        JsonNode data = root.get("data");
        List<JsonNode> animes = new ArrayList<>();
        if (data != null && data.isArray()) {
            for (JsonNode anime : data) {
                animes.add(anime);
            }
        }

        return new JikanPageData(animes, hasNextPage, lastVisiblePage);
    }

    private void importPageData(List<JsonNode> animes) {
        Instant now = Instant.now();
        List<AnimeCatalogEntry> importedEntries = new ArrayList<>();
        for (JsonNode anime : animes) {
            try {
                String type = textValue(anime, "type", "Anime");
                if (!isAllowedAnimeType(type)) {
                    skipped++;
                    continue;
                }

                Integer malId = intValue(anime, "mal_id", null);
                if (malId == null) {
                    skipped++;
                    continue;
                }

                AnimeCatalogEntry entry = animeCatalogEntryRepository.findByMalId(malId)
                        .orElseGet(() -> new AnimeCatalogEntry(malId));
                applyAnimeData(entry, anime, now);
                animeCatalogEntryRepository.save(entry);
                importedEntries.add(entry);
                imported++;
            } catch (Exception exception) {
                failed++;
                lastError = exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage();
            }
        }

        completeMissingFacts(importedEntries, now, false);
    }

    private void applyAnimeData(AnimeCatalogEntry entry, JsonNode anime, Instant now) {
        Integer malId = intValue(anime, "mal_id", entry.getMalId());
        String title = textValue(anime, "title_english", "");
        if (title.isBlank()) {
            title = textValue(anime, "title", "Anime " + malId);
        }

        String imageUrl = imageUrl(anime);
        entry.setSlug("mal-" + malId);
        entry.setTitle(limit(title, 260));
        entry.setTitleEnglish(limit(textValue(anime, "title_english", ""), 260));
        entry.setTitleJapanese(limit(textValue(anime, "title_japanese", ""), 260));
        entry.setImageUrl(imageUrl);
        entry.setBackgroundUrl(imageUrl);
        entry.setSynopsis(limit(cleanSynopsis(textValue(anime, "synopsis", "Aucun resume disponible pour le moment.")), 5000));
        entry.setType(limit(textValue(anime, "type", "Anime"), 40));
        entry.setEpisodes(intValue(anime, "episodes", 0));
        entry.setStatus(limit(textValue(anime, "status", "Statut inconnu"), 80));
        entry.setScore(doubleValue(anime, "score"));
        entry.setRank(intValue(anime, "rank", null));
        entry.setPopularity(intValue(anime, "popularity", null));
        entry.setSeason(limit(textValue(anime, "season", ""), 32));
        entry.setYear(resolveAnimeYear(anime));
        entry.setGenres(joinNames(anime.get("genres")));
        entry.setStudios(joinNames(anime.get("studios")));
        entry.setTrailerUrl(trailerUrl(anime));
        entry.setLastSyncedAt(now);
    }

    private void completeMissingFacts(List<AnimeCatalogEntry> entries, Instant now) {
        completeMissingFacts(entries, now, true);
    }

    private void completeMissingFacts(List<AnimeCatalogEntry> entries, Instant now, boolean allowDetailedLookups) {
        List<AnimeCatalogEntry> candidates = entries.stream()
                .filter(this::hasMissingFacts)
                .filter(entry -> entry.getMalId() != null)
                .toList();
        if (candidates.isEmpty()) {
            return;
        }

        Map<Integer, AnimeExternalFacts> factsByMalId = new HashMap<>();
        if (allowDetailedLookups) {
            factsByMalId.putAll(fetchJikanDetailFacts(candidates.stream()
                    .filter(entry -> entry.getYear() == null || entry.getYear() <= 0)
                    .toList()));
        }

        Map<Integer, AnimeExternalFacts> aniListFacts = externalFacts(candidates.stream()
                .filter(entry -> stillMissingAfterFacts(entry, factsByMalId.get(entry.getMalId())))
                .map(AnimeCatalogEntry::getMalId)
                .distinct()
                .toList());
        for (Map.Entry<Integer, AnimeExternalFacts> result : aniListFacts.entrySet()) {
            factsByMalId.put(result.getKey(), mergeFacts(factsByMalId.get(result.getKey()), result.getValue()));
        }

        if (allowDetailedLookups) {
            List<AnimeCatalogEntry> stillMissing = candidates.stream()
                    .filter(entry -> stillMissingAfterFacts(entry, factsByMalId.get(entry.getMalId())))
                    .toList();
            Map<Integer, AnimeExternalFacts> titleFacts = fetchKitsuFacts(stillMissing);
            for (Map.Entry<Integer, AnimeExternalFacts> result : titleFacts.entrySet()) {
                AnimeExternalFacts mergedFacts = mergeFacts(factsByMalId.get(result.getKey()), result.getValue());
                factsByMalId.put(result.getKey(), mergedFacts);
                externalFactsCache.put(result.getKey(), mergedFacts);
            }
        }

        List<AnimeCatalogEntry> updated = new ArrayList<>();
        for (AnimeCatalogEntry entry : candidates) {
            AnimeExternalFacts facts = factsByMalId.get(entry.getMalId());
            if (facts != null && applyExternalFacts(entry, facts, now)) {
                updated.add(entry);
            }
        }

        if (!updated.isEmpty()) {
            animeCatalogEntryRepository.saveAll(updated);
        }
    }

    private void completePosterImages(List<AnimeCatalogEntry> entries, Instant now) {
        List<AnimeCatalogEntry> candidates = entries.stream()
                .filter(entry -> entry != null && entry.getMalId() != null)
                .filter(this::needsPosterReplacement)
                .limit(POSTER_BACKFILL_SIZE)
                .toList();
        if (candidates.isEmpty()) {
            return;
        }

        List<AnimeCatalogEntry> updated = new ArrayList<>();
        for (AnimeCatalogEntry entry : candidates) {
            String currentImageUrl = clean(entry.getImageUrl());
            String posterUrl = externalPoster(entry);
            if (posterUrl.isBlank()
                    || posterUrl.equals(currentImageUrl)
                    || !hasAcceptablePosterAspect(posterUrl)) {
                continue;
            }

            entry.setImageUrl(limit(posterUrl, 700));
            if (clean(entry.getBackgroundUrl()).isBlank()) {
                entry.setBackgroundUrl(limit(currentImageUrl.isBlank() ? posterUrl : currentImageUrl, 700));
            }
            entry.setLastSyncedAt(now);
            updated.add(entry);
        }

        if (!updated.isEmpty()) {
            animeCatalogEntryRepository.saveAll(updated);
        }
    }

    private boolean needsPosterReplacement(AnimeCatalogEntry entry) {
        String imageUrl = clean(entry.getImageUrl());
        if (imageUrl.isBlank()) {
            return true;
        }

        return !hasAcceptablePosterAspect(imageUrl);
    }

    private boolean hasAcceptablePosterAspect(String imageUrl) {
        String cleanImageUrl = clean(imageUrl);
        if (cleanImageUrl.isBlank()) {
            return false;
        }
        if (cleanImageUrl.contains("/poster_images/")) {
            return true;
        }

        Double aspectRatio = imageAspectRatio(cleanImageUrl);
        return aspectRatio == null || aspectRatio <= MAX_POSTER_ASPECT_RATIO;
    }

    private Double imageAspectRatio(String imageUrl) {
        String cleanImageUrl = clean(imageUrl);
        if (cleanImageUrl.isBlank()) {
            return null;
        }

        Double cachedRatio = imageAspectRatioCache.get(cleanImageUrl);
        if (cachedRatio != null) {
            return cachedRatio.isNaN() ? null : cachedRatio;
        }

        Double ratio = readImageAspectRatio(cleanImageUrl);
        imageAspectRatioCache.put(cleanImageUrl, ratio == null ? Double.NaN : ratio);
        return ratio;
    }

    private Double readImageAspectRatio(String imageUrl) {
        URI imageUri = safeImageUri(imageUrl);
        if (imageUri == null) {
            return null;
        }

        for (URI candidate : readableImageCandidates(imageUri)) {
            BufferedImage image = fetchReadableImage(candidate, 0);
            if (image == null || image.getHeight() <= 0) {
                continue;
            }

            return (double) image.getWidth() / image.getHeight();
        }

        return null;
    }

    private URI safeImageUri(String imageUrl) {
        try {
            URI uri = URI.create(imageUrl);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            return scheme.equals("https") || scheme.equals("http") ? uri : null;
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private String externalPoster(AnimeCatalogEntry entry) {
        Integer malId = entry.getMalId();
        if (malId == null || malId <= 0) {
            return "";
        }

        String cachedPoster = externalPosterCache.get(malId);
        if (cachedPoster != null) {
            return cachedPoster;
        }

        String posterUrl = fetchKitsuPoster(entry);
        externalPosterCache.put(malId, posterUrl);
        return posterUrl;
    }

    private String fetchKitsuPoster(AnimeCatalogEntry entry) {
        String title = clean(entry.getTitle());
        if (title.isBlank()) {
            return "";
        }

        String url = kitsuAnimeUrl
                + "?filter[text]=" + URLEncoder.encode(title, StandardCharsets.UTF_8)
                + "&page[limit]=3";

        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(12))
                    .header("Accept", "application/vnd.api+json, application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return "";
            }

            JsonNode data = objectMapper.readTree(response.body()).path("data");
            if (!data.isArray()) {
                return "";
            }

            for (JsonNode anime : data) {
                JsonNode attributes = anime.path("attributes");
                if (!isReasonableTitleMatch(title, kitsuTitleCandidates(attributes))) {
                    continue;
                }

                String posterUrl = kitsuPosterUrl(attributes);
                if (!posterUrl.isBlank()) {
                    return posterUrl;
                }
            }
        } catch (IOException exception) {
            return "";
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return "";
        }

        return "";
    }

    private String kitsuPosterUrl(JsonNode attributes) {
        JsonNode posterImage = attributes.path("posterImage");
        String original = textValue(posterImage, "original", "");
        if (!original.isBlank()) {
            return original;
        }

        String large = textValue(posterImage, "large", "");
        if (!large.isBlank()) {
            return large;
        }

        String medium = textValue(posterImage, "medium", "");
        return medium.isBlank() ? "" : medium;
    }

    private boolean hasMissingFacts(AnimeCatalogEntry entry) {
        return entry != null
                && (entry.getScore() == null || entry.getYear() == null || entry.getYear() <= 0);
    }

    private boolean stillMissingAfterFacts(AnimeCatalogEntry entry, AnimeExternalFacts facts) {
        if (facts == null) {
            return hasMissingFacts(entry);
        }

        boolean missingScore = entry.getScore() == null && facts.score() == null;
        boolean missingYear = (entry.getYear() == null || entry.getYear() <= 0) && (facts.year() == null || facts.year() <= 0);
        return missingScore || missingYear;
    }

    private AnimeExternalFacts mergeFacts(AnimeExternalFacts primary, AnimeExternalFacts fallback) {
        if (primary == null) {
            return fallback == null ? AnimeExternalFacts.empty() : fallback;
        }
        if (fallback == null) {
            return primary;
        }

        return new AnimeExternalFacts(
                primary.score() != null ? primary.score() : fallback.score(),
                primary.year() != null ? primary.year() : fallback.year()
        );
    }

    private boolean applyExternalFacts(AnimeCatalogEntry entry, AnimeExternalFacts facts, Instant now) {
        boolean changed = false;
        if (entry.getScore() == null && facts.score() != null) {
            entry.setScore(facts.score());
            changed = true;
        }
        if ((entry.getYear() == null || entry.getYear() <= 0) && facts.year() != null && facts.year() > 0) {
            entry.setYear(facts.year());
            changed = true;
        }

        if (changed) {
            entry.setLastSyncedAt(now);
        }

        return changed;
    }

    private Map<Integer, AnimeExternalFacts> externalFacts(List<Integer> malIds) {
        Map<Integer, AnimeExternalFacts> facts = new HashMap<>();
        List<Integer> missingIds = new ArrayList<>();

        for (Integer malId : malIds) {
            if (malId == null) {
                continue;
            }

            AnimeExternalFacts cachedFacts = externalFactsCache.get(malId);
            if (cachedFacts != null) {
                facts.put(malId, cachedFacts);
            } else {
                missingIds.add(malId);
            }
        }

        for (int index = 0; index < missingIds.size(); index += ANILIST_BATCH_SIZE) {
            List<Integer> batch = missingIds.subList(index, Math.min(index + ANILIST_BATCH_SIZE, missingIds.size()));
            Map<Integer, AnimeExternalFacts> fetchedFacts = fetchAniListFacts(batch);
            for (Integer malId : batch) {
                AnimeExternalFacts fetched = fetchedFacts.getOrDefault(malId, AnimeExternalFacts.empty());
                externalFactsCache.put(malId, fetched);
                facts.put(malId, fetched);
            }
        }

        return facts;
    }

    private Map<Integer, AnimeExternalFacts> fetchJikanDetailFacts(List<AnimeCatalogEntry> entries) {
        if (entries.isEmpty()) {
            return Map.of();
        }

        Map<Integer, AnimeExternalFacts> facts = new HashMap<>();
        for (AnimeCatalogEntry entry : entries) {
            AnimeExternalFacts entryFacts = fetchJikanDetailFacts(entry.getMalId());
            if (entryFacts != null && !entryFacts.isEmpty()) {
                facts.put(entry.getMalId(), entryFacts);
            }
        }

        return facts;
    }

    private AnimeExternalFacts fetchJikanDetailFacts(Integer malId) {
        if (malId == null || malId <= 0) {
            return AnimeExternalFacts.empty();
        }

        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(jikanAnimeUrl + "/" + malId))
                    .timeout(Duration.ofSeconds(15))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return AnimeExternalFacts.empty();
            }

            JsonNode anime = objectMapper.readTree(response.body()).path("data");
            return new AnimeExternalFacts(
                    doubleValue(anime, "score"),
                    resolveAnimeYear(anime)
            );
        } catch (IOException exception) {
            return AnimeExternalFacts.empty();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return AnimeExternalFacts.empty();
        }
    }

    private Map<Integer, AnimeExternalFacts> fetchAniListFacts(List<Integer> malIds) {
        if (malIds.isEmpty()) {
            return Map.of();
        }

        String query = """
                query ($ids: [Int]) {
                  Page(page: 1, perPage: 50) {
                    media(idMal_in: $ids, type: ANIME) {
                      idMal
                      averageScore
                      meanScore
                      startDate {
                        year
                      }
                    }
                  }
                }
                """;

        try {
            String body = objectMapper.writeValueAsString(Map.of(
                    "query", query,
                    "variables", Map.of("ids", malIds)
            ));
            HttpRequest request = HttpRequest.newBuilder(URI.create(anilistGraphqlUrl))
                    .timeout(Duration.ofSeconds(20))
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return Map.of();
            }

            JsonNode mediaNodes = objectMapper.readTree(response.body())
                    .path("data")
                    .path("Page")
                    .path("media");
            if (!mediaNodes.isArray()) {
                return Map.of();
            }

            Map<Integer, AnimeExternalFacts> facts = new HashMap<>();
            for (JsonNode media : mediaNodes) {
                Integer malId = intValue(media, "idMal", null);
                if (malId == null) {
                    continue;
                }

                facts.put(malId, new AnimeExternalFacts(
                        resolveAniListScore(media),
                        intValue(media.path("startDate"), "year", null)
                ));
            }

            return facts;
        } catch (IOException exception) {
            return Map.of();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return Map.of();
        }
    }

    private Double resolveAniListScore(JsonNode media) {
        Integer score = intValue(media, "averageScore", null);
        if (score == null || score <= 0) {
            score = intValue(media, "meanScore", null);
        }
        if (score == null || score <= 0) {
            return null;
        }

        return Math.round((score / 10.0) * 100.0) / 100.0;
    }

    private Map<Integer, AnimeExternalFacts> fetchKitsuFacts(List<AnimeCatalogEntry> entries) {
        if (entries.isEmpty()) {
            return Map.of();
        }

        Map<Integer, AnimeExternalFacts> facts = new HashMap<>();
        for (AnimeCatalogEntry entry : entries) {
            AnimeExternalFacts entryFacts = fetchKitsuFacts(entry);
            if (entryFacts != null && !entryFacts.isEmpty()) {
                facts.put(entry.getMalId(), entryFacts);
            }
        }

        return facts;
    }

    private AnimeExternalFacts fetchKitsuFacts(AnimeCatalogEntry entry) {
        String title = entry.getTitle() == null ? "" : entry.getTitle().trim();
        if (title.isBlank()) {
            return AnimeExternalFacts.empty();
        }

        String url = kitsuAnimeUrl
                + "?filter[text]=" + URLEncoder.encode(title, StandardCharsets.UTF_8)
                + "&page[limit]=3";

        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(12))
                    .header("Accept", "application/vnd.api+json, application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return AnimeExternalFacts.empty();
            }

            JsonNode data = objectMapper.readTree(response.body()).path("data");
            if (!data.isArray()) {
                return AnimeExternalFacts.empty();
            }

            for (JsonNode anime : data) {
                JsonNode attributes = anime.path("attributes");
                if (!isReasonableTitleMatch(title, kitsuTitleCandidates(attributes))) {
                    continue;
                }

                return new AnimeExternalFacts(
                        resolveKitsuScore(attributes),
                        resolveKitsuYear(attributes)
                );
            }
        } catch (IOException exception) {
            return AnimeExternalFacts.empty();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return AnimeExternalFacts.empty();
        }

        return AnimeExternalFacts.empty();
    }

    private List<String> kitsuTitleCandidates(JsonNode attributes) {
        List<String> titles = new ArrayList<>();
        addIfNotBlank(titles, textValue(attributes, "canonicalTitle", ""));

        JsonNode localizedTitles = attributes.path("titles");
        if (localizedTitles.isObject()) {
            localizedTitles.fields().forEachRemaining(entry -> addIfNotBlank(titles, entry.getValue().asText("")));
        }

        JsonNode abbreviatedTitles = attributes.path("abbreviatedTitles");
        if (abbreviatedTitles.isArray()) {
            for (JsonNode abbreviatedTitle : abbreviatedTitles) {
                addIfNotBlank(titles, abbreviatedTitle.asText(""));
            }
        }

        return titles;
    }

    private void addIfNotBlank(List<String> values, String value) {
        if (value != null && !value.isBlank()) {
            values.add(value.trim());
        }
    }

    private boolean isReasonableTitleMatch(String sourceTitle, List<String> candidateTitles) {
        String normalizedSource = normalizeTitleMatch(sourceTitle);
        if (normalizedSource.isBlank()) {
            return false;
        }

        Set<String> sourceTokens = titleTokens(normalizedSource);
        for (String candidateTitle : candidateTitles) {
            String normalizedCandidate = normalizeTitleMatch(candidateTitle);
            if (normalizedCandidate.isBlank()) {
                continue;
            }

            if (normalizedSource.equals(normalizedCandidate)
                    || normalizedSource.contains(normalizedCandidate)
                    || normalizedCandidate.contains(normalizedSource)) {
                return true;
            }

            Set<String> candidateTokens = titleTokens(normalizedCandidate);
            if (sourceTokens.isEmpty() || candidateTokens.isEmpty()) {
                continue;
            }

            long sharedTokens = sourceTokens.stream().filter(candidateTokens::contains).count();
            int expectedTokens = Math.min(sourceTokens.size(), candidateTokens.size());
            if (expectedTokens > 0 && sharedTokens >= Math.max(1, Math.ceil(expectedTokens * 0.66))) {
                return true;
            }
        }

        return false;
    }

    private Set<String> titleTokens(String normalizedTitle) {
        if (normalizedTitle.isBlank()) {
            return Set.of();
        }

        return java.util.Arrays.stream(normalizedTitle.split("\\s+"))
                .filter(token -> token.length() >= 3)
                .collect(java.util.stream.Collectors.toSet());
    }

    private String normalizeTitleMatch(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replaceAll("[\"'’`´]+", "")
                .toLowerCase(Locale.ROOT)
                .replace("&", " and ")
                .replaceAll("[^a-z0-9]+", " ")
                .replaceAll("\\b(the|a|an|movie|ova|ona|tv|special)\\b", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private Double resolveKitsuScore(JsonNode attributes) {
        Double averageRating = parseDouble(textValue(attributes, "averageRating", ""));
        if (averageRating != null && averageRating > 0) {
            return Math.round((averageRating / 10.0) * 100.0) / 100.0;
        }

        JsonNode frequencies = attributes.path("ratingFrequencies");
        if (!frequencies.isObject()) {
            return null;
        }

        double weightedTotal = 0;
        double total = 0;
        for (var iterator = frequencies.fields(); iterator.hasNext(); ) {
            Map.Entry<String, JsonNode> frequency = iterator.next();
            Double rating = parseDouble(frequency.getKey());
            Double count = parseDouble(frequency.getValue().asText(""));
            if (rating == null || count == null || count <= 0) {
                continue;
            }

            weightedTotal += rating * count;
            total += count;
        }

        if (total < 5) {
            return null;
        }

        return Math.round((weightedTotal / total / 2.0) * 100.0) / 100.0;
    }

    private Integer resolveKitsuYear(JsonNode attributes) {
        String startDate = textValue(attributes, "startDate", "");
        if (startDate.length() >= 4 && startDate.substring(0, 4).matches("\\d{4}")) {
            return Integer.parseInt(startDate.substring(0, 4));
        }

        return null;
    }

    private Double parseDouble(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            return Double.parseDouble(value.trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private AnimeCatalogEntryResponse toResponse(AnimeCatalogEntry entry) {
        return new AnimeCatalogEntryResponse(
                entry.getMalId(),
                entry.getSlug(),
                entry.getTitle(),
                entry.getTitleEnglish(),
                entry.getTitleJapanese(),
                entry.getImageUrl(),
                entry.getBackgroundUrl(),
                entry.getSynopsis(),
                entry.getType(),
                entry.getEpisodes(),
                entry.getStatus(),
                entry.getScore(),
                entry.getRank(),
                entry.getPopularity(),
                entry.getSeason(),
                entry.getYear(),
                splitList(entry.getGenres()),
                splitList(entry.getStudios()),
                entry.getTrailerUrl(),
                entry.getLastSyncedAt()
        );
    }

    private boolean isAllowedAnimeType(String type) {
        if (type == null || type.isBlank()) {
            return true;
        }

        return ALLOWED_ANIME_TYPES.contains(type.trim().toLowerCase(Locale.ROOT));
    }

    private String imageUrl(JsonNode anime) {
        JsonNode images = anime.get("images");
        if (images == null) {
            return "";
        }

        JsonNode webp = images.get("webp");
        String webpLarge = textValue(webp, "large_image_url", "");
        if (!webpLarge.isBlank()) {
            return webpLarge;
        }

        JsonNode jpg = images.get("jpg");
        String jpgLarge = textValue(jpg, "large_image_url", "");
        if (!jpgLarge.isBlank()) {
            return jpgLarge;
        }

        String webpImage = textValue(webp, "image_url", "");
        if (!webpImage.isBlank()) {
            return webpImage;
        }

        return textValue(jpg, "image_url", "");
    }

    private String trailerUrl(JsonNode anime) {
        JsonNode trailer = anime.get("trailer");
        if (trailer == null) {
            return null;
        }

        String url = textValue(trailer, "url", "");
        if (!url.isBlank()) {
            return url;
        }

        String embedUrl = textValue(trailer, "embed_url", "");
        if (!embedUrl.isBlank()) {
            return embedUrl;
        }

        String youtubeId = textValue(trailer, "youtube_id", "");
        return youtubeId.isBlank() ? null : "https://www.youtube.com/watch?v=" + youtubeId;
    }

    private String joinNames(JsonNode nodes) {
        if (nodes == null || !nodes.isArray()) {
            return "";
        }

        List<String> values = new ArrayList<>();
        for (JsonNode node : nodes) {
            String name = textValue(node, "name", "");
            if (!name.isBlank()) {
                values.add(name);
            }
        }

        return String.join(LIST_SEPARATOR, values);
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

    private String aniListCoverImage(JsonNode coverImage) {
        String extraLarge = textValue(coverImage, "extraLarge", "");
        if (!extraLarge.isBlank()) {
            return extraLarge;
        }

        return textValue(coverImage, "large", "");
    }

    private String aniListFormat(String format) {
        return switch (normalizeFilter(format).toUpperCase(Locale.ROOT)) {
            case "MOVIE" -> "Movie";
            case "OVA" -> "OVA";
            case "ONA" -> "ONA";
            case "SPECIAL" -> "Special";
            case "TV", "TV_SHORT" -> "TV";
            default -> "Anime";
        };
    }

    private String aniListStatus(String status) {
        return switch (normalizeFilter(status).toUpperCase(Locale.ROOT)) {
            case "FINISHED" -> "Finished Airing";
            case "RELEASING" -> "Currently Airing";
            case "NOT_YET_RELEASED" -> "Not Yet Aired";
            case "CANCELLED" -> "Cancelled";
            case "HIATUS" -> "Hiatus";
            default -> "Statut inconnu";
        };
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

    private String cleanSynopsis(String synopsis) {
        String cleaned = synopsis == null ? "" : synopsis
                .replaceAll("\\s*\\[(?:[^\\]]*(?:MAL Rewrite|Written by|Redige par|Source:)[^\\]]*)\\]", "")
                .replaceAll("\\s*\\((?:[^)]*(?:MAL Rewrite|Written by|Redige par|Source:)[^)]*)\\)", "")
                .replaceAll("[ \\t]+\\n", "\n")
                .trim();

        return cleaned.isBlank() ? "Aucun resume disponible pour le moment." : cleaned;
    }

    private String normalizeQuery(String query) {
        return query == null ? "" : query.trim();
    }

    private String alternateSearchQuery(String query) {
        if (query == null || query.isBlank()) {
            return "";
        }

        String alternate = query.trim();
        if (alternate.contains("-")) {
            alternate = alternate.replace('-', ' ');
        }

        String withoutAccents = stripSearchDiacritics(alternate);
        if (!withoutAccents.equals(alternate)) {
            alternate = withoutAccents;
        } else {
            alternate = alternate.replaceAll("(?iu)\\bpokemon\\b", "Pok\u00e9mon");
        }

        return alternate.equals(query) ? "" : alternate;
    }

    private String stripSearchDiacritics(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
    }

    private String normalizeFilter(String value) {
        return value == null ? "" : value.trim();
    }

    private String normalizeTypeFilter(String type) {
        return normalizeFilter(type)
                .toLowerCase(Locale.ROOT)
                .replace('é', 'e');
    }

    private String normalizeStatusFilter(String status) {
        String cleanStatus = normalizeFilter(status);
        String normalized = cleanStatus
                .toLowerCase(Locale.ROOT)
                .replace('é', 'e')
                .replace('à', 'a');

        return switch (normalized) {
            case "termine", "finished airing" -> "finished airing";
            case "en diffusion", "currently airing" -> "currently airing";
            case "a venir", "not yet aired" -> "not yet aired";
            default -> normalized;
        };
    }

    private String normalizeSeasonFilter(String season) {
        String normalized = normalizeFilter(season).toLowerCase(Locale.ROOT);

        return switch (normalized) {
            case "printemps", "spring" -> "spring";
            case "ete", "summer" -> "summer";
            case "automne", "fall" -> "fall";
            case "hiver", "winter" -> "winter";
            default -> normalized;
        };
    }

    private Double normalizeMinimumScore(Double minScore) {
        if (minScore == null || !Double.isFinite(minScore)) {
            return null;
        }

        return Math.max(0.0, Math.min(10.0, minScore));
    }

    private Sort sortFor(String sort) {
        return switch (normalizeTypeFilter(sort)) {
            case "popularity-asc" -> Sort.by(Sort.Order.asc("popularity").nullsLast(), Sort.Order.asc("title"));
            case "title-desc" -> Sort.by(Sort.Order.desc("title"));
            case "rank-asc" -> Sort.by(Sort.Order.asc("rank").nullsLast(), Sort.Order.asc("title"));
            case "score-desc" -> Sort.by(Sort.Order.desc("score").nullsLast(), Sort.Order.asc("title"));
            case "episodes-desc" -> Sort.by(Sort.Order.desc("episodes").nullsLast(), Sort.Order.asc("title"));
            default -> Sort.by(Sort.Order.asc("title"));
        };
    }

    private String limit(String value, int maxLength) {
        if (value == null) {
            return "";
        }

        return value.length() > maxLength ? value.substring(0, maxLength) : value;
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
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

    private Double doubleValue(JsonNode node, String field) {
        if (node == null) {
            return null;
        }

        JsonNode value = node.get(field);
        return value == null || value.isNull() || !value.isNumber() ? null : value.asDouble();
    }

    private Integer resolveAnimeYear(JsonNode anime) {
        Integer year = intValue(anime, "year", null);
        if (year != null && year > 0) {
            return year;
        }

        JsonNode aired = anime == null ? null : anime.get("aired");
        JsonNode prop = aired == null ? null : aired.get("prop");
        JsonNode fromProp = prop == null ? null : prop.get("from");
        Integer propYear = intValue(fromProp, "year", null);
        if (propYear != null && propYear > 0) {
            return propYear;
        }

        String from = textValue(aired, "from", "");
        if (from.length() >= 4) {
            String fromYear = from.substring(0, 4);
            if (fromYear.matches("\\d{4}")) {
                return Integer.parseInt(fromYear);
            }
        }

        return null;
    }

    private boolean booleanValue(JsonNode node, String field) {
        if (node == null) {
            return false;
        }

        JsonNode value = node.get(field);
        return value != null && !value.isNull() && value.asBoolean(false);
    }

    private void sleepBetweenRequests() throws InterruptedException {
        Thread.sleep(importDelayMillis);
    }

    private String slugify(String value) {
        String normalized = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        return URLEncoder.encode(normalized, StandardCharsets.UTF_8);
    }

    private record JikanPageData(List<JsonNode> animes, boolean hasNextPage, int lastVisiblePage) {
    }

    private record WeeklyRankingItem(Integer malId, Double weeklyScore, JsonNode media) {
    }

    private record AnimeExternalFacts(Double score, Integer year) {

        private static AnimeExternalFacts empty() {
            return new AnimeExternalFacts(null, null);
        }

        private boolean isEmpty() {
            return score == null && year == null;
        }
    }

    private static final class ColorBucket {
        private double red;
        private double green;
        private double blue;
        private double weight;
    }

    private static final class ImportThreadFactory implements ThreadFactory {
        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "animaclub-anime-catalog-import");
            thread.setDaemon(true);
            return thread;
        }
    }
}
