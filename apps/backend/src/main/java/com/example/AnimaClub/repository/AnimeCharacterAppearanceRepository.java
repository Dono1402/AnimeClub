package com.example.AnimaClub.repository;

import com.example.AnimaClub.model.AnimeCharacterAppearance;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AnimeCharacterAppearanceRepository extends JpaRepository<AnimeCharacterAppearance, Integer> {

    boolean existsByAnimeMalId(Integer animeMalId);

    Optional<AnimeCharacterAppearance> findByAnimeMalIdAndCharacterMalId(Integer animeMalId, Integer characterMalId);

    List<AnimeCharacterAppearance> findByAnimeMalId(Integer animeMalId, Pageable pageable);
}
