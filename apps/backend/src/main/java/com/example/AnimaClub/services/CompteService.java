package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.AccountResponse;
import com.example.AnimaClub.dto.ChangePendingEmailRequest;
import com.example.AnimaClub.dto.ChangePendingEmailResponse;
import com.example.AnimaClub.dto.ConfirmEmailResponse;
import com.example.AnimaClub.dto.CreateAccountRequest;
import com.example.AnimaClub.dto.CreateAccountResponse;
import com.example.AnimaClub.dto.LoginRequest;
import com.example.AnimaClub.dto.LoginResponse;
import com.example.AnimaClub.dto.PasswordResetRequest;
import com.example.AnimaClub.dto.PasswordResetResponse;
import com.example.AnimaClub.dto.PublicProfileResponse;
import com.example.AnimaClub.dto.ResetPasswordRequest;
import com.example.AnimaClub.dto.UpdateEmailRequest;
import com.example.AnimaClub.dto.UpdatePasswordRequest;
import com.example.AnimaClub.dto.UpdatePrivacyRequest;
import com.example.AnimaClub.dto.UpdatePseudoRequest;
import com.example.AnimaClub.model.AccountNotification;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.repository.AccountFollowRepository;
import com.example.AnimaClub.repository.AccountNotificationRepository;
import com.example.AnimaClub.repository.CompteRepository;
import com.example.AnimaClub.security.SecurityTokenHasher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class CompteService {

    public record AccountImage(byte[] data, String contentType) {
    }

    private static final long PROFILE_PICTURE_MAX_BYTES = 4L * 1024L * 1024L;
    private static final long BACKGROUND_MAX_BYTES = 10L * 1024L * 1024L;
    private static final Duration FRIEND_ONLINE_NOTIFICATION_COOLDOWN = Duration.ofMinutes(2);
    private static final int PSEUDO_MAX_LENGTH = 16;
    private static final Pattern HEX_COLOR_PATTERN = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of(
            "image/jpeg",
            "image/png",
            "image/webp"
    );

    private final CompteRepository compteRepository;
    private final AccountFollowRepository accountFollowRepository;
    private final AccountNotificationRepository accountNotificationRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailConfirmationService emailConfirmationService;
    private final AuthSessionService authSessionService;
    private final SecureRandom secureRandom = new SecureRandom();

    public CompteService(
            CompteRepository compteRepository,
            AccountFollowRepository accountFollowRepository,
            AccountNotificationRepository accountNotificationRepository,
            PasswordEncoder passwordEncoder,
            EmailConfirmationService emailConfirmationService,
            AuthSessionService authSessionService
    ) {
        this.compteRepository = compteRepository;
        this.accountFollowRepository = accountFollowRepository;
        this.accountNotificationRepository = accountNotificationRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailConfirmationService = emailConfirmationService;
        this.authSessionService = authSessionService;
    }

    public List<AccountResponse> findAll() {
        return compteRepository.findAll()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public AccountResponse searchById(int id) {
        return compteRepository.findById(id)
                .map(this::toResponse)
                .orElse(null);
    }

    public List<PublicProfileResponse> publicProfiles() {
        return compteRepository.findAll()
                .stream()
                .map(this::toPublicProfile)
                .toList();
    }

    public Optional<PublicProfileResponse> publicProfileByPseudo(String pseudo) {
        if (pseudo == null || pseudo.isBlank()) {
            return Optional.empty();
        }

        String cleanedPseudo = pseudo.trim();
        return compteRepository.findByPseudoIgnoreCase(cleanedPseudo)
                .or(() -> compteRepository.findByLegacyPseudoIgnoreCase(cleanedPseudo))
                .map(this::toPublicProfile);
    }

    @Transactional
    public CreateAccountResponse create(CreateAccountRequest request) {
        return createAccount(request.pseudo(), request.mail(), request.password());
    }

    @Transactional
    public CreateAccountResponse createFromDiscordSignup(String pseudo, String mail, String password) {
        return createAccount(pseudo, mail, password);
    }

    private CreateAccountResponse createAccount(String requestedPseudo, String requestedMail, String password) {
        String pseudo = requestedPseudo.trim();
        String mail = requestedMail.trim().toLowerCase(Locale.ROOT);

        if (compteRepository.existsByPseudoIgnoreCase(pseudo)) {
            throw new IllegalArgumentException("Ce pseudo est déjà utilisé.");
        }

        if (compteRepository.existsByMailIgnoreCase(mail)) {
            throw new IllegalArgumentException("Cette adresse mail est déjà utilisée.");
        }

        Compte compte = new Compte(
                pseudo,
                mail,
                passwordEncoder.encode(password)
        );

        String token = createToken();
        compte.prepareEmailConfirmation(tokenHash(token), Instant.now().plus(Duration.ofHours(24)));

        Compte savedAccount = compteRepository.save(compte);
        String confirmationLink = emailConfirmationService.buildConfirmationLink(token);
        emailConfirmationService.sendConfirmationEmail(savedAccount, confirmationLink);

        return new CreateAccountResponse(
                toResponse(savedAccount),
                emailConfirmationService.exposedLink(confirmationLink)
        );
    }

    @Transactional
    public LoginResponse login(LoginRequest request) {
        String identifier = request.pseudo().trim();
        Compte compte = (identifier.contains("@")
                ? compteRepository.findByMailIgnoreCase(identifier)
                : compteRepository.findByPseudoIgnoreCase(identifier)
                        .or(() -> compteRepository.findByLegacyPseudoIgnoreCase(identifier)))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identifiants invalides."));

        if (!passwordMatches(request.password(), compte)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identifiants invalides.");
        }

        if (!compte.isEmailVerified()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Confirme ton adresse mail avant de te connecter.");
        }

        compte.markActive();
        notifyFriendsOnline(compte);
        AuthSessionService.IssuedSession session = authSessionService.createSession(compte);
        return new LoginResponse(toResponse(compte), session.token(), session.expiresAt());
    }

    @Transactional
    public Optional<LoginResponse> loginWithVerifiedDiscordEmail(String mail) {
        String normalizedMail = clean(mail).toLowerCase(Locale.ROOT);
        if (normalizedMail.isBlank()) {
            throw new IllegalArgumentException("Adresse mail Discord invalide.");
        }

        Optional<Compte> existingAccount = compteRepository.findByMailIgnoreCase(normalizedMail);
        if (existingAccount.isEmpty()) {
            return Optional.empty();
        }

        Compte compte = existingAccount.get();
        if (!compte.isEmailVerified()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Confirme ton adresse mail AnimeClub avant d'utiliser Discord.");
        }

        compte.markActive();
        notifyFriendsOnline(compte);
        AuthSessionService.IssuedSession session = authSessionService.createSession(compte);
        return Optional.of(new LoginResponse(toResponse(compte), session.token(), session.expiresAt()));
    }

    public String suggestAvailablePseudo(String preferredDisplayName) {
        return uniqueExternalPseudo(preferredDisplayName);
    }

    @Transactional
    public void markActive(Integer accountId) {
        Compte compte = compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));
        compte.markActive();
    }

    @Transactional
    public void markInactive(Integer accountId) {
        Compte compte = compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));
        compte.markInactive();
    }

    @Transactional
    public ConfirmEmailResponse confirmEmail(String token) {
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("Lien de confirmation invalide.");
        }

        String cleanedToken = token.trim();
        Compte compte = compteRepository.findByEmailConfirmationToken(tokenHash(cleanedToken))
                .or(() -> compteRepository.findByEmailConfirmationToken(cleanedToken))
                .orElseThrow(() -> new IllegalArgumentException("Lien de confirmation invalide."));

        if (compte.isEmailConfirmationExpired()) {
            throw new IllegalArgumentException("Lien de confirmation expiré.");
        }

        compte.confirmEmail();
        return new ConfirmEmailResponse(toResponse(compte), "Adresse mail confirmée.");
    }

    @Transactional
    public ChangePendingEmailResponse changePendingEmail(ChangePendingEmailRequest request) {
        String identifier = clean(request.identifier());
        String mail = clean(request.mail()).toLowerCase(Locale.ROOT);

        if (identifier.isBlank() || mail.isBlank()) {
            throw new IllegalArgumentException("Informations de compte invalides.");
        }

        Compte compte = findByLoginIdentifier(identifier)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identifiants invalides."));

        if (!passwordMatches(request.password(), compte)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identifiants invalides.");
        }

        if (compte.isEmailVerified()) {
            throw new IllegalArgumentException("Ce compte est deja confirme. Change ton adresse mail depuis ton compte.");
        }

        if (!mail.equalsIgnoreCase(compte.getMail()) && compteRepository.existsByMailIgnoreCase(mail)) {
            throw new IllegalArgumentException("Cette adresse mail est deja utilisee.");
        }

        String token = createToken();
        compte.setMail(mail);
        compte.prepareEmailConfirmation(tokenHash(token), Instant.now().plus(Duration.ofHours(24)));

        String confirmationLink = emailConfirmationService.buildConfirmationLink(token);
        emailConfirmationService.sendConfirmationEmail(compte, confirmationLink);

        return new ChangePendingEmailResponse(
                "Adresse de validation mise a jour. Un nouveau mail de confirmation a ete envoye.",
                emailConfirmationService.exposedLink(confirmationLink)
        );
    }

    @Transactional
    public PasswordResetResponse requestPasswordReset(PasswordResetRequest request) {
        String message = "Si un compte existe avec cette adresse, un lien de réinitialisation a été envoyé.";
        String mail = request.mail().trim().toLowerCase();

        return compteRepository.findByMailIgnoreCase(mail)
                .map((compte) -> {
                    String token = createToken();
                    compte.preparePasswordReset(tokenHash(token), Instant.now().plus(Duration.ofHours(1)));

                    String resetLink = emailConfirmationService.buildPasswordResetLink(token);
                    emailConfirmationService.sendPasswordResetEmail(compte, resetLink);

                    return new PasswordResetResponse(message, emailConfirmationService.exposedLink(resetLink));
                })
                .orElseGet(() -> new PasswordResetResponse(message, null));
    }

    @Transactional
    public PasswordResetResponse resetPassword(ResetPasswordRequest request) {
        if (request.token() == null || request.token().isBlank()) {
            throw new IllegalArgumentException("Lien de réinitialisation invalide.");
        }

        String cleanedToken = request.token().trim();
        Compte compte = compteRepository.findByPasswordResetToken(tokenHash(cleanedToken))
                .or(() -> compteRepository.findByPasswordResetToken(cleanedToken))
                .orElseThrow(() -> new IllegalArgumentException("Lien de réinitialisation invalide."));

        if (compte.isPasswordResetExpired()) {
            throw new IllegalArgumentException("Lien de réinitialisation expiré.");
        }

        compte.completePasswordReset(passwordEncoder.encode(request.password()));
        return new PasswordResetResponse("Mot de passe mis à jour. Tu peux te connecter.", null);
    }

    @Transactional
    public AccountResponse updateEmail(Integer accountId, UpdateEmailRequest request) {
        Compte compte = compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));

        if (!passwordMatches(request.currentPassword(), compte)) {
            throw new IllegalArgumentException("Mot de passe actuel invalide.");
        }

        String mail = request.mail().trim().toLowerCase();
        if (!mail.equalsIgnoreCase(compte.getMail()) && compteRepository.existsByMailIgnoreCase(mail)) {
            throw new IllegalArgumentException("Cette adresse mail est deja utilisee.");
        }

        compte.setMail(mail);
        return toResponse(compte);
    }

    @Transactional
    public PasswordResetResponse updatePassword(Integer accountId, UpdatePasswordRequest request) {
        Compte compte = compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));

        if (!passwordMatches(request.currentPassword(), compte)) {
            throw new IllegalArgumentException("Mot de passe actuel invalide.");
        }

        compte.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        return new PasswordResetResponse("Mot de passe mis a jour.", null);
    }

    @Transactional
    public AccountResponse updatePseudo(Integer accountId, UpdatePseudoRequest request) {
        Compte compte = compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));

        String pseudo = request.pseudo().trim();
        if (pseudo.length() > PSEUDO_MAX_LENGTH) {
            throw new IllegalArgumentException("Le pseudo doit faire 16 caracteres maximum.");
        }

        if (!pseudo.equalsIgnoreCase(compte.getPseudo()) && compteRepository.existsByPseudoIgnoreCase(pseudo)) {
            throw new IllegalArgumentException("Ce pseudo est deja utilise.");
        }

        compte.setPseudo(pseudo);
        compte.setLegacyPseudo(null);
        compte.setUsernameChangeRequired(false);
        accountNotificationRepository
                .findByRecipient_IdAndTypeAndReadAtIsNull(accountId, AccountNotification.TYPE_USERNAME_CHANGE_REQUIRED)
                .forEach(AccountNotification::markRead);
        return toResponse(compte);
    }

    @Transactional
    public AccountResponse updatePrivacy(Integer accountId, UpdatePrivacyRequest request) {
        Compte compte = compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));

        if (request.showFollowers() != null) {
            compte.setShowFollowers(request.showFollowers());
        }

        if (request.showFollowing() != null) {
            compte.setShowFollowing(request.showFollowing());
        }

        if (request.showAnimeLibrary() != null) {
            compte.setShowAnimeLibrary(request.showAnimeLibrary());
        }

        if (request.showMangaLibrary() != null) {
            compte.setShowMangaLibrary(request.showMangaLibrary());
        }

        if (request.showOnlineDiscovery() != null) {
            compte.setShowOnlineDiscovery(request.showOnlineDiscovery());
        }

        return toResponse(compte);
    }

    @Transactional
    public AccountResponse updateProfile(
            Integer accountId,
            String displayName,
            String bio,
            String profileStatus,
            String favoriteAnime,
            String accentColor,
            MultipartFile profilePicture,
            MultipartFile background
    ) {
        Compte compte = compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));

        if (displayName != null) {
            compte.setDisplayName(trimToLength(displayName, 80));
        }

        if (bio != null) {
            compte.setProfileBio(trimToLength(bio, 500));
        }

        if (profileStatus != null) {
            compte.setProfileStatus(trimToLength(profileStatus, 100));
        }

        if (favoriteAnime != null) {
            compte.setFavoriteAnime(trimToLength(favoriteAnime, 160));
        }

        if (accentColor != null) {
            compte.setAccentColor(normalizeAccentColor(accentColor));
        }

        if (profilePicture != null && !profilePicture.isEmpty()) {
            String declaredContentType = validateImageMetadata(profilePicture, PROFILE_PICTURE_MAX_BYTES, "image de profil");
            byte[] imageData = readBytes(profilePicture, PROFILE_PICTURE_MAX_BYTES, "image de profil");
            compte.setProfilPicture(imageData);
            compte.setProfilePictureContentType(validateImageData(imageData, declaredContentType));
        }

        if (background != null && !background.isEmpty()) {
            String declaredContentType = validateImageMetadata(background, BACKGROUND_MAX_BYTES, "banniere");
            byte[] imageData = readBytes(background, BACKGROUND_MAX_BYTES, "banniere");
            compte.setBackground(imageData);
            compte.setBackgroundContentType(validateImageData(imageData, declaredContentType));
        }

        return toResponse(compte);
    }

    public Optional<AccountImage> profilePicture(Integer accountId) {
        return compteRepository.findById(accountId)
                .filter((compte) -> hasBytes(compte.getProfilPicture()))
                .map((compte) -> new AccountImage(
                        compte.getProfilPicture(),
                        firstNotBlank(compte.getProfilePictureContentType(), "image/jpeg")
                ));
    }

    public Optional<AccountImage> background(Integer accountId) {
        return compteRepository.findById(accountId)
                .filter((compte) -> hasBytes(compte.getBackground()))
                .map((compte) -> new AccountImage(
                        compte.getBackground(),
                        firstNotBlank(compte.getBackgroundContentType(), "image/jpeg")
                ));
    }

    @Transactional
    public AccountResponse deleteProfilePicture(Integer accountId) {
        Compte compte = compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));
        compte.setProfilPicture(null);
        compte.setProfilePictureContentType(null);
        return toResponse(compte);
    }

    @Transactional
    public AccountResponse deleteBackground(Integer accountId) {
        Compte compte = compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));
        compte.setBackground(null);
        compte.setBackgroundContentType(null);
        return toResponse(compte);
    }

    private boolean passwordMatches(String rawPassword, Compte compte) {
        String storedPassword = compte.getPasswordHash();
        if (passwordEncoder.matches(rawPassword, storedPassword)) {
            if (passwordNeedsUpgrade(storedPassword)) {
                compte.setPasswordHash(passwordEncoder.encode(rawPassword));
            }
            return true;
        }

        if (rawPassword.equals(storedPassword)) {
            compte.setPasswordHash(passwordEncoder.encode(rawPassword));
            return true;
        }

        return false;
    }

    private Optional<Compte> findByLoginIdentifier(String identifier) {
        return identifier.contains("@")
                ? compteRepository.findByMailIgnoreCase(identifier)
                : compteRepository.findByPseudoIgnoreCase(identifier)
                        .or(() -> compteRepository.findByLegacyPseudoIgnoreCase(identifier));
    }

    private boolean passwordNeedsUpgrade(String storedPassword) {
        return storedPassword == null
                || !storedPassword.startsWith("{argon2id}")
                || passwordEncoder.upgradeEncoding(storedPassword);
    }

    private AccountResponse toResponse(Compte compte) {
        boolean hasProfilePicture = hasBytes(compte.getProfilPicture());
        boolean hasBackground = hasBytes(compte.getBackground());

        return new AccountResponse(
                compte.getId(),
                compte.getPseudo(),
                compte.getMail(),
                compte.isEmailVerified(),
                firstNotBlank(compte.getDisplayName(), compte.getPseudo()),
                clean(compte.getProfileBio()),
                clean(compte.getProfileStatus()),
                clean(compte.getFavoriteAnime()),
                firstNotBlank(compte.getAccentColor(), "#c7954c"),
                hasProfilePicture ? "/account/%d/profile-picture".formatted(compte.getId()) : null,
                hasBackground ? "/account/%d/background".formatted(compte.getId()) : null,
                compte.isShowFollowers(),
                compte.isShowFollowing(),
                compte.isShowAnimeLibrary(),
                compte.isShowMangaLibrary(),
                compte.isShowOnlineDiscovery(),
                compte.isUsernameChangeRequired()
        );
    }

    private PublicProfileResponse toPublicProfile(Compte compte) {
        boolean hasProfilePicture = hasBytes(compte.getProfilPicture());
        boolean hasBackground = hasBytes(compte.getBackground());

        return new PublicProfileResponse(
                compte.getId(),
                compte.getPseudo(),
                firstNotBlank(compte.getDisplayName(), compte.getPseudo()),
                clean(compte.getProfileBio()),
                clean(compte.getProfileStatus()),
                clean(compte.getFavoriteAnime()),
                firstNotBlank(compte.getAccentColor(), "#c7954c"),
                hasProfilePicture ? "/account/%d/profile-picture".formatted(compte.getId()) : null,
                hasBackground ? "/account/%d/background".formatted(compte.getId()) : null,
                isOnline(compte),
                compte.getLastActiveAt(),
                compte.isShowFollowers(),
                false,
                compte.isShowFollowers() ? accountFollowRepository.countByFollowed_Id(compte.getId()) : 0,
                0L,
                compte.isShowAnimeLibrary(),
                compte.isShowMangaLibrary()
        );
    }

    private String createToken() {
        byte[] bytes = new byte[48];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String tokenHash(String token) {
        return SecurityTokenHasher.sha256Base64Url(token);
    }

    private String uniqueExternalPseudo(String preferredDisplayName) {
        String base = clean(preferredDisplayName)
                .replaceAll("[^\\p{IsAlphabetic}\\p{IsDigit}_-]", "")
                .trim();
        if (base.isBlank()) {
            base = "discord";
        }

        if (base.length() > PSEUDO_MAX_LENGTH) {
            base = base.substring(0, PSEUDO_MAX_LENGTH);
        }

        String candidate = base;
        int suffix = 2;
        while (compteRepository.existsByPseudoIgnoreCase(candidate)) {
            String suffixText = String.valueOf(suffix++);
            int prefixLength = Math.max(1, PSEUDO_MAX_LENGTH - suffixText.length());
            candidate = base.substring(0, Math.min(base.length(), prefixLength)) + suffixText;
        }
        return candidate;
    }

    private String validateImageMetadata(MultipartFile file, long maxBytes, String label) {
        String contentType = normalizeContentType(file.getContentType());
        if (!ALLOWED_IMAGE_TYPES.contains(contentType)) {
            throw new IllegalArgumentException("Le fichier de " + label + " doit etre une image JPG, PNG ou WebP.");
        }

        if (file.getSize() <= 0 || file.getSize() > maxBytes) {
            long maxMb = maxBytes / 1024L / 1024L;
            throw new IllegalArgumentException("Le fichier de " + label + " ne doit pas depasser " + maxMb + " Mo.");
        }

        return contentType;
    }

    private byte[] readBytes(MultipartFile file, long maxBytes, String label) {
        try {
            byte[] data = file.getBytes();
            if (data.length == 0 || data.length > maxBytes) {
                long maxMb = maxBytes / 1024L / 1024L;
                throw new IllegalArgumentException("Le fichier de " + label + " ne doit pas depasser " + maxMb + " Mo.");
            }
            return data;
        } catch (IOException exception) {
            throw new IllegalArgumentException("Lecture de l'image impossible.");
        }
    }

    private String validateImageData(byte[] data, String declaredContentType) {
        String detectedContentType = detectImageContentType(data)
                .orElseThrow(() -> new IllegalArgumentException("Le contenu du fichier image est invalide."));

        if (!detectedContentType.equals(declaredContentType)) {
            throw new IllegalArgumentException("Le type de fichier ne correspond pas au contenu de l'image.");
        }

        return detectedContentType;
    }

    private Optional<String> detectImageContentType(byte[] data) {
        if (startsWith(data, 0xFF, 0xD8, 0xFF)) {
            return Optional.of("image/jpeg");
        }

        if (startsWith(data, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) {
            return Optional.of("image/png");
        }

        if (startsWithAscii(data, 0, "RIFF") && startsWithAscii(data, 8, "WEBP")) {
            return Optional.of("image/webp");
        }

        return Optional.empty();
    }

    private String normalizeContentType(String contentType) {
        return contentType == null ? "" : contentType.trim().toLowerCase(Locale.ROOT);
    }

    private boolean startsWith(byte[] data, int... expected) {
        if (data.length < expected.length) {
            return false;
        }

        for (int index = 0; index < expected.length; index++) {
            if ((data[index] & 0xFF) != expected[index]) {
                return false;
            }
        }

        return true;
    }

    private boolean startsWithAscii(byte[] data, int offset, String expected) {
        if (data.length < offset + expected.length()) {
            return false;
        }

        for (int index = 0; index < expected.length(); index++) {
            if (data[offset + index] != (byte) expected.charAt(index)) {
                return false;
            }
        }

        return true;
    }

    private String normalizeAccentColor(String accentColor) {
        String value = clean(accentColor);
        return HEX_COLOR_PATTERN.matcher(value).matches() ? value : "#c7954c";
    }

    private String trimToLength(String value, int maxLength) {
        String cleaned = clean(value);
        return cleaned.length() <= maxLength ? cleaned : cleaned.substring(0, maxLength);
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private String firstNotBlank(String value, String fallback) {
        String cleaned = clean(value);
        return cleaned.isBlank() ? fallback : cleaned;
    }

    private boolean isOnline(Compte compte) {
        Instant lastActiveAt = compte.getLastActiveAt();
        return lastActiveAt != null && lastActiveAt.isAfter(Instant.now().minus(Duration.ofSeconds(60)));
    }

    private void notifyFriendsOnline(Compte actor) {
        Instant notificationCutoff = Instant.now().minus(FRIEND_ONLINE_NOTIFICATION_COOLDOWN);
        accountFollowRepository.findMutualFriends(actor.getId())
                .stream()
                .filter((friend) -> !accountNotificationRepository.existsByRecipient_IdAndActor_IdAndTypeAndCreatedAtAfter(
                        friend.getId(),
                        actor.getId(),
                        AccountNotification.TYPE_FRIEND_ONLINE,
                        notificationCutoff
                ))
                .forEach((friend) -> accountNotificationRepository.save(new AccountNotification(
                        friend,
                        actor,
                        AccountNotification.TYPE_FRIEND_ONLINE
                )));
    }

    private boolean hasBytes(byte[] bytes) {
        return bytes != null && bytes.length > 0;
    }
}
