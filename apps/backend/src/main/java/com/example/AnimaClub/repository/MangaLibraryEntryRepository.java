package com.example.AnimaClub.repository;

import com.example.AnimaClub.model.MangaLibraryEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MangaLibraryEntryRepository extends JpaRepository<MangaLibraryEntry, Integer> {
    List<MangaLibraryEntry> findByAccount_IdOrderByUpdatedAtDesc(Integer accountId);

    List<MangaLibraryEntry> findTop50ByAccount_IdInOrderByUpdatedAtDesc(List<Integer> accountIds);

    Optional<MangaLibraryEntry> findByAccount_IdAndMangaSlug(Integer accountId, String mangaSlug);

    boolean existsByIdAndAccount_Id(Integer id, Integer accountId);
}
