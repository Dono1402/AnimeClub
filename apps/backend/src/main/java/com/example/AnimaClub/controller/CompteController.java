package com.example.AnimaClub.controller;

import com.example.AnimaClub.dto.AccountResponse;
import com.example.AnimaClub.dto.AccountNotificationResponse;
import com.example.AnimaClub.dto.AccountMessageResponse;
import com.example.AnimaClub.dto.ChangePendingEmailRequest;
import com.example.AnimaClub.dto.ChangePendingEmailResponse;
import com.example.AnimaClub.dto.ConfirmEmailResponse;
import com.example.AnimaClub.dto.CreateAccountRequest;
import com.example.AnimaClub.dto.CreateAccountResponse;
import com.example.AnimaClub.dto.DiscordAuthorizeUrlResponse;
import com.example.AnimaClub.dto.DiscordLoginRequest;
import com.example.AnimaClub.dto.DiscordLoginResponse;
import com.example.AnimaClub.dto.DiscordSignupRequest;
import com.example.AnimaClub.dto.FollowFeedEntryResponse;
import com.example.AnimaClub.dto.FollowFeedLikeRequest;
import com.example.AnimaClub.dto.FollowFeedLikeResponse;
import com.example.AnimaClub.dto.FollowStateResponse;
import com.example.AnimaClub.dto.LoginRequest;
import com.example.AnimaClub.dto.LoginResponse;
import com.example.AnimaClub.dto.MessageConversationResponse;
import com.example.AnimaClub.dto.PasswordResetRequest;
import com.example.AnimaClub.dto.PasswordResetResponse;
import com.example.AnimaClub.dto.PublicProfileResponse;
import com.example.AnimaClub.dto.ResetPasswordRequest;
import com.example.AnimaClub.dto.SendMessageRequest;
import com.example.AnimaClub.dto.UpdateEmailRequest;
import com.example.AnimaClub.dto.UpdatePasswordRequest;
import com.example.AnimaClub.dto.UpdatePrivacyRequest;
import com.example.AnimaClub.dto.UpdatePseudoRequest;
import com.example.AnimaClub.services.AdminAccessService;
import com.example.AnimaClub.services.AuthSessionService;
import com.example.AnimaClub.services.CompteService;
import com.example.AnimaClub.services.DiscordOAuthService;
import com.example.AnimaClub.services.MessagingService;
import com.example.AnimaClub.services.SocialService;
import com.example.AnimaClub.security.SessionCookieService;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/account")
public class CompteController {

    private final CompteService compteService;
    private final SocialService socialService;
    private final MessagingService messagingService;
    private final AdminAccessService adminAccessService;
    private final AuthSessionService authSessionService;
    private final DiscordOAuthService discordOAuthService;
    private final SessionCookieService sessionCookieService;

    public CompteController(
            CompteService compteService,
            SocialService socialService,
            MessagingService messagingService,
            AdminAccessService adminAccessService,
            AuthSessionService authSessionService,
            DiscordOAuthService discordOAuthService,
            SessionCookieService sessionCookieService
    ) {
        this.compteService = compteService;
        this.socialService = socialService;
        this.messagingService = messagingService;
        this.adminAccessService = adminAccessService;
        this.authSessionService = authSessionService;
        this.discordOAuthService = discordOAuthService;
        this.sessionCookieService = sessionCookieService;
    }

    @GetMapping("/{id:\\d+}")
    public ResponseEntity<AccountResponse> findById(@PathVariable int id) {
        AccountResponse compte = compteService.searchById(id);
        return compte == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(compte);
    }

    @GetMapping("/public")
    public List<PublicProfileResponse> publicProfiles(
            @RequestHeader(value = "X-Admin-Token", required = false) String adminToken
    ) {
        adminAccessService.requireAdminAccess(adminToken);
        return compteService.publicProfiles();
    }

