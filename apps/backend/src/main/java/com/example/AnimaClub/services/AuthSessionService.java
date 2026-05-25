package com.example.AnimaClub.services;

import com.example.AnimaClub.model.AccountSession;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.repository.AccountSessionRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

@Service
public class AuthSessionService {

    public record IssuedSession(String token, Instant expiresAt) {
    }

    private static final Duration SESSION_TTL = Duration.ofDays(30);
    private static final String BEARER_PREFIX = "Bearer ";

    private final AccountSessionRepository accountSessionRepository;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthSessionService(AccountSessionRepository accountSessionRepository) {
        this.accountSessionRepository = accountSessionRepository;
    }

    @Transactional
    public IssuedSession createSession(Compte account) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(SESSION_TTL);
        String token = createToken();

        accountSessionRepository.deleteByExpiresAtBefore(now);
        accountSessionRepository.save(new AccountSession(account, hashToken(token), now, expiresAt));

        return new IssuedSession(token, expiresAt);
    }

    @Transactional(readOnly = true)
    public Compte requireSession(String authorizationHeader) {
        String token = bearerToken(authorizationHeader);
        AccountSession session = accountSessionRepository.findByTokenHash(hashToken(token))
                .orElseThrow(() -> unauthorized("Session invalide."));

        if (session.isExpired()) {
            throw unauthorized("Session expiree.");
        }

        Compte account = session.getAccount();
        account.getId();
        return account;
    }

    @Transactional(readOnly = true)
    public Compte requireAccount(String authorizationHeader, Integer accountId) {
        Compte account = requireSession(authorizationHeader);
        if (!account.getId().equals(accountId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acces refuse pour ce compte.");
        }

        return account;
    }

    @Transactional
    public void revoke(String authorizationHeader) {
        String token = optionalBearerToken(authorizationHeader);
        if (token == null) {
            return;
        }

        accountSessionRepository.deleteByTokenHash(hashToken(token));
    }

    private String bearerToken(String authorizationHeader) {
        String token = optionalBearerToken(authorizationHeader);
        if (token == null) {
            throw unauthorized("Authentification requise.");
        }

        return token;
    }

    private String optionalBearerToken(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith(BEARER_PREFIX)) {
            return null;
        }

        String token = authorizationHeader.substring(BEARER_PREFIX.length()).trim();
        return token.isBlank() ? null : token;
    }

    private String createToken() {
        byte[] bytes = new byte[48];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hashToken(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 indisponible.", exception);
        }
    }

    private ResponseStatusException unauthorized(String reason) {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, reason);
    }
}
