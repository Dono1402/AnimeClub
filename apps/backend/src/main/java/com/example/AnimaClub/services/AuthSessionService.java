package com.example.AnimaClub.services;

import com.example.AnimaClub.model.AccountSession;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.repository.AccountSessionRepository;
import com.example.AnimaClub.security.SecurityTokenHasher;
import com.example.AnimaClub.security.SessionCookieService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

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
    private final SessionCookieService sessionCookieService;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthSessionService(AccountSessionRepository accountSessionRepository, SessionCookieService sessionCookieService) {
        this.accountSessionRepository = accountSessionRepository;
        this.sessionCookieService = sessionCookieService;
    }

    @Transactional
    public IssuedSession createSession(Compte account) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(SESSION_TTL);
        String token = createToken();

        accountSessionRepository.deleteByExpiresAtBefore(now);
        accountSessionRepository.save(new AccountSession(account, SecurityTokenHasher.sha256Base64Url(token), now, expiresAt));

        return new IssuedSession(token, expiresAt);
    }

    @Transactional(readOnly = true)
    public Compte requireSession(String authorizationHeader) {
        String token = bearerToken(authorizationHeader);
        return requireToken(token);
    }

    @Transactional(readOnly = true)
    public Compte requireSession(HttpServletRequest request) {
        String token = requestToken(request);
        return requireToken(token);
    }

    @Transactional(readOnly = true)
    public Compte requireAccount(String authorizationHeader, Integer accountId) {
        Compte account = requireSession(authorizationHeader);
        if (!account.getId().equals(accountId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acces refuse pour ce compte.");
        }

        return account;
    }

    @Transactional(readOnly = true)
    public Compte requireAccount(HttpServletRequest request, Integer accountId) {
        Compte account = requireSession(request);
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

        accountSessionRepository.deleteByTokenHash(SecurityTokenHasher.sha256Base64Url(token));
    }

    @Transactional
    public void revoke(HttpServletRequest request) {
        String token = optionalRequestToken(request);
        if (token == null) {
            return;
        }

        accountSessionRepository.deleteByTokenHash(SecurityTokenHasher.sha256Base64Url(token));
    }

    private Compte requireToken(String token) {
        AccountSession session = accountSessionRepository.findByTokenHash(SecurityTokenHasher.sha256Base64Url(token))
                .orElseThrow(() -> unauthorized("Session invalide."));

        if (session.isExpired()) {
            throw unauthorized("Session expiree.");
        }

        Compte account = session.getAccount();
        account.getId();
        return account;
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

    private String requestToken(HttpServletRequest request) {
        String token = optionalRequestToken(request);
        if (token == null) {
            throw unauthorized("Authentification requise.");
        }

        return token;
    }

    private String optionalRequestToken(HttpServletRequest request) {
        if (request == null) {
            return null;
        }

        String bearerToken = optionalBearerToken(request.getHeader("Authorization"));
        if (bearerToken != null) {
            return bearerToken;
        }

        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }

        for (Cookie cookie : cookies) {
            if (sessionCookieService.cookieName().equals(cookie.getName())) {
                String token = cookie.getValue();
                return token == null || token.isBlank() ? null : token.trim();
            }
        }

        return null;
    }

    private String createToken() {
        byte[] bytes = new byte[48];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private ResponseStatusException unauthorized(String reason) {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, reason);
    }
}
