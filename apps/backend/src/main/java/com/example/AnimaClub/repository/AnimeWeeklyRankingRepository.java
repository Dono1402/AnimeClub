package com.example.AnimaClub.repository;

import com.example.AnimaClub.model.AnimeWeeklyRanking;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface AnimeWeeklyRankingRepository extends JpaRepository<AnimeWeeklyRanking, Integer> {

    @Query("""
            select ranking from AnimeWeeklyRanking ranking
            join fetch ranking.anime anime
            where ranking.periodEnd = (
                select max(latest.periodEnd) from AnimeWeeklyRanking latest
            )
            order by ranking.rankPosition asc, ranking.weeklyScore desc, anime.title asc
            """)
    List<AnimeWeeklyRanking> findLatestRanking(Pageable pageable);

    @Query("select max(ranking.periodEnd) from AnimeWeeklyRanking ranking")
    Optional<LocalDate> findLatestPeriodEnd();

    void deleteBySourceAndPeriodStartAndPeriodEnd(String source, LocalDate periodStart, LocalDate periodEnd);
}
