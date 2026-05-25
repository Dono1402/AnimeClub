package com.example.AnimaClub.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AnimeCatalogServiceImageSecurityTests {

    private final AnimeCatalogService service = new AnimeCatalogService(
            null,
            null,
            new ObjectMapper(),
            "https://api.jikan.moe/v4/anime",
            "https://graphql.anilist.co",
            "https://kitsu.io/api/edge/anime",
            1300,
            false,
            true
    );

    @AfterEach
    void tearDown() {
        service.stop();
    }

    @Test
    void allowsOnlyExpectedImageHosts() {
        assertTrue(service.isAllowedImageHost("cdn.myanimelist.net"));
        assertTrue(service.isAllowedImageHost("media.kitsu.app"));
        assertTrue(service.isAllowedImageHost("s4.anilist.co"));
    }

    @Test
    void rejectsLookalikeMyAnimeListHost() {
        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> service.validateImageColorUri("https://notmyanimelist.net/image.jpg")
        );

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    void rejectsUnsupportedScheme() {
        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> service.validateImageColorUri("file:///etc/passwd")
        );

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }
}
