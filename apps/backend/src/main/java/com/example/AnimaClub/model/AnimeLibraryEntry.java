package com.example.AnimaClub.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

@Entity
@Table(
        name = "anime_library_entry",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_anime_library_account_slug",
                columnNames = {"account_id", "anime_slug"}
        )
)
public class AnimeLibraryEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Compte account;

    @Column(name = "anime_slug", nullable = false, length = 140)
    private String animeSlug;

    @Column(name = "parent_anime_slug", length = 140)
    private String parentAnimeSlug;

    @Column(name = "parent_title", length = 180)
    private String parentTitle;

    @Column(name = "season_slug", length = 140)
    private String seasonSlug;

    @Column(name = "season_title", length = 180)
    private String seasonTitle;

    @Column(name = "season_number")
    private Integer seasonNumber;

    @Column(name = "tracking_mode", length = 20)
    private String trackingMode = "SERIES";

    @Column(name = "media_type", length = 40)
    private String mediaType;

    @Column(nullable = false, length = 180)
    private String title;

    @Column(name = "cover_url", length = 500)
    private String coverUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AnimeWatchStatus status = AnimeWatchStatus.PLANNED;

    @Column(name = "watched_episodes", nullable = false)
    private Integer watchedEpisodes = 0;

    @Column(name = "total_episodes", nullable = false)
    private Integer totalEpisodes = 0;

    private Integer score;

    @Column(nullable = false)
    private Boolean favorite = false;

    @Column(length = 1200)
    private String notes = "";

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected AnimeLibraryEntry() {
    }

    public AnimeLibraryEntry(Compte account, String animeSlug) {
        this.account = account;
        this.animeSlug = animeSlug;
    }

    @PrePersist
    @PreUpdate
    public void touch() {
        this.updatedAt = Instant.now();
    }

    public Integer getId() {
        return id;
    }

    public Compte getAccount() {
        return account;
    }

    public String getAnimeSlug() {
        return animeSlug;
    }

    public void setAnimeSlug(String animeSlug) {
        this.animeSlug = animeSlug;
    }

    public String getParentAnimeSlug() {
        return parentAnimeSlug;
    }

    public void setParentAnimeSlug(String parentAnimeSlug) {
        this.parentAnimeSlug = parentAnimeSlug;
    }

    public String getParentTitle() {
        return parentTitle;
    }

    public void setParentTitle(String parentTitle) {
        this.parentTitle = parentTitle;
    }

    public String getSeasonSlug() {
        return seasonSlug;
    }

    public void setSeasonSlug(String seasonSlug) {
        this.seasonSlug = seasonSlug;
    }

    public String getSeasonTitle() {
        return seasonTitle;
    }

    public void setSeasonTitle(String seasonTitle) {
        this.seasonTitle = seasonTitle;
    }

    public Integer getSeasonNumber() {
        return seasonNumber;
    }

    public void setSeasonNumber(Integer seasonNumber) {
        this.seasonNumber = seasonNumber;
    }

    public String getTrackingMode() {
        return trackingMode;
    }

    public void setTrackingMode(String trackingMode) {
        this.trackingMode = trackingMode;
    }

    public String getMediaType() {
        return mediaType;
    }

    public void setMediaType(String mediaType) {
        this.mediaType = mediaType;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getCoverUrl() {
        return coverUrl;
    }

    public void setCoverUrl(String coverUrl) {
        this.coverUrl = coverUrl;
    }

    public AnimeWatchStatus getStatus() {
        return status;
    }

    public void setStatus(AnimeWatchStatus status) {
        this.status = status;
    }

    public Integer getWatchedEpisodes() {
        return watchedEpisodes;
    }

    public void setWatchedEpisodes(Integer watchedEpisodes) {
        this.watchedEpisodes = watchedEpisodes;
    }

    public Integer getTotalEpisodes() {
        return totalEpisodes;
    }

    public void setTotalEpisodes(Integer totalEpisodes) {
        this.totalEpisodes = totalEpisodes;
    }

    public Integer getScore() {
        return score;
    }

    public void setScore(Integer score) {
        this.score = score;
    }

    public Boolean getFavorite() {
        return favorite;
    }

    public void setFavorite(Boolean favorite) {
        this.favorite = favorite;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
