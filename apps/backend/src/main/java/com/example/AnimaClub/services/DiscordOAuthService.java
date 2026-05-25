package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.CreateAccountResponse;
import com.example.AnimaClub.dto.DiscordAuthorizeUrlResponse;
import com.example.AnimaClub.dto.DiscordLoginRequest;
import com.example.AnimaClub.dto.DiscordLoginResponse;
import com.example.AnimaClub.dto.DiscordSignupRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;

@Service
public class DiscordOAuthService {

    private record DiscordProfile(String email, String displayName) {
    }

    private record SignupPayload(String email, String displayName, long expiresAtEpochSecond, String nonce) {
    }

    private static final String AUTHORIZATION_URL = "https://discord.com/oauth2/authorize";
    private static final String CALLBACK_PATH = "/auth/discord/callback";
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(12);
    private static final Duration SIGNUP_TTL = Duration.ofMinutes(20);
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final CompteService compteService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final SecureRandom secureRandom = new SecureRandom();
    private final String clientId;
    private final String clientSecret;
    private final String tokenUrl;
    private final String userUrl;
    private final String frontendUrl;

    public DiscordOAuthService(
            CompteService compteService,
            ObjectMapper objectMapper,
            @Value("${app.discord.oauth.client-id:}") String clientId,
            @Value("${app.discord.oauth.client-secret:}") String clientSecret,
            @Value("${app.discord.oauth.token-url:https://discord.com/api/v10/oauth2/token}") String tokenUrl,
            @Value("${app.discord.oauth.user-url:https://discord.com/api/v10/users/@me}") String userUrl,
            @Value("${app.frontend-url:http://localhost:4200}") String frontendUrl
    ) {
        this.compteService = compteService;
        this.objectMapper = objectMapper;
        this.clientId = clean(clientId);
        this.clientSecret = clean(clientSecret);
        this.tokenUrl = clean(tokenUrl);
        this.userUrl = clean(userUrl);
        this.frontendUrl = clean(frontendUrl);
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(REQUEST_TIMEOUT)
                .build();
    }

    public DiscordAuthorizeUrlResponse authorizationUrl(String redirectUri, String state) {
        requireConfigured();
        String cleanRedirectUri = validateRedirectUri(redirectUri);
        String cleanState = clean(state);
        if (cleanState.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Etat OAuth Discord manquant.");
        }

        String authorizationUrl = UriComponentsBuilder.fromUriString(AUTHORIZATION_URL)
                .queryParam("response_type", "code")
                .queryParam("client_id", clientId)
                .queryParam("scope", "identify email")
                .queryParam("state", cleanState)
                .queryParam("redirect_uri", cleanRedirectUri)
                .queryParam("prompt", "consent")
                .build()
                .encode()
                .toUriString();

        return new DiscordAuthorizeUrlResponse(authorizationUrl);
    }

    public DiscordLoginResponse login(DiscordLoginRequest request) {
        requireConfigured();
        DiscordProfile profile = verifiedProfile(request.code(), request.redirectUri());

        return compteService.loginWithVerifiedDiscordEmail(profile.email())
                .map(DiscordLoginResponse::login)
                .orElseGet(() -> {
                    Instant expiresAt = Instant.now().plus(SIGNUP_TTL);
                    return DiscordLoginResponse.signupRequired(
                            createSignupToken(profile, expiresAt),
                            profile.email(),
                            compteService.suggestAvailablePseudo(profile.displayName()),
                            expiresAt,
                            "Definis un mot de passe pour finaliser ton compte AnimeClub."
                    );
                });
    }

    public CreateAccountResponse signup(DiscordSignupRequest request) {
        requireConfigured();
        SignupPayload payload = verifySignupToken(request.signupToken());
        return compteService.createFromDiscordSignup(request.pseudo(), payload.email(), request.password());
    }

