package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.AnimeLibraryEntryRequest;
import com.example.AnimaClub.dto.AnimeLibraryEntryResponse;
import com.example.AnimaClub.model.AnimeCatalogEntry;
import com.example.AnimaClub.model.AnimeLibraryEntry;
import com.example.AnimaClub.model.AnimeWatchStatus;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.repository.AnimeCatalogEntryRepository;
import com.example.AnimaClub.repository.AnimeLibraryEntryRepository;
import com.example.AnimaClub.repository.CompteRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class AnimethequeService {

    private final AnimeLibraryEntryRepository animeLibraryEntryRepository;
    private final CompteRepository compteRepository;
    private final AnimeCatalogEntryRepository animeCatalogEntryRepository;

    public AnimethequeService(
            AnimeLibraryEntryRepository animeLibraryEntryRepository,
            CompteRepository compteRepository,
            AnimeCatalogEntryRepository animeCatalogEntryRepository
    ) {
        this.animeLibraryEntryRepository = animeLibraryEntryRepository;
        this.compteRepository = compteRepository;
        this.animeCatalogEntryRepository = animeCatalogEntryRepository;
    }

    public List<AnimeLibraryEntryResponse> list(Integer accountId) {
        ensureAccountExists(accountId);
        return animeLibraryEntryRepository.findByAccount_IdOrderByUpdatedAtDesc(accountId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public List<AnimeLibraryEntryResponse> publicList(Integer accountId) {
        Compte account = compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));

        if (!account.isShowAnimeLibrary()) {
            return List.of();
        }

        return animeLibraryEntryRepository.findByAccount_IdOrderByUpdatedAtDesc(accountId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public AnimeLibraryEntryResponse save(Integer accountId, AnimeLibraryEntryRequest request) {
        Compte account = compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));

        String slug = request.animeSlug().trim();
        String parentAnimeSlug = cleanNullable(request.parentAnimeSlug());
        String seasonSlug = cleanNullable(request.seasonSlug());
        String trackingMode = resolveTrackingMode(request.trackingMode(), seasonSlug, request.seasonNumber());
        int totalEpisodes = Math.max(0, request.totalEpisodes());
        List<AnimeLibraryEntry> matchingEntries = matchingEntries(
                accountId,
                slug,
                parentAnimeSlug,
                seasonSlug,
                trackingMode,
                totalEpisodes
        );
        AnimeLibraryEntry entry = selectEntry(matchingEntries, slug, seasonSlug)
                .orElseGet(() -> new AnimeLibraryEntry(account, slug));

        entry.setAnimeSlug(slug);
        entry.setParentAnimeSlug(parentAnimeSlug);
        entry.setParentTitle(cleanNullable(request.parentTitle()));
        entry.setSeasonSlug(seasonSlug);
        entry.setSeasonTitle(cleanNullable(request.seasonTitle()));
        entry.setSeasonNumber(request.seasonNumber());
        entry.setTrackingMode(trackingMode);
        entry.setMediaType(cleanNullable(request.mediaType()));
        entry.setTitle(request.title().trim());
        entry.setCoverUrl(clean(request.coverUrl()));
        AnimeWatchStatus status = parseStatus(request.status());
        int watchedEpisodes = clampEpisodes(request.watchedEpisodes(), totalEpisodes);
        validateProgress(status, watchedEpisodes);
        status = normalizeProgressStatus(status, watchedEpisodes, totalEpisodes);

        entry.setStatus(status);
        entry.setWatchedEpisodes(watchedEpisodes);
        entry.setTotalEpisodes(totalEpisodes);
        entry.setScore(clampScore(request.score()));
        entry.setFavorite(Boolean.TRUE.equals(request.favorite()));
        entry.setNotes(clean(request.notes()));

        AnimeLibraryEntry savedEntry = animeLibraryEntryRepository.save(entry);
        deleteDuplicateMatches(matchingEntries, savedEntry);
        return toResponse(savedEntry);
    }

    @Transactional
    public void delete(Integer accountId, Integer entryId) {
        ensureAccountExists(accountId);
        if (!animeLibraryEntryRepository.existsByIdAndAccount_Id(entryId, accountId)) {
            throw new IllegalArgumentException("Entree introuvable.");
        }

        animeLibraryEntryRepository.deleteById(entryId);
    }

    private void ensureAccountExists(Integer accountId) {
        if (!compteRepository.existsById(accountId)) {
            throw new IllegalArgumentException("Compte introuvable.");
        }
    }

    private AnimeWatchStatus parseStatus(String status) {
        try {
            return AnimeWatchStatus.valueOf(status.trim().toUpperCase());
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Statut Animetheque invalide.");
        }
    }

    private Integer clampEpisodes(Integer watchedEpisodes, Integer totalEpisodes) {
        int watched = Math.max(0, watchedEpisodes);
        int total = Math.max(0, totalEpisodes);
        return total == 0 ? watched : Math.min(watched, total);
    }

    private void validateProgress(AnimeWatchStatus status, int watchedEpisodes) {
        if (status == AnimeWatchStatus.WATCHING && watchedEpisodes <= 0) {
            throw new IllegalArgumentException("Un anime en cours doit avoir au moins 1 episode vu.");
        }
    }

    private AnimeWatchStatus normalizeProgressStatus(AnimeWatchStatus status, int watchedEpisodes, int totalEpisodes) {
        if (status == AnimeWatchStatus.WATCHING && totalEpisodes > 0 && watchedEpisodes >= totalEpisodes) {
            return AnimeWatchStatus.COMPLETED;
        }

        return status;
    }

    private Integer clampScore(Integer score) {
        if (score == null) {
            return null;
        }

        return Math.max(0, Math.min(score, 10));
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private String cleanNullable(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }

        return value.trim();
    }

    private String resolveTrackingMode(String requestedMode, String seasonSlug, Integer seasonNumber) {
        String mode = requestedMode == null ? "" : requestedMode.trim().toUpperCase();
        if ("SEASON".equals(mode) || "SERIES".equals(mode)) {
            return mode;
        }

        return (seasonSlug != null && !seasonSlug.trim().isEmpty()) || seasonNumber != null ? "SEASON" : "SERIES";
    }

    private List<AnimeLibraryEntry> matchingEntries(
            Integer accountId,
            String animeSlug,
            String parentAnimeSlug,
            String seasonSlug,
            String trackingMode,
            int totalEpisodes
    ) {
        return animeLibraryEntryRepository.findByAccount_IdOrderByUpdatedAtDesc(accountId)
                .stream()
                .filter((entry) -> isMatchingEntry(entry, animeSlug, parentAnimeSlug, seasonSlug, trackingMode, totalEpisodes))
                .toList();
    }

    private boolean isMatchingEntry(
            AnimeLibraryEntry entry,
            String animeSlug,
            String parentAnimeSlug,
            String seasonSlug,
            String trackingMode,
            int totalEpisodes
    ) {
        if (same(entry.getAnimeSlug(), animeSlug)) {
            return true;
        }

        if (seasonSlug != null && (same(entry.getSeasonSlug(), seasonSlug) || same(entry.getAnimeSlug(), seasonSlug))) {
            return true;
        }

        if ("SEASON".equals(trackingMode) && parentAnimeSlug != null) {
            return same(entry.getAnimeSlug(), parentAnimeSlug)
                    && !"SEASON".equals(entry.getTrackingMode())
                    && sameEpisodeTotal(entry, totalEpisodes);
        }

        if ("SERIES".equals(trackingMode)) {
            return same(entry.getParentAnimeSlug(), animeSlug)
                    && "SEASON".equals(entry.getTrackingMode())
                    && sameEpisodeTotal(entry, totalEpisodes);
        }

        return false;
    }

    private Optional<AnimeLibraryEntry> selectEntry(List<AnimeLibraryEntry> entries, String animeSlug, String seasonSlug) {
        return entries.stream()
                .filter((entry) -> same(entry.getAnimeSlug(), animeSlug))
                .findFirst()
                .or(() -> seasonSlug == null
                        ? Optional.empty()
                        : entries.stream()
                                .filter((entry) -> same(entry.getSeasonSlug(), seasonSlug) || same(entry.getAnimeSlug(), seasonSlug))
                                .findFirst())
                .or(() -> entries.stream().findFirst());
    }

    private void deleteDuplicateMatches(List<AnimeLibraryEntry> matchingEntries, AnimeLibraryEntry savedEntry) {
        List<AnimeLibraryEntry> duplicates = matchingEntries.stream()
                .filter((entry) -> !Objects.equals(entry.getId(), savedEntry.getId()))
                .toList();
        if (!duplicates.isEmpty()) {
            animeLibraryEntryRepository.deleteAll(duplicates);
        }
    }

    private boolean sameEpisodeTotal(AnimeLibraryEntry entry, int totalEpisodes) {
        return totalEpisodes > 0 && Objects.equals(entry.getTotalEpisodes(), totalEpisodes);
    }

    private boolean same(String left, String right) {
        return left != null && right != null && left.equalsIgnoreCase(right);
    }

    private AnimeLibraryEntryResponse toResponse(AnimeLibraryEntry entry) {
        AnimeCatalogEntry catalogEntry = catalogEntryFor(entry).orElse(null);
        return new AnimeLibraryEntryResponse(
                entry.getId(),
                entry.getAccount().getId(),
                entry.getAnimeSlug(),
                entry.getParentAnimeSlug(),
                entry.getParentTitle(),
                entry.getSeasonSlug(),
                entry.getSeasonTitle(),
                entry.getSeasonNumber(),
                entry.getTrackingMode() == null ? "SERIES" : entry.getTrackingMode(),
                entry.getMediaType(),
                entry.getTitle(),
                entry.getCoverUrl(),
                displayStatus(entry),
                entry.getWatchedEpisodes(),
                entry.getTotalEpisodes(),
                entry.getScore(),
                entry.getFavorite(),
                entry.getNotes(),
                entry.getUpdatedAt(),
                catalogEntry == null ? null : catalogEntry.getScore(),
                catalogEntry == null ? null : catalogEntry.getYear(),
                catalogEntry == null ? null : catalogEntry.getType(),
                catalogEntry == null ? List.of() : splitCatalogList(catalogEntry.getGenres())
        );
    }

    private Optional<AnimeCatalogEntry> catalogEntryFor(AnimeLibraryEntry entry) {
        List<String> slugs = new ArrayList<>();
        addSlug(slugs, entry.getSeasonSlug());
        addSlug(slugs, entry.getAnimeSlug());
        addSlug(slugs, entry.getParentAnimeSlug());

        for (String slug : slugs) {
            Optional<AnimeCatalogEntry> catalogEntry = animeCatalogEntryRepository.findBySlug(slug);
            if (catalogEntry.isPresent()) {
                return catalogEntry;
            }
        }

        List<String> titles = new ArrayList<>();
        addTitle(titles, entry.getSeasonTitle());
        addTitle(titles, entry.getTitle());
        addTitle(titles, entry.getParentTitle());

        Integer episodes = entry.getTotalEpisodes() == null || entry.getTotalEpisodes() <= 0 ? null : entry.getTotalEpisodes();
        for (String title : titles) {
            Optional<AnimeCatalogEntry> catalogEntry = findCatalogEntryByExactTitle(title, episodes)
                    .or(() -> episodes == null ? Optional.empty() : findCatalogEntryByExactTitle(title, null));
            if (catalogEntry.isPresent()) {
                return catalogEntry;
            }
        }

        return Optional.empty();
    }

    private void addSlug(List<String> slugs, String slug) {
        String cleanSlug = cleanNullable(slug);
        if (cleanSlug != null && slugs.stream().noneMatch((currentSlug) -> currentSlug.equalsIgnoreCase(cleanSlug))) {
            slugs.add(cleanSlug);
        }
    }

    private void addTitle(List<String> titles, String title) {
        String cleanTitle = cleanNullable(title);
        if (cleanTitle != null && titles.stream().noneMatch((currentTitle) -> currentTitle.equalsIgnoreCase(cleanTitle))) {
            titles.add(cleanTitle);
        }
    }

    private Optional<AnimeCatalogEntry> findCatalogEntryByExactTitle(String title, Integer episodes) {
        return animeCatalogEntryRepository.findExactTitleMatches(title, episodes, PageRequest.of(0, 1))
                .stream()
                .findFirst();
    }

    private List<String> splitCatalogList(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }

        return List.of(value.split("\\R"))
                .stream()
                .map(String::trim)
                .filter((item) -> !item.isBlank())
                .toList();
    }

    private AnimeWatchStatus displayStatus(AnimeLibraryEntry entry) {
        if (entry.getStatus() != AnimeWatchStatus.WATCHING) {
            return entry.getStatus();
        }

        int watchedEpisodes = Math.max(0, entry.getWatchedEpisodes() == null ? 0 : entry.getWatchedEpisodes());
        int totalEpisodes = Math.max(0, entry.getTotalEpisodes() == null ? 0 : entry.getTotalEpisodes());

        if (watchedEpisodes <= 0) {
            return AnimeWatchStatus.PLANNED;
        }

        if (totalEpisodes > 0 && watchedEpisodes >= totalEpisodes) {
            return AnimeWatchStatus.COMPLETED;
        }

        return AnimeWatchStatus.WATCHING;
    }
}
