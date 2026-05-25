package com.example.AnimaClub.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(
        name = "anime_weekly_ranking",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_anime_weekly_ranking_period_source_anime",
                columnNames = {"source", "period_start", "period_end", "anime_mal_id"}
        ),
        indexes = {
                @Index(name = "idx_anime_weekly_ranking_latest", columnList = "period_end, rank_position"),
                @Index(name = "idx_anime_weekly_ranking_anime", columnList = "anime_mal_id")
        }
)
public class AnimeWeeklyRanking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "anime_mal_id", referencedColumnName = "mal_id", nullable = false)
    private AnimeCatalogEntry anime;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    @Column(name = "rank_position", nullable = false)
    private Integer rankPosition;

    @Column(name = "weekly_score", nullable = false)
    private Double weeklyScore;

    @Column(nullable = false, length = 80)
    private String source = "manual";

    @Column(name = "captured_at", nullable = false)
    private Instant capturedAt;

    protected AnimeWeeklyRanking() {
    }

    public AnimeWeeklyRanking(
            AnimeCatalogEntry anime,
            LocalDate periodStart,
            LocalDate periodEnd,
            Integer rankPosition,
            Double weeklyScore,
            String source,
            Instant capturedAt
    ) {
        this.anime = anime;
        this.periodStart = periodStart;
        this.periodEnd = periodEnd;
        this.rankPosition = rankPosition;
        this.weeklyScore = weeklyScore;
        this.source = source;
        this.capturedAt = capturedAt;
    }

    public Integer getId() {
        return id;
    }

    public AnimeCatalogEntry getAnime() {
        return anime;
    }

    public LocalDate getPeriodStart() {
        return periodStart;
    }

    public LocalDate getPeriodEnd() {
        return periodEnd;
    }

    public Integer getRankPosition() {
        return rankPosition;
    }

    public Double getWeeklyScore() {
        return weeklyScore;
    }

    public String getSource() {
        return source;
    }

    public Instant getCapturedAt() {
        return capturedAt;
    }
}
