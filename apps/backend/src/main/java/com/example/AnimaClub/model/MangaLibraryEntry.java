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
        name = "manga_library_entry",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_manga_library_account_slug",
                columnNames = {"account_id", "manga_slug"}
        )
)
public class MangaLibraryEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Compte account;

    @Column(name = "manga_slug", nullable = false, length = 140)
    private String mangaSlug;

    @Column(nullable = false, length = 180)
    private String title;

    @Column(name = "cover_url", length = 500)
    private String coverUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AnimeWatchStatus status = AnimeWatchStatus.PLANNED;

    @Column(name = "read_chapters", nullable = false)
    private Integer readChapters = 0;

    @Column(name = "total_chapters", nullable = false)
    private Integer totalChapters = 0;

    @Column(name = "read_volumes")
    private Integer readVolumes = 0;

    @Column(name = "total_volumes")
    private Integer totalVolumes = 0;

    private Integer score;

    @Column(name = "catalog_type", length = 80)
    private String catalogType;

    @Column(name = "catalog_score")
    private Double catalogScore;

    @Column(name = "catalog_year")
    private Integer catalogYear;

    @Column(name = "catalog_genres", length = 1200)
    private String catalogGenres = "";

    @Column(name = "catalog_authors", length = 1200)
    private String catalogAuthors = "";

    @Column(nullable = false)
    private Boolean favorite = false;

    @Column(length = 1200)
    private String notes = "";

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected MangaLibraryEntry() {
    }

    public MangaLibraryEntry(Compte account, String mangaSlug) {
        this.account = account;
        this.mangaSlug = mangaSlug;
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

    public String getMangaSlug() {
        return mangaSlug;
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

    public Integer getReadChapters() {
        return readChapters;
    }

    public void setReadChapters(Integer readChapters) {
        this.readChapters = readChapters;
    }

    public Integer getTotalChapters() {
        return totalChapters;
    }

    public void setTotalChapters(Integer totalChapters) {
        this.totalChapters = totalChapters;
    }

    public Integer getReadVolumes() {
        return readVolumes;
    }

    public void setReadVolumes(Integer readVolumes) {
        this.readVolumes = readVolumes;
    }

    public Integer getTotalVolumes() {
        return totalVolumes;
    }

    public void setTotalVolumes(Integer totalVolumes) {
        this.totalVolumes = totalVolumes;
    }

    public Integer getScore() {
        return score;
    }

    public void setScore(Integer score) {
        this.score = score;
    }

    public String getCatalogType() {
        return catalogType;
    }

    public void setCatalogType(String catalogType) {
        this.catalogType = catalogType;
    }

    public Double getCatalogScore() {
        return catalogScore;
    }

    public void setCatalogScore(Double catalogScore) {
        this.catalogScore = catalogScore;
    }

    public Integer getCatalogYear() {
        return catalogYear;
    }

    public void setCatalogYear(Integer catalogYear) {
        this.catalogYear = catalogYear;
    }

    public String getCatalogGenres() {
        return catalogGenres;
    }

    public void setCatalogGenres(String catalogGenres) {
        this.catalogGenres = catalogGenres;
    }

    public String getCatalogAuthors() {
        return catalogAuthors;
    }

    public void setCatalogAuthors(String catalogAuthors) {
        this.catalogAuthors = catalogAuthors;
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
