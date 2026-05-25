package com.example.AnimaClub.repository;

import com.example.AnimaClub.model.AnimeCatalogEntry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface AnimeCatalogEntryRepository extends JpaRepository<AnimeCatalogEntry, Integer> {

    Optional<AnimeCatalogEntry> findByMalId(Integer malId);

    Optional<AnimeCatalogEntry> findBySlug(String slug);

    @Query("""
            select entry from AnimeCatalogEntry entry
            where (
                    lower(entry.title) = lower(:title)
                    or lower(coalesce(entry.titleEnglish, '')) = lower(:title)
                  )
              and (:episodes is null or entry.episodes = :episodes)
            order by entry.popularity asc, entry.malId asc
            """)
    List<AnimeCatalogEntry> findExactTitleMatches(
            @Param("title") String title,
            @Param("episodes") Integer episodes,
            Pageable pageable
    );

    @Query("""
            select entry from AnimeCatalogEntry entry
            where :query = ''
               or lower(entry.title) like lower(concat('%', :query, '%'))
               or lower(coalesce(entry.titleEnglish, '')) like lower(concat('%', :query, '%'))
               or lower(coalesce(entry.titleJapanese, '')) like lower(concat('%', :query, '%'))
               or lower(coalesce(entry.genres, '')) like lower(concat('%', :query, '%'))
               or lower(coalesce(entry.studios, '')) like lower(concat('%', :query, '%'))
               or lower(replace(entry.title, '-', ' ')) like lower(concat('%', :query, '%'))
               or lower(replace(coalesce(entry.titleEnglish, ''), '-', ' ')) like lower(concat('%', :query, '%'))
               or lower(replace(coalesce(entry.titleJapanese, ''), '-', ' ')) like lower(concat('%', :query, '%'))
               or (:alternateQuery <> '' and lower(entry.title) like lower(concat('%', :alternateQuery, '%')))
               or (:alternateQuery <> '' and lower(coalesce(entry.titleEnglish, '')) like lower(concat('%', :alternateQuery, '%')))
               or (:alternateQuery <> '' and lower(coalesce(entry.titleJapanese, '')) like lower(concat('%', :alternateQuery, '%')))
            """)
    Page<AnimeCatalogEntry> search(
            @Param("query") String query,
            @Param("alternateQuery") String alternateQuery,
            Pageable pageable
    );

    @Query("""
            select entry from AnimeCatalogEntry entry
            where (:query = ''
                   or lower(entry.title) like lower(concat('%', :query, '%'))
                   or lower(coalesce(entry.titleEnglish, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(entry.titleJapanese, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(entry.genres, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(entry.studios, '')) like lower(concat('%', :query, '%'))
                   or lower(replace(entry.title, '-', ' ')) like lower(concat('%', :query, '%'))
                   or lower(replace(coalesce(entry.titleEnglish, ''), '-', ' ')) like lower(concat('%', :query, '%'))
                   or lower(replace(coalesce(entry.titleJapanese, ''), '-', ' ')) like lower(concat('%', :query, '%'))
                   or (:alternateQuery <> '' and lower(entry.title) like lower(concat('%', :alternateQuery, '%')))
                   or (:alternateQuery <> '' and lower(coalesce(entry.titleEnglish, '')) like lower(concat('%', :alternateQuery, '%')))
                   or (:alternateQuery <> '' and lower(coalesce(entry.titleJapanese, '')) like lower(concat('%', :alternateQuery, '%'))))
              and (:genre = '' or lower(coalesce(entry.genres, '')) like lower(concat('%', :genre, '%')))
              and (:status = '' or lower(coalesce(entry.status, '')) = :status)
              and (:year is null or entry.year = :year)
              and (:season = '' or lower(coalesce(entry.season, '')) = :season)
              and (:minScore is null or entry.score >= :minScore)
              and (
                   :type = ''
                   or (:type = 'film' and lower(coalesce(entry.type, '')) in ('movie', 'film'))
                   or (:type = 'tv' and lower(coalesce(entry.type, '')) in ('tv', 'tv special', 'serie', 'série'))
                   or (:type not in ('film', 'tv') and lower(coalesce(entry.type, '')) = :type)
              )
            """)
    Page<AnimeCatalogEntry> searchWithFilters(
            @Param("query") String query,
            @Param("alternateQuery") String alternateQuery,
            @Param("genre") String genre,
            @Param("type") String type,
            @Param("status") String status,
            @Param("year") Integer year,
            @Param("season") String season,
            @Param("minScore") Double minScore,
            Pageable pageable
    );

    @Query("""
            select entry from AnimeCatalogEntry entry
            where entry.score is null
               or entry.year is null
            """)
    List<AnimeCatalogEntry> findMissingFacts(Pageable pageable);

    long countByMalIdIsNotNull();

    long countByMalIdIsNotNullAndCharactersSyncedAtIsNotNull();

    long countByMalIdIsNotNullAndCharactersSyncedAtIsNull();

    List<AnimeCatalogEntry> findByMalIdIsNotNullAndCharactersSyncedAtIsNull(Pageable pageable);

    @Modifying
    @Transactional
    @Query("""
            update AnimeCatalogEntry entry
            set entry.charactersSyncedAt = :syncedAt
            where entry.charactersSyncedAt is null
              and exists (
                  select appearance.id from AnimeCharacterAppearance appearance
                  where appearance.animeMalId = entry.malId
              )
            """)
    int markEntriesWithCharacterAppearancesAsSynced(@Param("syncedAt") Instant syncedAt);

    @Modifying
    @Transactional
    @Query("update AnimeCatalogEntry entry set entry.charactersSyncedAt = null")
    int clearCharacterSyncState();
}
