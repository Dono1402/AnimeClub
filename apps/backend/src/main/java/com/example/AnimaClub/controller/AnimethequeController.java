package com.example.AnimaClub.controller;

import com.example.AnimaClub.dto.AnimeLibraryEntryRequest;
import com.example.AnimaClub.dto.AnimeLibraryEntryResponse;
import com.example.AnimaClub.services.AnimethequeService;
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
@RequestMapping("/animetheque")
public class AnimethequeController {

    private final AnimethequeService animethequeService;

    public AnimethequeController(AnimethequeService animethequeService) {
        this.animethequeService = animethequeService;
    }

    @GetMapping("/{accountId}")
    public List<AnimeLibraryEntryResponse> list(@PathVariable Integer accountId) {
        return animethequeService.list(accountId);
    }

    @GetMapping("/public/{accountId}")
    public List<AnimeLibraryEntryResponse> publicList(@PathVariable Integer accountId) {
        return animethequeService.publicList(accountId);
    }

    @PostMapping("/{accountId}")
    public AnimeLibraryEntryResponse save(
            @PathVariable Integer accountId,
            @Valid @RequestBody AnimeLibraryEntryRequest request
    ) {
        return animethequeService.save(accountId, request);
    }

    @DeleteMapping("/{accountId}/{entryId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Integer accountId, @PathVariable Integer entryId) {
        animethequeService.delete(accountId, entryId);
    }

}
