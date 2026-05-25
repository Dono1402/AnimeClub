package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.ChangePendingEmailRequest;
import com.example.AnimaClub.dto.ChangePendingEmailResponse;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.repository.CompteRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
@Transactional
class CompteServicePendingEmailTests {

    @Autowired
    private CompteService compteService;

    @Autowired
    private CompteRepository compteRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void changesEmailOnlyForUnconfirmedAccountWithPassword() {
        Compte account = pendingAccount("pending-mail", "wrong@example.test", "old-token");

        ChangePendingEmailResponse response = compteService.changePendingEmail(new ChangePendingEmailRequest(
                "pending-mail",
                "secretpass",
                "new@example.test"
        ));

        Compte storedAccount = compteRepository.findById(account.getId()).orElseThrow();
        assertEquals("new@example.test", storedAccount.getMail());
        assertFalse(storedAccount.isEmailVerified());
        assertNotEquals("old-token", storedAccount.getEmailConfirmationToken());
        assertEquals("Adresse de validation mise a jour. Un nouveau mail de confirmation a ete envoye.", response.message());
    }

    @Test
    void rejectsWrongPassword() {
        pendingAccount("pending-wrong", "pending-wrong@example.test", "old-token");

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> compteService.changePendingEmail(new ChangePendingEmailRequest(
                        "pending-wrong",
                        "badpassword",
                        "new-wrong@example.test"
                ))
        );

        assertEquals(HttpStatus.UNAUTHORIZED, exception.getStatusCode());
    }

    @Test
    void rejectsVerifiedAccount() {
        compteRepository.save(new Compte("verified-mail", "verified-mail@example.test", passwordEncoder.encode("secretpass")));

        assertThrows(
                IllegalArgumentException.class,
                () -> compteService.changePendingEmail(new ChangePendingEmailRequest(
                        "verified-mail",
                        "secretpass",
                        "new-verified@example.test"
                ))
        );
    }

    @Test
    void rejectsEmailAlreadyUsedByAnotherAccount() {
        pendingAccount("pending-conflict", "pending-conflict@example.test", "old-token");
        compteRepository.save(new Compte("other-mail", "other-mail@example.test", passwordEncoder.encode("secretpass")));

        assertThrows(
                IllegalArgumentException.class,
                () -> compteService.changePendingEmail(new ChangePendingEmailRequest(
                        "pending-conflict",
                        "secretpass",
                        "other-mail@example.test"
                ))
        );
    }

    private Compte pendingAccount(String pseudo, String mail, String token) {
        Compte account = new Compte(pseudo, mail, passwordEncoder.encode("secretpass"));
        account.prepareEmailConfirmation(token, Instant.now().plusSeconds(3600));
        return compteRepository.save(account);
    }
}
