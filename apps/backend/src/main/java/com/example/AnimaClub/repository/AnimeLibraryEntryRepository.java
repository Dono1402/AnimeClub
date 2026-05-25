package com.example.AnimaClub.repository;

import com.example.AnimaClub.model.AnimeLibraryEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AnimeLibraryEntryRepository extends JpaRepository<AnimeLibraryEntry, Integer> {
    List<AnimeLibraryEntry> findByAccount_IdOrderByUpdatedAtDesc(Integer accountId);

    List<AnimeLibraryEntry> findTop50ByAccount_IdInOrderByUpdatedAtDesc(List<Integer> accountIds);

    Optional<AnimeLibraryEntry> findByAccount_IdAndAnimeSlug(Integer accountId, String animeSlug);

    boolean existsByIdAndAccount_Id(Integer id, Integer accountId);
}
