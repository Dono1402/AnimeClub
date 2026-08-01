package com.example.AnimaClub.security;

import jakarta.servlet.ServletException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SimpleRateLimitFilterTests {

    @Test
    void limitsRepeatedSensitiveRequests() throws ServletException, IOException {
        SimpleRateLimitFilter filter = new SimpleRateLimitFilter();
        ReflectionTestUtils.setField(filter, "enabled", true);
        ReflectionTestUtils.setField(filter, "windowSeconds", 60L);
        ReflectionTestUtils.setField(filter, "publicMaxRequests", 120);
        ReflectionTestUtils.setField(filter, "sensitiveMaxRequests", 2);

        assertEquals(200, statusFor(filter, request("POST", "/account/login")));
        assertEquals(200, statusFor(filter, request("POST", "/account/login")));
        assertEquals(429, statusFor(filter, request("POST", "/account/login")));
    }

    @Test
    void limitsPendingEmailChangeRequests() throws ServletException, IOException {
        SimpleRateLimitFilter filter = new SimpleRateLimitFilter();
        ReflectionTestUtils.setField(filter, "enabled", true);
        ReflectionTestUtils.setField(filter, "windowSeconds", 60L);
        ReflectionTestUtils.setField(filter, "publicMaxRequests", 120);
        ReflectionTestUtils.setField(filter, "sensitiveMaxRequests", 1);

        assertEquals(200, statusFor(filter, request("POST", "/account/email-confirmation/change-address")));
        assertEquals(429, statusFor(filter, request("POST", "/account/email-confirmation/change-address")));
    }

    @Test
    void limitsPasswordResetAndTelemetryRequests() throws ServletException, IOException {
        SimpleRateLimitFilter filter = new SimpleRateLimitFilter();
        ReflectionTestUtils.setField(filter, "enabled", true);
        ReflectionTestUtils.setField(filter, "windowSeconds", 60L);
        ReflectionTestUtils.setField(filter, "publicMaxRequests", 1);
        ReflectionTestUtils.setField(filter, "sensitiveMaxRequests", 1);

        assertEquals(200, statusFor(filter, request("POST", "/account/password-reset/request")));
        assertEquals(429, statusFor(filter, request("POST", "/account/password-reset/request")));
        assertEquals(200, statusFor(filter, request("POST", "/telemetry/frontend")));
        assertEquals(429, statusFor(filter, request("POST", "/telemetry/frontend")));
    }

    @Test
    void givesTranslationRequestsTheirOwnLimit() throws ServletException, IOException {
        SimpleRateLimitFilter filter = new SimpleRateLimitFilter();
        ReflectionTestUtils.setField(filter, "enabled", true);
        ReflectionTestUtils.setField(filter, "windowSeconds", 60L);
        ReflectionTestUtils.setField(filter, "publicMaxRequests", 120);
        ReflectionTestUtils.setField(filter, "sensitiveMaxRequests", 1);
        ReflectionTestUtils.setField(filter, "translationMaxRequests", 2);

        assertEquals(200, statusFor(filter, request("POST", "/translation")));
        assertEquals(200, statusFor(filter, request("POST", "/translation")));
        assertEquals(429, statusFor(filter, request("POST", "/translation")));
    }

    @Test
    void ignoresUnlistedRoutes() throws ServletException, IOException {
        SimpleRateLimitFilter filter = new SimpleRateLimitFilter();
        ReflectionTestUtils.setField(filter, "enabled", true);
        ReflectionTestUtils.setField(filter, "windowSeconds", 60L);
        ReflectionTestUtils.setField(filter, "publicMaxRequests", 1);
        ReflectionTestUtils.setField(filter, "sensitiveMaxRequests", 1);

        assertEquals(200, statusFor(filter, request("GET", "/actuator/health")));
        assertEquals(200, statusFor(filter, request("GET", "/actuator/health")));
    }

    private MockHttpServletRequest request(String method, String path) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setRemoteAddr("127.0.0.1");
        return request;
    }

    private int statusFor(SimpleRateLimitFilter filter, MockHttpServletRequest request) throws ServletException, IOException {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response.getStatus();
    }
}
