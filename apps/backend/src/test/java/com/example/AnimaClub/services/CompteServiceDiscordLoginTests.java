package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.LoginResponse;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.repository.CompteRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Transactional
class CompteServiceDiscordLoginTests {

    @Autowired
    private CompteService compteService;

    @Autowired
    private CompteRepository compteRepository;

    @Test
    void discordLoginRequiresExistingAnimeClubAccountWithSameEmail() {
        Optional<LoginResponse> response = compteService.loginWithVerifiedDiscordEmail("missing-discord@example.test");

        assertTrue(response.isEmpty());
    }

    @Test
    void discordLoginWorksForVerifiedMatchingEmail() {
        Compte account = account("discord-ok", "discord-ok@example.test");

        Optional<LoginResponse> response = compteService.loginWithVerifiedDiscordEmail("DISCORD-OK@example.test");

        assertTrue(response.isPresent());
        assertEquals(account.getId(), response.orElseThrow().account().id());
        assertFalse(response.orElseThrow().sessionToken().isBlank());
    }

    @Test
    void discordLoginRejectsUnconfirmedAnimeClubEmail() {
        Compte account = account("discord-wait", "discord-wait@example.test");
        account.prepareEmailConfirmation("pending-token", Instant.now().plusSeconds(3600));
        compteRepository.save(account);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> compteService.loginWithVerifiedDiscordEmail("discord-wait@example.test")
        );

        assertEquals(HttpStatus.FORBIDDEN, exception.getStatusCode());
    }

    private Compte account(String pseudo, String mail) {
        return compteRepository.save(new Compte(pseudo, mail, "{noop}password"));
    }
}
