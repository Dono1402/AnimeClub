package com.example.AnimaClub.repository;

import com.example.AnimaClub.model.CharacterCatalogEntry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CharacterCatalogEntryRepository extends JpaRepository<CharacterCatalogEntry, Integer> {

    Optional<CharacterCatalogEntry> findByMalId(Integer malId);

    Optional<CharacterCatalogEntry> findBySlug(String slug);

    boolean existsBySourceAnimeMalId(Integer sourceAnimeMalId);

    Page<CharacterCatalogEntry> findBySourceAnimeMalIdIsNotNull(Pageable pageable);

    @Query("""
            select entry from CharacterCatalogEntry entry
            where entry.sourceAnimeMalId is not null
              and not exists (
                  select appearance.id from AnimeCharacterAppearance appearance
                  where appearance.animeMalId = entry.sourceAnimeMalId
                    and appearance.characterMalId = entry.malId
              )
            """)
    Page<CharacterCatalogEntry> findMissingSourceAnimeAppearances(Pageable pageable);

    @Query("""
            select entry from CharacterCatalogEntry entry
            where entry.sourceAnimeMalId = :sourceAnimeMalId
              and entry.imageUrl is not null
              and trim(entry.imageUrl) <> ''
              and lower(entry.imageUrl) not like '%questionmark%'
              and lower(entry.imageUrl) not like '%apple-touch-icon%'
            """)
    List<CharacterCatalogEntry> findBySourceAnimeMalId(@Param("sourceAnimeMalId") Integer sourceAnimeMalId, Pageable pageable);

    List<CharacterCatalogEntry> findByMalIdIn(Collection<Integer> malIds);

    @Query("""
            select entry from CharacterCatalogEntry entry
            where entry.imageUrl is not null
              and trim(entry.imageUrl) <> ''
              and lower(entry.imageUrl) not like '%questionmark%'
              and lower(entry.imageUrl) not like '%apple-touch-icon%'
              and (
                  :query = ''
                  or lower(entry.name) like lower(concat('%', :query, '%'))
                  or lower(coalesce(entry.nameKanji, '')) like lower(concat('%', :query, '%'))
                  or lower(coalesce(entry.nicknames, '')) like lower(concat('%', :query, '%'))
                  or lower(coalesce(entry.about, '')) like lower(concat('%', :query, '%'))
                  or lower(coalesce(entry.sourceAnimeTitle, '')) like lower(concat('%', :query, '%'))
                  or lower(coalesce(entry.role, '')) like lower(concat('%', :query, '%'))
              )
            """)
    Page<CharacterCatalogEntry> search(@Param("query") String query, Pageable pageable);
}
