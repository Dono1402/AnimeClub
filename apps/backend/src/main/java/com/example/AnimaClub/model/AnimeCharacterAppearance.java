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
        name = "anime_character_appearance",
        indexes = {
                @Index(name = "idx_anime_character_anime_mal_id", columnList = "anime_mal_id"),
                @Index(name = "idx_anime_character_character_mal_id", columnList = "character_mal_id")
        },
        uniqueConstraints = @UniqueConstraint(
                name = "uk_anime_character_appearance",
                columnNames = {"anime_mal_id", "character_mal_id"}
        )
)
public class AnimeCharacterAppearance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "anime_mal_id", nullable = false)
    private Integer animeMalId;

    @Column(name = "anime_slug", length = 140)
    private String animeSlug;

    @Column(name = "anime_title", length = 260)
    private String animeTitle;

    @Column(name = "anime_image_url", length = 700)
    private String animeImageUrl;

    @Column(name = "character_mal_id", nullable = false)
    private Integer characterMalId;

    @Column(length = 40)
    private String role;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AnimeCharacterAppearance() {
    }

    public AnimeCharacterAppearance(Integer animeMalId, Integer characterMalId) {
        this.animeMalId = animeMalId;
        this.characterMalId = characterMalId;
    }

    public Integer getId() {
        return id;
    }

    public Integer getAnimeMalId() {
        return animeMalId;
    }

    public String getAnimeSlug() {
        return animeSlug;
    }

    public void setAnimeSlug(String animeSlug) {
        this.animeSlug = animeSlug;
    }

    public String getAnimeTitle() {
        return animeTitle;
    }

    public void setAnimeTitle(String animeTitle) {
        this.animeTitle = animeTitle;
    }

    public String getAnimeImageUrl() {
        return animeImageUrl;
    }

    public void setAnimeImageUrl(String animeImageUrl) {
        this.animeImageUrl = animeImageUrl;
    }

    public Integer getCharacterMalId() {
        return characterMalId;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
