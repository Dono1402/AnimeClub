package com.example.AnimaClub.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

@Entity
@Table(
        name = "character_catalog_entry",
        indexes = {
                @Index(name = "idx_character_source_anime_mal_id", columnList = "source_anime_mal_id")
        },
        uniqueConstraints = @UniqueConstraint(
                name = "uk_character_catalog_mal_id",
                columnNames = "mal_id"
        )
)
public class CharacterCatalogEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "mal_id", nullable = false)
    private Integer malId;

    @Column(nullable = false, length = 140)
    private String slug;

    @Column(nullable = false, length = 260)
    private String name;

    @Column(name = "name_kanji", length = 260)
    private String nameKanji;

    @Column(name = "image_url", length = 700)
    private String imageUrl;

    private Integer favorites;

    @Column(length = 12000)
    private String about;

    @Column(length = 1600)
    private String nicknames;

    @Column(name = "source_anime_mal_id")
    private Integer sourceAnimeMalId;

    @Column(name = "source_anime_title", length = 260)
    private String sourceAnimeTitle;

    @Column(name = "source_anime_slug", length = 140)
    private String sourceAnimeSlug;

    @Column(name = "source_anime_image_url", length = 700)
    private String sourceAnimeImageUrl;

    @Column(length = 40)
    private String role;

    @Column(name = "last_synced_at", nullable = false)
    private Instant lastSyncedAt;

    protected CharacterCatalogEntry() {
    }

    public CharacterCatalogEntry(Integer malId) {
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

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getNameKanji() {
        return nameKanji;
    }

    public void setNameKanji(String nameKanji) {
        this.nameKanji = nameKanji;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public Integer getFavorites() {
        return favorites;
    }

    public void setFavorites(Integer favorites) {
        this.favorites = favorites;
    }

    public String getAbout() {
        return about;
    }

    public void setAbout(String about) {
        this.about = about;
    }

    public String getNicknames() {
        return nicknames;
    }

    public void setNicknames(String nicknames) {
        this.nicknames = nicknames;
    }

    public Integer getSourceAnimeMalId() {
        return sourceAnimeMalId;
    }

    public void setSourceAnimeMalId(Integer sourceAnimeMalId) {
        this.sourceAnimeMalId = sourceAnimeMalId;
    }

    public String getSourceAnimeTitle() {
        return sourceAnimeTitle;
    }

    public void setSourceAnimeTitle(String sourceAnimeTitle) {
        this.sourceAnimeTitle = sourceAnimeTitle;
    }

    public String getSourceAnimeSlug() {
        return sourceAnimeSlug;
    }

    public void setSourceAnimeSlug(String sourceAnimeSlug) {
        this.sourceAnimeSlug = sourceAnimeSlug;
    }

    public String getSourceAnimeImageUrl() {
        return sourceAnimeImageUrl;
    }

    public void setSourceAnimeImageUrl(String sourceAnimeImageUrl) {
        this.sourceAnimeImageUrl = sourceAnimeImageUrl;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public Instant getLastSyncedAt() {
        return lastSyncedAt;
    }

    public void setLastSyncedAt(Instant lastSyncedAt) {
        this.lastSyncedAt = lastSyncedAt;
    }
}
