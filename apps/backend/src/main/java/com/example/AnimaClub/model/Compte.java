package com.example.AnimaClub.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "compte")
public class Compte {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(nullable = false, unique = true, length = 16)
    private String pseudo;

    @Column(name = "legacy_pseudo", length = 80)
    private String legacyPseudo;

    @Column(name = "username_change_required")
    private Boolean usernameChangeRequired = false;

    @Column(nullable = false, unique = true, length = 255)
    private String mail;

    @Column(name = "password", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "email_verified")
    private Boolean emailVerified;

    @Column(name = "email_confirmation_token", length = 128)
    private String emailConfirmationToken;

    @Column(name = "email_confirmation_expires_at")
    private Instant emailConfirmationExpiresAt;

    @Column(name = "password_reset_token", length = 128)
    private String passwordResetToken;

    @Column(name = "password_reset_expires_at")
    private Instant passwordResetExpiresAt;

    @Column(name = "display_name", length = 80)
    private String displayName;

    @Column(name = "profile_bio", length = 500)
    private String profileBio;

    @Column(name = "profile_status", length = 100)
    private String profileStatus;

    @Column(name = "favorite_anime", length = 160)
    private String favoriteAnime;

    @Column(name = "accent_color", length = 16)
    private String accentColor;

    @Column(columnDefinition = "bytea")
    private byte[] profilPicture;

    @Column(name = "profile_picture_content_type", length = 80)
    private String profilePictureContentType;

    @Column(columnDefinition = "bytea")
    private byte[] background;

    @Column(name = "background_content_type", length = 80)
    private String backgroundContentType;

    @Column(name = "show_followers")
    private Boolean showFollowers = true;

    @Column(name = "show_following")
    private Boolean showFollowing = true;

    @Column(name = "show_anime_library")
    private Boolean showAnimeLibrary = true;

    @Column(name = "show_manga_library")
    private Boolean showMangaLibrary = true;

    @Column(name = "show_online_discovery")
    private Boolean showOnlineDiscovery = false;

    @Column(name = "last_active_at")
    private Instant lastActiveAt;

    protected Compte() {
    }

    public Compte(String pseudo, String mail, String passwordHash) {
        this.pseudo = pseudo;
        this.mail = mail;
        this.passwordHash = passwordHash;
        this.showFollowers = true;
        this.showFollowing = true;
        this.showAnimeLibrary = true;
        this.showMangaLibrary = true;
        this.showOnlineDiscovery = false;
    }

    public Integer getId() {
        return id;
    }

    public String getPseudo() {
        return pseudo;
    }

    public void setPseudo(String pseudo) {
        this.pseudo = pseudo;
    }

    public String getLegacyPseudo() {
        return legacyPseudo;
    }

    public void setLegacyPseudo(String legacyPseudo) {
        this.legacyPseudo = legacyPseudo;
    }

    public boolean isUsernameChangeRequired() {
        return Boolean.TRUE.equals(usernameChangeRequired);
    }

    public void setUsernameChangeRequired(Boolean usernameChangeRequired) {
        this.usernameChangeRequired = usernameChangeRequired;
    }

    public String getMail() {
        return mail;
    }

    public void setMail(String mail) {
        this.mail = mail;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public boolean isEmailVerified() {
        return emailVerified == null || emailVerified;
    }

    public Boolean getEmailVerified() {
        return emailVerified;
    }

    public void prepareEmailConfirmation(String token, Instant expiresAt) {
        this.emailVerified = false;
        this.emailConfirmationToken = token;
        this.emailConfirmationExpiresAt = expiresAt;
    }

    public String getEmailConfirmationToken() {
        return emailConfirmationToken;
    }

    public Instant getEmailConfirmationExpiresAt() {
        return emailConfirmationExpiresAt;
    }

    public boolean isEmailConfirmationExpired() {
        return emailConfirmationExpiresAt == null || emailConfirmationExpiresAt.isBefore(Instant.now());
    }

    public void confirmEmail() {
        this.emailVerified = true;
        this.emailConfirmationToken = null;
        this.emailConfirmationExpiresAt = null;
    }

    public void preparePasswordReset(String token, Instant expiresAt) {
        this.passwordResetToken = token;
        this.passwordResetExpiresAt = expiresAt;
    }

    public String getPasswordResetToken() {
        return passwordResetToken;
    }

    public Instant getPasswordResetExpiresAt() {
        return passwordResetExpiresAt;
    }

    public boolean isPasswordResetExpired() {
        return passwordResetExpiresAt == null || passwordResetExpiresAt.isBefore(Instant.now());
    }

    public void completePasswordReset(String passwordHash) {
        this.passwordHash = passwordHash;
        this.passwordResetToken = null;
        this.passwordResetExpiresAt = null;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getProfileBio() {
        return profileBio;
    }

    public void setProfileBio(String profileBio) {
        this.profileBio = profileBio;
    }

    public String getProfileStatus() {
        return profileStatus;
    }

    public void setProfileStatus(String profileStatus) {
        this.profileStatus = profileStatus;
    }

    public String getFavoriteAnime() {
        return favoriteAnime;
    }

    public void setFavoriteAnime(String favoriteAnime) {
        this.favoriteAnime = favoriteAnime;
    }

    public String getAccentColor() {
        return accentColor;
    }

    public void setAccentColor(String accentColor) {
        this.accentColor = accentColor;
    }

    public byte[] getProfilPicture() {
        return profilPicture;
    }

    public void setProfilPicture(byte[] profilPicture) {
        this.profilPicture = profilPicture;
    }

    public String getProfilePictureContentType() {
        return profilePictureContentType;
    }

    public void setProfilePictureContentType(String profilePictureContentType) {
        this.profilePictureContentType = profilePictureContentType;
    }

    public byte[] getBackground() {
        return background;
    }

    public void setBackground(byte[] background) {
        this.background = background;
    }

    public String getBackgroundContentType() {
        return backgroundContentType;
    }

    public void setBackgroundContentType(String backgroundContentType) {
        this.backgroundContentType = backgroundContentType;
    }

    public boolean isShowFollowers() {
        return showFollowers == null || showFollowers;
    }

    public void setShowFollowers(Boolean showFollowers) {
        this.showFollowers = showFollowers;
    }

    public boolean isShowFollowing() {
        return showFollowing == null || showFollowing;
    }

    public void setShowFollowing(Boolean showFollowing) {
        this.showFollowing = showFollowing;
    }

    public boolean isShowAnimeLibrary() {
        return showAnimeLibrary == null || showAnimeLibrary;
    }

    public void setShowAnimeLibrary(Boolean showAnimeLibrary) {
        this.showAnimeLibrary = showAnimeLibrary;
    }

    public boolean isShowMangaLibrary() {
        return showMangaLibrary == null || showMangaLibrary;
    }

    public void setShowMangaLibrary(Boolean showMangaLibrary) {
        this.showMangaLibrary = showMangaLibrary;
    }

    public boolean isShowOnlineDiscovery() {
        return Boolean.TRUE.equals(showOnlineDiscovery);
    }

    public void setShowOnlineDiscovery(Boolean showOnlineDiscovery) {
        this.showOnlineDiscovery = showOnlineDiscovery;
    }

    public Instant getLastActiveAt() {
        return lastActiveAt;
    }

    public void markActive() {
        this.lastActiveAt = Instant.now();
    }

    public void markInactive() {
        this.lastActiveAt = null;
    }
}
