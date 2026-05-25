package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.MangaLibraryEntryRequest;
import com.example.AnimaClub.dto.MangaLibraryEntryResponse;
import com.example.AnimaClub.model.AnimeWatchStatus;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.model.MangaLibraryEntry;
import com.example.AnimaClub.repository.CompteRepository;
import com.example.AnimaClub.repository.MangaLibraryEntryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class MangathequeService {

    private final MangaLibraryEntryRepository mangaLibraryEntryRepository;
    private final CompteRepository compteRepository;

    public MangathequeService(
            MangaLibraryEntryRepository mangaLibraryEntryRepository,
            CompteRepository compteRepository
    ) {
        this.mangaLibraryEntryRepository = mangaLibraryEntryRepository;
        this.compteRepository = compteRepository;
    }

    public List<MangaLibraryEntryResponse> list(Integer accountId) {
        ensureAccountExists(accountId);
        return mangaLibraryEntryRepository.findByAccount_IdOrderByUpdatedAtDesc(accountId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public List<MangaLibraryEntryResponse> publicList(Integer accountId) {
        Compte account = compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));

        if (!account.isShowMangaLibrary()) {
            return List.of();
        }

        return mangaLibraryEntryRepository.findByAccount_IdOrderByUpdatedAtDesc(accountId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public MangaLibraryEntryResponse save(Integer accountId, MangaLibraryEntryRequest request) {
        Compte account = compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));

        String slug = request.mangaSlug().trim();
        MangaLibraryEntry entry = mangaLibraryEntryRepository
                .findByAccount_IdAndMangaSlug(accountId, slug)
                .orElseGet(() -> new MangaLibraryEntry(account, slug));

        AnimeWatchStatus status = parseStatus(request.status());
        int totalVolumes = positive(request.totalVolumes());
        int readVolumes = clampProgress(request.readVolumes(), totalVolumes);
        if (status == AnimeWatchStatus.PLANNED) {
            readVolumes = 0;
        }
        validateProgress(status, readVolumes);
        status = normalizeProgressStatus(status, readVolumes, totalVolumes);

        entry.setTitle(request.title().trim());
        entry.setCoverUrl(clean(request.coverUrl()));
        entry.setStatus(status);
        entry.setReadChapters(clampProgress(request.readChapters(), request.totalChapters()));
        entry.setTotalChapters(positive(request.totalChapters()));
        entry.setReadVolumes(readVolumes);
        entry.setTotalVolumes(totalVolumes);
        entry.setScore(clampScore(request.score()));
        entry.setFavorite(Boolean.TRUE.equals(request.favorite()));
        entry.setNotes(clean(request.notes()));
        entry.setCatalogType(cleanNullable(request.catalogType()));
        entry.setCatalogScore(cleanCatalogScore(request.catalogScore()));
        entry.setCatalogYear(positiveOrNull(request.catalogYear()));
        entry.setCatalogGenres(joinCatalogList(request.catalogGenres()));
        entry.setCatalogAuthors(joinCatalogList(request.catalogAuthors()));

        return toResponse(mangaLibraryEntryRepository.save(entry));
    }

    @Transactional
    public void delete(Integer accountId, Integer entryId) {
        ensureAccountExists(accountId);
        if (!mangaLibraryEntryRepository.existsByIdAndAccount_Id(entryId, accountId)) {
            throw new IllegalArgumentException("Entree introuvable.");
        }

        mangaLibraryEntryRepository.deleteById(entryId);
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
            throw new IllegalArgumentException("Statut Mangatheque invalide.");
        }
    }

    private Integer clampProgress(Integer read, Integer total) {
        int cleanRead = positive(read);
        int cleanTotal = positive(total);
        return cleanTotal == 0 ? cleanRead : Math.min(cleanRead, cleanTotal);
    }

    private void validateProgress(AnimeWatchStatus status, int readVolumes) {
        if (status == AnimeWatchStatus.WATCHING && readVolumes <= 0) {
            throw new IllegalArgumentException("Un manga en cours doit avoir au moins 1 tome lu.");
        }
    }

    private AnimeWatchStatus normalizeProgressStatus(AnimeWatchStatus status, int readVolumes, int totalVolumes) {
        if (totalVolumes > 0 && readVolumes >= totalVolumes) {
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

    private Double cleanCatalogScore(Double score) {
        if (score == null || !Double.isFinite(score)) {
            return null;
        }

        return Math.max(0, Math.min(score, 10));
    }

    private Integer positiveOrNull(Integer value) {
        if (value == null || value <= 0) {
            return null;
        }

        return value;
    }

    private int positive(Integer value) {
        return Math.max(0, value == null ? 0 : value);
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

    private String joinCatalogList(List<String> values) {
        if (values == null || values.isEmpty()) {
            return "";
        }

        return values.stream()
                .map(this::clean)
                .filter((value) -> !value.isBlank())
                .distinct()
                .reduce((left, right) -> left + "\n" + right)
                .orElse("");
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

    private MangaLibraryEntryResponse toResponse(MangaLibraryEntry entry) {
        return new MangaLibraryEntryResponse(
                entry.getId(),
                entry.getAccount().getId(),
                entry.getMangaSlug(),
                entry.getTitle(),
                entry.getCoverUrl(),
                displayStatus(entry),
                entry.getReadChapters(),
                entry.getTotalChapters(),
                positive(entry.getReadVolumes()),
                positive(entry.getTotalVolumes()),
                entry.getScore(),
                entry.getFavorite(),
                entry.getNotes(),
                entry.getUpdatedAt(),
                entry.getCatalogType(),
                entry.getCatalogScore(),
                entry.getCatalogYear(),
                splitCatalogList(entry.getCatalogGenres()),
                splitCatalogList(entry.getCatalogAuthors())
        );
    }

    private AnimeWatchStatus displayStatus(MangaLibraryEntry entry) {
        int readVolumes = positive(entry.getReadVolumes());
        int totalVolumes = positive(entry.getTotalVolumes());

        if (entry.getStatus() == AnimeWatchStatus.WATCHING && readVolumes <= 0) {
            return AnimeWatchStatus.PLANNED;
        }

        if (totalVolumes > 0 && readVolumes >= totalVolumes) {
            return AnimeWatchStatus.COMPLETED;
        }

        return entry.getStatus();
    }
}
