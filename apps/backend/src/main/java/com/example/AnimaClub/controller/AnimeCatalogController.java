package com.example.AnimaClub.controller;

import com.example.AnimaClub.dto.AnimeCatalogEntryResponse;
import com.example.AnimaClub.dto.AnimeCatalogFilterOptionsResponse;
import com.example.AnimaClub.dto.AnimeCatalogImportStatusResponse;
import com.example.AnimaClub.dto.AnimeCatalogPageResponse;
import com.example.AnimaClub.dto.AnimeImageColorResponse;
import com.example.AnimaClub.dto.StartAnimeCatalogImportRequest;
import com.example.AnimaClub.services.AdminAccessService;
import com.example.AnimaClub.services.AnimeCatalogService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/anime-catalog")
public class AnimeCatalogController {

    private final AnimeCatalogService animeCatalogService;
    private final AdminAccessService adminAccessService;

    public AnimeCatalogController(AnimeCatalogService animeCatalogService, AdminAccessService adminAccessService) {
        this.animeCatalogService = animeCatalogService;
        this.adminAccessService = adminAccessService;
    }

    @GetMapping
    public AnimeCatalogPageResponse list(
            @RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "9") int pageSize,
            @RequestParam(defaultValue = "") String genre,
            @RequestParam(defaultValue = "") String type,
            @RequestParam(defaultValue = "") String status,
            @RequestParam(required = false) Integer year,
            @RequestParam(defaultValue = "") String season,
            @RequestParam(required = false) Double minScore,
            @RequestParam(defaultValue = "title-asc") String sort
    ) {
        return animeCatalogService.list(query, page, pageSize, genre, type, status, year, season, minScore, sort);
    }

    @GetMapping("/filters")
    public AnimeCatalogFilterOptionsResponse filters() {
        return animeCatalogService.filters();
    }

    @GetMapping("/weekly-ranking")
    public List<AnimeCatalogEntryResponse> weeklyRanking(
            @RequestParam(defaultValue = "10") int limit
    ) {
        return animeCatalogService.weeklyRanking(limit);
    }

    @GetMapping("/suggestions")
    public List<AnimeCatalogEntryResponse> suggestions(
            @RequestParam String query,
            @RequestParam(defaultValue = "5") int limit
    ) {
        return animeCatalogService.suggestions(query, limit);
    }

    @GetMapping("/image-color")
    public AnimeImageColorResponse imageColor(@RequestParam String url) {
        return new AnimeImageColorResponse(animeCatalogService.dominantImageColor(url));
    }

    @GetMapping("/mal/{malId}")
    public AnimeCatalogEntryResponse byMalId(@PathVariable Integer malId) {
        AnimeCatalogEntryResponse anime = animeCatalogService.findByMalId(malId);
        if (anime == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Anime introuvable.");
        }

        return anime;
    }

    @GetMapping("/slug/{slug}")
    public AnimeCatalogEntryResponse bySlug(@PathVariable String slug) {
        AnimeCatalogEntryResponse anime = animeCatalogService.findBySlug(slug);
        if (anime == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Anime introuvable.");
        }

        return anime;
    }

    @GetMapping("/import/status")
    public AnimeCatalogImportStatusResponse importStatus() {
        return animeCatalogService.status();
    }

    @PostMapping("/import/start")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public AnimeCatalogImportStatusResponse startImport(
            @RequestHeader(value = "X-Admin-Token", required = false) String adminToken,
            @Valid @RequestBody(required = false) StartAnimeCatalogImportRequest request
    ) {
        adminAccessService.requireImportAccess(adminToken);
        return animeCatalogService.startImport(request == null ? null : request.maxPages());
    }
}
