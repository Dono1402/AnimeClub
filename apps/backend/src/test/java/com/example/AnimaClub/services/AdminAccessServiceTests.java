package com.example.AnimaClub.services;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AdminAccessServiceTests {

    @Test
    void rejectsImportWhenNoTokenIsConfigured() {
        AdminAccessService service = new AdminAccessService("", false);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> service.requireImportAccess("anything")
        );

        assertEquals(HttpStatus.FORBIDDEN, exception.getStatusCode());
    }

    @Test
    void requiresConfiguredTokenWhenStartupValidationIsEnabled() {
        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                () -> new AdminAccessService("", true)
        );

        assertEquals("ADMIN_IMPORT_TOKEN est requis pour activer les acces admin.", exception.getMessage());
    }

    @Test
    void rejectsImportWhenProvidedTokenDoesNotMatch() {
        AdminAccessService service = new AdminAccessService("expected-token", true);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> service.requireImportAccess("wrong-token")
        );

        assertEquals(HttpStatus.FORBIDDEN, exception.getStatusCode());
    }

    @Test
    void allowsImportWhenProvidedTokenMatches() {
        AdminAccessService service = new AdminAccessService("expected-token", true);

        assertDoesNotThrow(() -> service.requireImportAccess(" expected-token "));
    }

    @Test
    void rejectsAdminAccessWhenProvidedTokenDoesNotMatch() {
        AdminAccessService service = new AdminAccessService("expected-token", true);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> service.requireAdminAccess("wrong-token")
        );

        assertEquals(HttpStatus.FORBIDDEN, exception.getStatusCode());
    }

    @Test
    void allowsAdminAccessWhenProvidedTokenMatches() {
        AdminAccessService service = new AdminAccessService("expected-token", true);

        assertDoesNotThrow(() -> service.requireAdminAccess(" expected-token "));
    }
}
