package com.example.AnimaClub.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

@Entity
@Table(
        name = "anime_catalog_entry",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_anime_catalog_mal_id",
                columnNames = "mal_id"
        )
)
public class AnimeCatalogEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "mal_id", nullable = false)
    private Integer malId;

    @Column(nullable = false, length = 140)
    private String slug;

    @Column(nullable = false, length = 260)
    private String title;

    @Column(name = "title_english", length = 260)
    private String titleEnglish;

    @Column(name = "title_japanese", length = 260)
    private String titleJapanese;

    @Column(name = "image_url", length = 700)
    private String imageUrl;

    @Column(name = "background_url", length = 700)
    private String backgroundUrl;

    @Column(length = 5000)
    private String synopsis;

    @Column(length = 40)
    private String type;

    private Integer episodes;

    @Column(length = 80)
    private String status;

    private Double score;

    @Column(name = "anime_rank")
    private Integer rank;

    private Integer popularity;

    @Column(length = 32)
    private String season;

    @Column(name = "anime_year")
    private Integer year;

    @Column(length = 1200)
    private String genres;

    @Column(length = 1200)
    private String studios;

    @Column(name = "trailer_url", length = 700)
    private String trailerUrl;

    @Column(name = "last_synced_at", nullable = false)
    private Instant lastSyncedAt;

    @Column(name = "characters_synced_at")
    private Instant charactersSyncedAt;

    protected AnimeCatalogEntry() {
    }

    public AnimeCatalogEntry(Integer malId) {
        this.malId = malId;
    }

    public Integer getId() {
        return id;
    }

    public Integer getMalId() {
        return malId;
    }

    public String getSlug() {
        return slug;
    }

    public void setSlug(String slug) {
        this.slug = slug;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getTitleEnglish() {
        return titleEnglish;
    }

    public void setTitleEnglish(String titleEnglish) {
        this.titleEnglish = titleEnglish;
    }

    public String getTitleJapanese() {
        return titleJapanese;
    }

    public void setTitleJapanese(String titleJapanese) {
        this.titleJapanese = titleJapanese;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public String getBackgroundUrl() {
        return backgroundUrl;
    }

    public void setBackgroundUrl(String backgroundUrl) {
        this.backgroundUrl = backgroundUrl;
    }

    public String getSynopsis() {
        return synopsis;
    }

    public void setSynopsis(String synopsis) {
        this.synopsis = synopsis;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public Integer getEpisodes() {
        return episodes;
    }

    public void setEpisodes(Integer episodes) {
        this.episodes = episodes;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Double getScore() {
        return score;
    }

    public void setScore(Double score) {
        this.score = score;
    }

    public Integer getRank() {
        return rank;
    }

    public void setRank(Integer rank) {
        this.rank = rank;
    }

    public Integer getPopularity() {
        return popularity;
    }

    public void setPopularity(Integer popularity) {
        this.popularity = popularity;
    }

    public String getSeason() {
        return season;
    }

    public void setSeason(String season) {
        this.season = season;
    }

    public Integer getYear() {
        return year;
    }

    public void setYear(Integer year) {
        this.year = year;
    }

    public String getGenres() {
        return genres;
    }

    public void setGenres(String genres) {
        this.genres = genres;
    }

    public String getStudios() {
        return studios;
    }

    public void setStudios(String studios) {
        this.studios = studios;
    }

    public String getTrailerUrl() {
        return trailerUrl;
    }

    public void setTrailerUrl(String trailerUrl) {
        this.trailerUrl = trailerUrl;
    }

    public Instant getLastSyncedAt() {
        return lastSyncedAt;
    }

    public void setLastSyncedAt(Instant lastSyncedAt) {
        this.lastSyncedAt = lastSyncedAt;
    }

    public Instant getCharactersSyncedAt() {
        return charactersSyncedAt;
    }

    public void setCharactersSyncedAt(Instant charactersSyncedAt) {
        this.charactersSyncedAt = charactersSyncedAt;
    }
}