    @GetMapping("/public/{pseudo}")
    public ResponseEntity<PublicProfileResponse> publicProfile(@PathVariable String pseudo) {
        return compteService.publicProfileByPseudo(pseudo)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/public/{pseudo}/following")
    public List<PublicProfileResponse> publicFollowing(@PathVariable String pseudo) {
        return socialService.publicFollowing(pseudo);
    }

    @GetMapping("/public/{pseudo}/followers")
    public List<PublicProfileResponse> publicFollowers(@PathVariable String pseudo) {
        return socialService.publicFollowers(pseudo);
    }

    @GetMapping("/{accountId:\\d+}/follow-state/{targetId:\\d+}")
    public FollowStateResponse followState(@PathVariable Integer accountId, @PathVariable Integer targetId) {
        return socialService.followState(accountId, targetId);
    }

    @PostMapping("/{accountId:\\d+}/follow/{targetId:\\d+}")
    public FollowStateResponse follow(@PathVariable Integer accountId, @PathVariable Integer targetId) {
        return socialService.follow(accountId, targetId);
    }

    @DeleteMapping("/{accountId:\\d+}/follow/{targetId:\\d+}")
    public FollowStateResponse unfollow(@PathVariable Integer accountId, @PathVariable Integer targetId) {
        return socialService.unfollow(accountId, targetId);
    }

    @GetMapping("/{accountId:\\d+}/following")
    public List<PublicProfileResponse> following(@PathVariable Integer accountId) {
        return socialService.following(accountId);
    }

    @GetMapping("/{accountId:\\d+}/followers")
    public List<PublicProfileResponse> followers(@PathVariable Integer accountId) {
        return socialService.followers(accountId);
    }

    @GetMapping("/{accountId:\\d+}/online-discovery")
    public List<PublicProfileResponse> onlineDiscoveryProfiles(@PathVariable Integer accountId) {
        return socialService.onlineDiscoveryProfiles(accountId);
    }

    @GetMapping("/{accountId:\\d+}/following-feed")
    public List<FollowFeedEntryResponse> followingFeed(@PathVariable Integer accountId) {
        return socialService.followingFeed(accountId);
    }

    @PostMapping("/{accountId:\\d+}/following-feed/like")
    public FollowFeedLikeResponse toggleFollowingFeedLike(
            @PathVariable Integer accountId,
            @Valid @RequestBody FollowFeedLikeRequest request
    ) {
        return socialService.toggleFollowingFeedLike(accountId, request);
    }

    @GetMapping("/{accountId:\\d+}/friends")
    public List<PublicProfileResponse> friends(@PathVariable Integer accountId) {
        return messagingService.friends(accountId);
    }

    @GetMapping("/{accountId:\\d+}/messages")
    public List<MessageConversationResponse> messageConversations(@PathVariable Integer accountId) {
        return messagingService.conversations(accountId);
    }

    @GetMapping("/{accountId:\\d+}/messages/{friendId:\\d+}")
    public List<AccountMessageResponse> messages(@PathVariable Integer accountId, @PathVariable Integer friendId) {
        return messagingService.conversation(accountId, friendId);
    }

    @PutMapping("/{accountId:\\d+}/presence")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markPresence(@PathVariable Integer accountId) {
        compteService.markActive(accountId);
    }

    @PutMapping("/{accountId:\\d+}/presence/offline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markPresenceOffline(@PathVariable Integer accountId) {
        compteService.markInactive(accountId);
    }

    @PutMapping("/{accountId:\\d+}/messages/{friendId:\\d+}/typing")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markTyping(@PathVariable Integer accountId, @PathVariable Integer friendId) {
        messagingService.markTyping(accountId, friendId);
    }

    @PostMapping(value = "/{accountId:\\d+}/messages/{friendId:\\d+}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public AccountMessageResponse sendMessage(
            @PathVariable Integer accountId,
            @PathVariable Integer friendId,
            @Valid @RequestBody SendMessageRequest request
    ) {
        return messagingService.send(accountId, friendId, request);
    }

    @PostMapping(value = "/{accountId:\\d+}/messages/{friendId:\\d+}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AccountMessageResponse sendMessageWithImage(
            @PathVariable Integer accountId,
            @PathVariable Integer friendId,
            @RequestParam(required = false) String content,
            @RequestParam(required = false) MultipartFile image
    ) {
        return messagingService.send(accountId, friendId, content, image);
    }

    @GetMapping("/{accountId:\\d+}/messages/{messageId:\\d+}/image")
    public ResponseEntity<byte[]> messageImage(@PathVariable Integer accountId, @PathVariable Integer messageId) {
        return messagingService.messageImage(accountId, messageId)
                .map(this::imageResponse)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/{accountId:\\d+}/notifications")
    public List<AccountNotificationResponse> notifications(@PathVariable Integer accountId) {
        return socialService.notifications(accountId);
    }

    @GetMapping("/{accountId:\\d+}/notifications/unread-count")
    public Map<String, Long> unreadNotificationCount(@PathVariable Integer accountId) {
        return socialService.unreadNotificationCount(accountId);
    }

    @PutMapping("/{accountId:\\d+}/notifications/read")
    public List<AccountNotificationResponse> markNotificationsRead(@PathVariable Integer accountId) {
        return socialService.markNotificationsRead(accountId);
    }

    @PutMapping("/{accountId:\\d+}/notifications/read/{type}")
    public List<AccountNotificationResponse> markNotificationsReadByType(
            @PathVariable Integer accountId,
            @PathVariable String type
    ) {
        return socialService.markNotificationsReadByType(accountId, type);
    }

    @DeleteMapping("/{accountId:\\d+}/notifications")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteNotifications(@PathVariable Integer accountId) {
        socialService.deleteNotifications(accountId);
    }

    @DeleteMapping("/{accountId:\\d+}/notifications/{notificationId:\\d+}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteNotification(@PathVariable Integer accountId, @PathVariable Integer notificationId) {
        socialService.deleteNotification(accountId, notificationId);
    }

    @GetMapping
    public List<AccountResponse> getAllAccount(
            @RequestHeader(value = "X-Admin-Token", required = false) String adminToken
    ) {
        adminAccessService.requireAdminAccess(adminToken);
        return compteService.findAll();
    }

    @PostMapping
    public ResponseEntity<CreateAccountResponse> createAccount(@Valid @RequestBody CreateAccountRequest request) {
        CreateAccountResponse response = compteService.create(request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(response.account().id())
                .toUri();

        return ResponseEntity.created(location).body(response);
    }

    @GetMapping("/confirm")
    public ConfirmEmailResponse confirmEmail(@RequestParam String token) {
        return compteService.confirmEmail(token);
    }

    @PostMapping("/email-confirmation/change-address")
    public ChangePendingEmailResponse changePendingEmail(@Valid @RequestBody ChangePendingEmailRequest request) {
        return compteService.changePendingEmail(request);
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request, HttpServletResponse servletResponse) {
        LoginResponse response = compteService.login(request);
        sessionCookieService.writeSessionCookie(
                servletResponse,
                response.sessionToken(),
                response.expiresAt(),
                request.persistentSessionRequested()
        );
        return response.withoutSessionToken();
    }

    @GetMapping("/oauth/discord/authorize-url")
    public DiscordAuthorizeUrlResponse discordAuthorizeUrl(
            @RequestParam String redirectUri,
            @RequestParam String state
    ) {
        return discordOAuthService.authorizationUrl(redirectUri, state);
    }

    @PostMapping("/oauth/discord/login")
    public DiscordLoginResponse discordLogin(
            @Valid @RequestBody DiscordLoginRequest request,
            HttpServletResponse servletResponse
    ) {
        DiscordLoginResponse response = discordOAuthService.login(request);
        if (response.login() != null) {
            sessionCookieService.writeSessionCookie(
                    servletResponse,
                    response.login().sessionToken(),
                    response.login().expiresAt(),
                    request.persistentSessionRequested()
            );
        }
        return response.withoutSessionToken();
    }

    @PostMapping("/oauth/discord/signup")
    public ResponseEntity<CreateAccountResponse> discordSignup(@Valid @RequestBody DiscordSignupRequest request) {
        CreateAccountResponse response = discordOAuthService.signup(request);
        URI location = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/account/{id}")
                .buildAndExpand(response.account().id())
                .toUri();

        return ResponseEntity.created(location).body(response);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse
    ) {
        authSessionService.revoke(servletRequest);
        authSessionService.revoke(authorization);
        sessionCookieService.clearSessionCookie(servletResponse);
    }

    @PostMapping("/password-reset/request")
    public PasswordResetResponse requestPasswordReset(@Valid @RequestBody PasswordResetRequest request) {
        return compteService.requestPasswordReset(request);
    }

    @PostMapping("/password-reset/confirm")
    public PasswordResetResponse resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        return compteService.resetPassword(request);
    }

    @PutMapping("/{id}/email")
    public AccountResponse updateEmail(@PathVariable int id, @Valid @RequestBody UpdateEmailRequest request) {
        return compteService.updateEmail(id, request);
    }

    @PutMapping("/{id}/password")
    public PasswordResetResponse updatePassword(@PathVariable int id, @Valid @RequestBody UpdatePasswordRequest request) {
        return compteService.updatePassword(id, request);
    }

    @PutMapping("/{id}/pseudo")
    public AccountResponse updatePseudo(@PathVariable int id, @Valid @RequestBody UpdatePseudoRequest request) {
        return compteService.updatePseudo(id, request);
    }

    @PutMapping("/{id}/privacy")
    public AccountResponse updatePrivacy(@PathVariable int id, @RequestBody UpdatePrivacyRequest request) {
        return compteService.updatePrivacy(id, request);
    }

    @PutMapping(value = "/{id}/profile", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AccountResponse updateProfile(
            @PathVariable int id,
            @RequestParam(required = false) String displayName,
            @RequestParam(required = false) String bio,
            @RequestParam(required = false) String profileStatus,
            @RequestParam(required = false) String favoriteAnime,
            @RequestParam(required = false) String accentColor,
            @RequestParam(required = false) MultipartFile profilePicture,
            @RequestParam(required = false) MultipartFile background
    ) {
        return compteService.updateProfile(
                id,
                displayName,
                bio,
                profileStatus,
                favoriteAnime,
                accentColor,
                profilePicture,
                background
        );
    }

    @GetMapping("/{id}/profile-picture")
    public ResponseEntity<byte[]> profilePicture(@PathVariable int id) {
        return compteService.profilePicture(id)
                .map(this::imageResponse)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/background")
    public ResponseEntity<byte[]> background(@PathVariable int id) {
        return compteService.background(id)
                .map(this::imageResponse)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}/profile-picture")
    public AccountResponse deleteProfilePicture(@PathVariable int id) {
        return compteService.deleteProfilePicture(id);
    }

    @DeleteMapping("/{id}/background")
    public AccountResponse deleteBackground(@PathVariable int id) {
        return compteService.deleteBackground(id);
    }

    private ResponseEntity<byte[]> imageResponse(CompteService.AccountImage image) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.contentType()))
                .body(image.data());
    }

    private ResponseEntity<byte[]> imageResponse(MessagingService.MessageImage image) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.contentType()))
                .body(image.data());
    }
}
