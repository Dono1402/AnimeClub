package com.example.AnimaClub.security;

import com.example.AnimaClub.services.AuthSessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class AccountAuthorizationInterceptor implements HandlerInterceptor {

    private static final Pattern ACCOUNT_PATH = Pattern.compile("^/account/(\\d+)(?:/(.*))?$");
    private static final Pattern LIBRARY_PATH = Pattern.compile("^/(animetheque|mangatheque)/(\\d+)(?:/.*)?$");

    private final AuthSessionService authSessionService;

    public AccountAuthorizationInterceptor(AuthSessionService authSessionService) {
        this.authSessionService = authSessionService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        protectedAccountId(request)
                .ifPresent((accountId) -> authSessionService.requireAccount(
                        request,
                        accountId
                ));

        return true;
    }

    private Optional<Integer> protectedAccountId(HttpServletRequest request) {
        String path = pathWithoutContext(request);

        if (path.startsWith("/account/public")
                || path.equals("/account/login")
                || path.equals("/account/logout")
                || path.equals("/account/confirm")
                || path.equals("/account/email-confirmation/change-address")
                || path.startsWith("/account/password-reset")) {
            return Optional.empty();
        }

        Matcher accountMatcher = ACCOUNT_PATH.matcher(path);
        if (accountMatcher.matches()) {
            String detailPath = accountMatcher.group(2);
            if ("GET".equalsIgnoreCase(request.getMethod())
                    && ("profile-picture".equals(detailPath) || "background".equals(detailPath))) {
                return Optional.empty();
            }

            return Optional.of(Integer.parseInt(accountMatcher.group(1)));
        }

        if (path.startsWith("/animetheque/public") || path.startsWith("/mangatheque/public")) {
            return Optional.empty();
        }

        Matcher libraryMatcher = LIBRARY_PATH.matcher(path);
        if (libraryMatcher.matches()) {
            return Optional.of(Integer.parseInt(libraryMatcher.group(2)));
        }

        return Optional.empty();
    }

    private String pathWithoutContext(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();
        return contextPath == null || contextPath.isBlank() ? uri : uri.substring(contextPath.length());
    }
}
