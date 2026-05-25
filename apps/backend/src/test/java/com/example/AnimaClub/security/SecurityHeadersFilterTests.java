package com.example.AnimaClub.security;

import jakarta.servlet.ServletException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class SecurityHeadersFilterTests {

    private final SecurityHeadersFilter filter = new SecurityHeadersFilter();

    @Test
    void addsBaselineSecurityHeaders() throws ServletException, IOException {
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(new MockHttpServletRequest("GET", "/actuator/health"), response, new MockFilterChain());

        assertNotNull(response.getHeader("Content-Security-Policy"));
        assertEquals("nosniff", response.getHeader("X-Content-Type-Options"));
        assertEquals("DENY", response.getHeader("X-Frame-Options"));
        assertEquals("strict-origin-when-cross-origin", response.getHeader("Referrer-Policy"));
        assertNotNull(response.getHeader("Permissions-Policy"));
    }
}
