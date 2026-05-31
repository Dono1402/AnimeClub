package com.example.AnimaClub.security;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

@Component
public class SessionCookieService {

    private final String cookieName;
    private final String cookiePath;
    private final boolean secureCookie;
    private final String sameSite;

    public SessionCookieService(
            @Value("${app.session.cookie-name:__Host-animeclub_session}") String cookieName,
            @Value("${app.session.cookie-path:/}") String cookiePath,
            @Value("${app.session.cookie-secure:true}") boolean secureCookie,
            @Value("${app.session.cookie-same-site:Lax}") String sameSite
    ) {
        this.cookieName = cookieName == null || cookieName.isBlank() ? "__Host-animeclub_session" : cookieName.trim();
        this.cookiePath = cookiePath == null || cookiePath.isBlank() ? "/" : cookiePath.trim();
        this.secureCookie = secureCookie;
        this.sameSite = sameSite == null || sameSite.isBlank() ? "Lax" : sameSite.trim();
    }

    public String cookieName() {
        return cookieName;
    }

    public void writeSessionCookie(
            HttpServletResponse response,
            String token,
            Instant expiresAt,
            boolean persistent
    ) {
        if (response == null || token == null || token.isBlank()) {
            return;
        }

        ResponseCookie.ResponseCookieBuilder cookie = baseCookie(token);
        if (persistent) {
            cookie.maxAge(Duration.ofSeconds(secondsUntil(expiresAt)));
        }

        response.addHeader(HttpHeaders.SET_COOKIE, cookie.build().toString());
    }

    public void clearSessionCookie(HttpServletResponse response) {
        if (response == null) {
            return;
        }

        response.addHeader(HttpHeaders.SET_COOKIE, baseCookie("").maxAge(Duration.ZERO).build().toString());
    }

    private ResponseCookie.ResponseCookieBuilder baseCookie(String value) {
        return ResponseCookie.from(cookieName, value)
                .httpOnly(true)
                .secure(secureCookie)
                .sameSite(sameSite)
                .path(cookiePath);
    }

    private long secondsUntil(Instant expiresAt) {
        if (expiresAt == null) {
            return 1;
        }

        return Math.max(1, Duration.between(Instant.now(), expiresAt).toSeconds());
    }
}
