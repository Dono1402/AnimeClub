package com.example.AnimaClub.security;

import jakarta.servlet.ServletException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertEquals;

class OriginProtectionFilterTests {

    @Test
    void allowsSafeRequestsWithoutOriginCheck() throws ServletException, IOException {
        OriginProtectionFilter filter = filter();
        MockHttpServletRequest request = request("GET", "/account/public/demo");
        request.addHeader("Origin", "https://evil.example");

        assertEquals(200, statusFor(filter, request));
    }

    @Test
    void allowsUnsafeRequestsFromConfiguredOrigin() throws ServletException, IOException {
        OriginProtectionFilter filter = filter();
        MockHttpServletRequest request = request("POST", "/account/login");
        request.addHeader("Origin", "https://animeclub.fr");

        assertEquals(200, statusFor(filter, request));
    }

    @Test
    void allowsUnsafeRequestsFromConfiguredWildcardPattern() throws ServletException, IOException {
        OriginProtectionFilter filter = filter();
        MockHttpServletRequest request = request("POST", "/account/login");
        request.addHeader("Origin", "http://127.0.0.1:4200");

        assertEquals(200, statusFor(filter, request));
    }

    @Test
    void rejectsUnsafeRequestsFromUnknownOrigin() throws ServletException, IOException {
        OriginProtectionFilter filter = filter();
        MockHttpServletRequest request = request("POST", "/account/login");
        request.addHeader("Origin", "https://evil.example");

        assertEquals(403, statusFor(filter, request));
    }

    @Test
    void rejectsUnsafeRequestsFromUnknownRefererWhenOriginIsMissing() throws ServletException, IOException {
        OriginProtectionFilter filter = filter();
        MockHttpServletRequest request = request("POST", "/account/login");
        request.addHeader("Referer", "https://evil.example/path");

        assertEquals(403, statusFor(filter, request));
    }

    @Test
    void allowsUnsafeRequestsWithoutBrowserOriginHeaders() throws ServletException, IOException {
        OriginProtectionFilter filter = filter();
        MockHttpServletRequest request = request("POST", "/account/login");

        assertEquals(200, statusFor(filter, request));
    }

    private OriginProtectionFilter filter() {
        return new OriginProtectionFilter(
                true,
                "https://animeclub.fr",
                new String[]{"https://www.animeclub.fr"},
                new String[]{"http://*:4200"}
        );
    }

    private MockHttpServletRequest request(String method, String path) {
        return new MockHttpServletRequest(method, path);
    }

    private int statusFor(OriginProtectionFilter filter, MockHttpServletRequest request) throws ServletException, IOException {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response.getStatus();
    }
}
