package com.example.AnimaClub.controller;

import com.example.AnimaClub.dto.MangaLibraryEntryRequest;
import com.example.AnimaClub.dto.MangaLibraryEntryResponse;
import com.example.AnimaClub.services.MangathequeService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/mangatheque")
public class MangathequeController {

    private final MangathequeService mangathequeService;

    public MangathequeController(MangathequeService mangathequeService) {
        this.mangathequeService = mangathequeService;
    }

    @GetMapping("/{accountId}")
    public List<MangaLibraryEntryResponse> list(@PathVariable Integer accountId) {
        return mangathequeService.list(accountId);
    }

    @GetMapping("/public/{accountId}")
    public List<MangaLibraryEntryResponse> publicList(@PathVariable Integer accountId) {
        return mangathequeService.publicList(accountId);
    }

    @PostMapping("/{accountId}")
    public MangaLibraryEntryResponse save(
            @PathVariable Integer accountId,
            @Valid @RequestBody MangaLibraryEntryRequest request
    ) {
        return mangathequeService.save(accountId, request);
    }

    @DeleteMapping("/{accountId}/{entryId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Integer accountId, @PathVariable Integer entryId) {
        mangathequeService.delete(accountId, entryId);
    }
}