    private DiscordProfile verifiedProfile(String code, String redirectUri) {
        String cleanRedirectUri = validateRedirectUri(redirectUri);
        String accessToken = exchangeCode(clean(code), cleanRedirectUri);
        JsonNode user = currentUser(accessToken);

        String email = clean(user.path("email").asText(""));
        boolean verifiedEmail = user.path("verified").asBoolean(false);
        if (email.isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Discord n'a pas transmis d'adresse e-mail.");
        }

        if (!verifiedEmail) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "L'adresse e-mail Discord doit etre verifiee.");
        }

        String displayName = firstNotBlank(
                clean(user.path("global_name").asText("")),
                clean(user.path("username").asText("")),
                "Discord"
        );
        return new DiscordProfile(email.toLowerCase(Locale.ROOT), displayName);
    }

    private String exchangeCode(String code, String redirectUri) {
        if (code.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Code Discord manquant.");
        }

        String body = formParam("grant_type", "authorization_code")
                + "&" + formParam("code", code)
                + "&" + formParam("redirect_uri", redirectUri);
        String credentials = Base64.getEncoder().encodeToString((clientId + ":" + clientSecret).getBytes(StandardCharsets.UTF_8));

        HttpRequest request = HttpRequest.newBuilder(URI.create(tokenUrl))
                .timeout(REQUEST_TIMEOUT)
                .header("Authorization", "Basic " + credentials)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Accept", "application/json")
                .header("User-Agent", "AnimeClub/1.0")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();

        JsonNode response = sendJson(request, "Discord a refuse l'echange OAuth.");
        String accessToken = clean(response.path("access_token").asText(""));
        if (accessToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Reponse OAuth Discord invalide.");
        }
        return accessToken;
    }

    private JsonNode currentUser(String accessToken) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(userUrl))
                .timeout(REQUEST_TIMEOUT)
                .header("Authorization", "Bearer " + accessToken)
                .header("Accept", "application/json")
                .header("User-Agent", "AnimeClub/1.0")
                .GET()
                .build();

        return sendJson(request, "Discord n'a pas renvoye le profil utilisateur.");
    }

    private JsonNode sendJson(HttpRequest request, String errorMessage) {
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, errorMessage);
            }
            return objectMapper.readTree(response.body());
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, errorMessage, exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, errorMessage, exception);
        }
    }

    private String createSignupToken(DiscordProfile profile, Instant expiresAt) {
        try {
            SignupPayload payload = new SignupPayload(
                    profile.email(),
                    profile.displayName(),
                    expiresAt.getEpochSecond(),
                    createNonce()
            );
            String payloadSegment = base64Url(objectMapper.writeValueAsBytes(payload));
            return payloadSegment + "." + signature(payloadSegment);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Creation du jeton Discord impossible.", exception);
        }
    }

    private SignupPayload verifySignupToken(String signupToken) {
        String token = clean(signupToken);
        String[] parts = token.split("\\.", -1);
        if (parts.length != 2 || parts[0].isBlank() || parts[1].isBlank()) {
            throw invalidSignupToken();
        }

        String expectedSignature = signature(parts[0]);
        if (!MessageDigest.isEqual(
                expectedSignature.getBytes(StandardCharsets.UTF_8),
                parts[1].getBytes(StandardCharsets.UTF_8)
        )) {
            throw invalidSignupToken();
        }

        try {
            SignupPayload payload = objectMapper.readValue(Base64.getUrlDecoder().decode(parts[0]), SignupPayload.class);
            if (clean(payload.email()).isBlank() || payload.expiresAtEpochSecond() <= Instant.now().getEpochSecond()) {
                throw invalidSignupToken();
            }
            return payload;
        } catch (IllegalArgumentException | IOException exception) {
            throw invalidSignupToken();
        }
    }

    private String signature(String payloadSegment) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(clientSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return base64Url(mac.doFinal(payloadSegment.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Signature Discord indisponible.", exception);
        }
    }

    private ResponseStatusException invalidSignupToken() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session d'inscription Discord expiree. Relance la connexion Discord.");
    }

    private void requireConfigured() {
        if (clientId.isBlank() || clientSecret.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Connexion Discord non configuree.");
        }
    }

    private String validateRedirectUri(String redirectUri) {
        String value = clean(redirectUri);
        if (value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "URL de retour Discord manquante.");
        }

        try {
            URI redirect = URI.create(value);
            if (!CALLBACK_PATH.equals(redirect.getPath()) || redirect.getFragment() != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "URL de retour Discord invalide.");
            }

            if (sameOrigin(redirect, URI.create(frontendUrl)) || isLoopbackHttp(redirect)) {
                return value;
            }
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "URL de retour Discord invalide.", exception);
        }

        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Origine Discord non autorisee.");
    }

    private boolean sameOrigin(URI left, URI right) {
        return clean(left.getScheme()).equalsIgnoreCase(clean(right.getScheme()))
                && clean(left.getHost()).equalsIgnoreCase(clean(right.getHost()))
                && effectivePort(left) == effectivePort(right);
    }

    private boolean isLoopbackHttp(URI uri) {
        String host = clean(uri.getHost()).toLowerCase(Locale.ROOT);
        return "http".equalsIgnoreCase(uri.getScheme())
                && ("localhost".equals(host) || "127.0.0.1".equals(host) || "::1".equals(host));
    }

    private int effectivePort(URI uri) {
        if (uri.getPort() != -1) {
            return uri.getPort();
        }
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private String formParam(String key, String value) {
        return URLEncoder.encode(key, StandardCharsets.UTF_8)
                + "="
                + URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String firstNotBlank(String... values) {
        for (String value : values) {
            String cleaned = clean(value);
            if (!cleaned.isBlank()) {
                return cleaned;
            }
        }
        return "";
    }

    private String createNonce() {
        byte[] bytes = new byte[18];
        secureRandom.nextBytes(bytes);
        return base64Url(bytes);
    }

    private String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
