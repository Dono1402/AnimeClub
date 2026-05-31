package com.example.AnimaClub.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Component
public class OriginProtectionFilter extends OncePerRequestFilter {

    private final boolean enabled;
    private final List<String> allowedOrigins;
    private final List<String> allowedOriginPatterns;

    public OriginProtectionFilter(
            @Value("${app.security.origin-check-enabled:true}") boolean enabled,
            @Value("${app.frontend-url:}") String frontendUrl,
            @Value("${app.cors.allowed-origins:}") String[] corsAllowedOrigins,
            @Value("${app.cors.allowed-origin-patterns:}") String[] corsAllowedOriginPatterns
    ) {
        this.enabled = enabled;
        this.allowedOrigins = normalizedOrigins(frontendUrl, corsAllowedOrigins);
        this.allowedOriginPatterns = normalizedValues(corsAllowedOriginPatterns);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        if (!enabled || isSafeMethod(request.getMethod()) || hasAllowedBrowserOrigin(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        response.sendError(HttpServletResponse.SC_FORBIDDEN, "Origine de requete non autorisee.");
    }

    private boolean hasAllowedBrowserOrigin(HttpServletRequest request) {
        String origin = normalizedOrigin(request.getHeader("Origin"));
        if (origin != null) {
            return isAllowedOrigin(origin);
        }

        String referer = normalizedOrigin(request.getHeader("Referer"));
        return referer == null || isAllowedOrigin(referer);
    }

    private boolean isAllowedOrigin(String origin) {
        if (allowedOrigins.contains(origin)) {
            return true;
        }

        for (String pattern : allowedOriginPatterns) {
            if (matchesSimpleWildcard(pattern, origin)) {
                return true;
            }
        }

        return false;
    }

    private boolean matchesSimpleWildcard(String pattern, String origin) {
        if (!pattern.contains("*")) {
            return pattern.equals(origin);
        }

        String[] parts = pattern.split("\\*", -1);
        int cursor = 0;
        boolean first = true;

        for (String part : parts) {
            if (part.isEmpty()) {
                first = false;
                continue;
            }

            int index = origin.indexOf(part, cursor);
            if (index < 0 || (first && index != 0)) {
                return false;
            }

            cursor = index + part.length();
            first = false;
        }

        String last = parts.length == 0 ? "" : parts[parts.length - 1];
        return last.isEmpty() || origin.endsWith(last);
    }

    private boolean isSafeMethod(String method) {
        return "GET".equalsIgnoreCase(method)
                || "HEAD".equalsIgnoreCase(method)
                || "OPTIONS".equalsIgnoreCase(method)
                || "TRACE".equalsIgnoreCase(method);
    }

    private List<String> normalizedOrigins(String frontendUrl, String[] configuredOrigins) {
        List<String> origins = new ArrayList<>();
        addNormalizedOrigin(origins, frontendUrl);
        for (String origin : normalizedValues(configuredOrigins)) {
            addNormalizedOrigin(origins, origin);
        }
        return List.copyOf(origins);
    }

    private void addNormalizedOrigin(List<String> origins, String value) {
        String origin = normalizedOrigin(value);
        if (origin != null && !origins.contains(origin)) {
            origins.add(origin);
        }
    }

    private List<String> normalizedValues(String[] values) {
        List<String> normalized = new ArrayList<>();
        if (values == null) {
            return normalized;
        }

        for (String value : values) {
            if (value == null) {
                continue;
            }

            for (String part : value.split(",")) {
                String cleanValue = part.trim();
                if (!cleanValue.isEmpty()) {
                    normalized.add(cleanValue.toLowerCase(Locale.ROOT).replaceAll("/+$", ""));
                }
            }
        }

        return normalized;
    }

    private String normalizedOrigin(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            URI uri = new URI(value.trim());
            if (uri.getScheme() == null || uri.getHost() == null) {
                return null;
            }

            StringBuilder origin = new StringBuilder()
                    .append(uri.getScheme().toLowerCase(Locale.ROOT))
                    .append("://")
                    .append(uri.getHost().toLowerCase(Locale.ROOT));
            if (uri.getPort() != -1) {
                origin.append(':').append(uri.getPort());
            }
            return origin.toString();
        } catch (URISyntaxException exception) {
            return null;
        }
    }
}
