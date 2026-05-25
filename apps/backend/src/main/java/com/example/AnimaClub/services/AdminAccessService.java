package com.example.AnimaClub.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Service
public class AdminAccessService {

    private final String importToken;

    public AdminAccessService(
            @Value("${app.admin.import-token:}") String importToken,
            @Value("${app.admin.require-token-on-startup:true}") boolean requireTokenOnStartup
    ) {
        this.importToken = importToken == null ? "" : importToken.trim();

        if (requireTokenOnStartup && this.importToken.isBlank()) {
            throw new IllegalStateException("ADMIN_IMPORT_TOKEN est requis pour activer les acces admin.");
        }
    }

    public void requireImportAccess(String providedToken) {
        requireAdminAccess(providedToken, "Import catalogue non autorise.");
    }

    public void requireAdminAccess(String providedToken) {
        requireAdminAccess(providedToken, "Acces admin non autorise.");
    }

    private void requireAdminAccess(String providedToken, String message) {
        String token = providedToken == null ? "" : providedToken.trim();
        if (importToken.isBlank() || token.isBlank() || !tokenMatches(token)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, message);
        }
    }

    private boolean tokenMatches(String providedToken) {
        byte[] expectedBytes = importToken.getBytes(StandardCharsets.UTF_8);
        byte[] providedBytes = providedToken.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expectedBytes, providedBytes);
    }
}
