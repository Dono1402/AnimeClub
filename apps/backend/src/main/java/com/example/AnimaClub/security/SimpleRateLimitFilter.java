package com.example.AnimaClub.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

@Component
public class SimpleRateLimitFilter extends OncePerRequestFilter {

    private static final Pattern ACCOUNT_MESSAGES_PATH = Pattern.compile("^/account/\\d+/messages(?:/.*)?$");
    private static final Pattern ACCOUNT_FOLLOW_PATH = Pattern.compile("^/account/\\d+/follow/\\d+$");
    private static final Pattern LIBRARY_WRITE_PATH = Pattern.compile("^/(animetheque|mangatheque)/\\d+(?:/.*)?$");

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final AtomicLong requestCounter = new AtomicLong();

    @Value("${app.rate-limit.enabled:true}")
    private boolean enabled;

    @Value("${app.rate-limit.window-seconds:60}")
    private long windowSeconds;

    @Value("${app.rate-limit.public-max-requests:120}")
    private int publicMaxRequests;

    @Value("${app.rate-limit.sensitive-max-requests:20}")
    private int sensitiveMaxRequests;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        RateLimitRule rule = ruleFor(request);
        if (!enabled || rule == null) {
            filterChain.doFilter(request, response);
            return;
        }

        if (requestCounter.incrementAndGet() % 256 == 0) {
            cleanupExpiredBuckets();
        }

        Duration window = Duration.ofSeconds(Math.max(1, windowSeconds));
        Instant now = Instant.now();
        String key = clientIp(request) + "|" + request.getMethod().toUpperCase() + "|" + rule.key();
        Bucket bucket = buckets.compute(key, (ignored, current) -> {
            if (current == null || !current.windowStart().plus(window).isAfter(now)) {
                return new Bucket(now, new AtomicInteger(1));
            }

            current.count().incrementAndGet();
            return current;
        });

        int limit = rule.maxRequests();
        if (bucket.count().get() > limit) {
            long retryAfter = Math.max(1, Duration.between(now, bucket.windowStart().plus(window)).toSeconds());
            response.setStatus(429);
            response.setHeader("Retry-After", String.valueOf(retryAfter));
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"message\":\"Trop de requetes. Reessayez dans un instant.\"}");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private RateLimitRule ruleFor(HttpServletRequest request) {
        String method = request.getMethod().toUpperCase();
        String path = pathWithoutContext(request);

        if ("POST".equals(method) && (path.equals("/account/login")
                || path.equals("/account")
                || path.equals("/account/email-confirmation/change-address")
                || path.startsWith("/account/password-reset")
                || path.startsWith("/account/oauth/discord"))) {
            return new RateLimitRule(path, sensitiveMaxRequests);
        }

        if ("POST".equals(method) && path.equals("/telemetry/frontend")) {
            return new RateLimitRule(path, publicMaxRequests);
        }

        if (("POST".equals(method) || "PUT".equals(method)) && ACCOUNT_MESSAGES_PATH.matcher(path).matches()) {
            return new RateLimitRule("/account/{id}/messages", sensitiveMaxRequests);
        }

        if (("POST".equals(method) || "DELETE".equals(method)) && ACCOUNT_FOLLOW_PATH.matcher(path).matches()) {
            return new RateLimitRule("/account/{id}/follow/{targetId}", sensitiveMaxRequests);
        }

        if ("POST".equals(method) && path.matches("^/account/\\d+/following-feed/like$")) {
            return new RateLimitRule("/account/{id}/following-feed/like", sensitiveMaxRequests);
        }

        if (("POST".equals(method) || "DELETE".equals(method)) && LIBRARY_WRITE_PATH.matcher(path).matches()) {
            return new RateLimitRule(path.replaceFirst("/\\d+.*$", "/{id}"), sensitiveMaxRequests);
        }

        if ("GET".equals(method) && (path.equals("/anime-catalog") || path.equals("/character-catalog") || path.equals("/translation"))) {
            return new RateLimitRule(path, publicMaxRequests);
        }

        if ("POST".equals(method) && path.equals("/translation")) {
            return new RateLimitRule(path, sensitiveMaxRequests);
        }

        return null;
    }

    private String pathWithoutContext(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();
        return contextPath == null || contextPath.isBlank() ? uri : uri.substring(contextPath.length());
    }

    private String clientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }

        String remoteAddr = request.getRemoteAddr();
        return remoteAddr == null || remoteAddr.isBlank() ? "unknown" : remoteAddr;
    }

    private void cleanupExpiredBuckets() {
        Instant expiresBefore = Instant.now().minusSeconds(Math.max(1, windowSeconds) * 2);
        Iterator<Map.Entry<String, Bucket>> iterator = buckets.entrySet().iterator();
        while (iterator.hasNext()) {
            if (iterator.next().getValue().windowStart().isBefore(expiresBefore)) {
                iterator.remove();
            }
        }
    }

    private record RateLimitRule(String key, int maxRequests) {
    }

    private record Bucket(Instant windowStart, AtomicInteger count) {
    }
}
