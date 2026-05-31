package com.example.AnimaClub.services;

import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.repository.CompteRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
class AuthSessionServiceTests {

    @Autowired
    private AuthSessionService authSessionService;

    @Autowired
    private CompteRepository compteRepository;

    @Test
    void createsBearerSessionForMatchingAccount() {
        Compte account = account("auth-ok");

        AuthSessionService.IssuedSession session = authSessionService.createSession(account);

        assertNotNull(session.expiresAt());
        assertFalse(session.token().isBlank());
        assertEquals(
                account.getId(),
                authSessionService.requireAccount("Bearer " + session.token(), account.getId()).getId()
        );
    }

    @Test
    void acceptsHttpOnlyCookieSessionForMatchingAccount() {
        Compte account = account("auth-cookie");
        AuthSessionService.IssuedSession session = authSessionService.createSession(account);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie("__Host-animeclub_session", session.token()));

        assertEquals(account.getId(), authSessionService.requireAccount(request, account.getId()).getId());
    }

    @Test
    void rejectsMissingBearerToken() {
        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> authSessionService.requireAccount((String) null, 1)
        );

        assertEquals(HttpStatus.UNAUTHORIZED, exception.getStatusCode());
    }

    @Test
    void rejectsCrossAccountAccess() {
        Compte account = account("auth-a");
        Compte other = account("auth-b");
        AuthSessionService.IssuedSession session = authSessionService.createSession(account);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> authSessionService.requireAccount("Bearer " + session.token(), other.getId())
        );

        assertEquals(HttpStatus.FORBIDDEN, exception.getStatusCode());
    }

    @Test
    void rejectsRevokedSession() {
        Compte account = account("auth-revoke");
        AuthSessionService.IssuedSession session = authSessionService.createSession(account);
        String authorization = "Bearer " + session.token();

        authSessionService.revoke(authorization);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> authSessionService.requireAccount(authorization, account.getId())
        );

        assertEquals(HttpStatus.UNAUTHORIZED, exception.getStatusCode());
    }

    private Compte account(String pseudo) {
        return compteRepository.save(new Compte(pseudo, pseudo + "@example.test", "{noop}password"));
    }
}
