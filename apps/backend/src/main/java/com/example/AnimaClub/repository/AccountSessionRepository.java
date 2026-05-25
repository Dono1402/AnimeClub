package com.example.AnimaClub.repository;

import com.example.AnimaClub.model.AccountSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;

public interface AccountSessionRepository extends JpaRepository<AccountSession, Integer> {

    Optional<AccountSession> findByTokenHash(String tokenHash);

    void deleteByTokenHash(String tokenHash);

    void deleteByExpiresAtBefore(Instant expiresAt);
}
