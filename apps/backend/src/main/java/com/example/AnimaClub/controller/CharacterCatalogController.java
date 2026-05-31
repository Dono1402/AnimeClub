package com.example.AnimaClub.controller;

import com.example.AnimaClub.dto.CharacterCatalogEntryResponse;
import com.example.AnimaClub.dto.CharacterCatalogImportStatusResponse;
import com.example.AnimaClub.dto.CharacterCatalogPageResponse;
import com.example.AnimaClub.dto.StartCharacterCatalogImportRequest;
import com.example.AnimaClub.services.AdminAccessService;
import com.example.AnimaClub.services.CharacterCatalogService;
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
@RequestMapping("/character-catalog")
public class CharacterCatalogController {

    private final CharacterCatalogService characterCatalogService;
    private final AdminAccessService adminAccessService;

    public CharacterCatalogController(CharacterCatalogService characterCatalogService, AdminAccessService adminAccessService) {
        this.characterCatalogService = characterCatalogService;
        this.adminAccessService = adminAccessService;
    }

    @GetMapping
    public CharacterCatalogPageResponse list(
            @RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "24") int pageSize
    ) {
        return characterCatalogService.list(query, page, pageSize);
    }

    @GetMapping("/popular")
    public List<CharacterCatalogEntryResponse> popular(
            @RequestParam(defaultValue = "12") int limit
    ) {
        return characterCatalogService.popular(limit);
    }

    @GetMapping("/suggestions")
    public List<CharacterCatalogEntryResponse> suggestions(
            @RequestParam String query,
            @RequestParam(defaultValue = "5") int limit
    ) {
        return characterCatalogService.suggestions(query, limit);
    }

    @GetMapping("/anime/{malId}")
    public List<CharacterCatalogEntryResponse> byAnimeMalId(
            @PathVariable Integer malId,
            @RequestParam(defaultValue = "12") int limit
    ) {
        return characterCatalogService.charactersForAnime(malId, limit);
    }

    @GetMapping("/mal/{malId}")
    public CharacterCatalogEntryResponse byMalId(@PathVariable Integer malId) {
        CharacterCatalogEntryResponse character = characterCatalogService.findByMalId(malId);
        if (character == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Personnage introuvable.");
        }

        return character;
    }

    @GetMapping("/slug/{slug}")
    public CharacterCatalogEntryResponse bySlug(@PathVariable String slug) {
        CharacterCatalogEntryResponse character = characterCatalogService.findBySlug(slug);
        if (character == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Personnage introuvable.");
        }

        return character;
    }

    @GetMapping("/import/status")
    public CharacterCatalogImportStatusResponse importStatus(
            @RequestHeader(value = "X-Admin-Token", required = false) String adminToken
    ) {
        adminAccessService.requireAdminAccess(adminToken);
        return characterCatalogService.status();
    }

    @PostMapping("/import/start")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public CharacterCatalogImportStatusResponse startImport(
            @RequestHeader(value = "X-Admin-Token", required = false) String adminToken,
            @Valid @RequestBody(required = false) StartCharacterCatalogImportRequest request
    ) {
        adminAccessService.requireImportAccess(adminToken);
        boolean globalCatalog = request != null && Boolean.TRUE.equals(request.globalCatalog());
        if (globalCatalog) {
            return characterCatalogService.startGlobalImport(
                    request.maxPages(),
                    request.startPage(),
                    Boolean.TRUE.equals(request.reset()),
                    Boolean.TRUE.equals(request.retryErrors())
            );
        }

        return characterCatalogService.startAnimeLinkImport(
                request == null ? null : request.maxPages(),
                request != null && Boolean.TRUE.equals(request.reset()),
                request != null && Boolean.TRUE.equals(request.retryErrors())
        );
    }
}
