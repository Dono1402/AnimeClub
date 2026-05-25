package com.example.AnimaClub.repository;

import com.example.AnimaClub.model.Compte;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface CompteRepository extends JpaRepository<Compte, Integer> {

    Optional<Compte> findByPseudoIgnoreCase(String pseudo);

    Optional<Compte> findByLegacyPseudoIgnoreCase(String legacyPseudo);

    Optional<Compte> findByMailIgnoreCase(String mail);

    Optional<Compte> findByEmailConfirmationToken(String token);

    Optional<Compte> findByPasswordResetToken(String token);

    @Query("""
            select compte
            from Compte compte
            where compte.id <> :accountId
              and compte.showOnlineDiscovery = true
              and compte.lastActiveAt is not null
              and compte.lastActiveAt > :onlineAfter
              and not exists (
                select follow.id
                from AccountFollow follow
                where follow.follower.id = :accountId
                  and follow.followed.id = compte.id
              )
            order by compte.lastActiveAt desc
            """)
    List<Compte> findOnlineDiscoveryProfiles(
            @Param("accountId") Integer accountId,
            @Param("onlineAfter") Instant onlineAfter
    );

    boolean existsByPseudoIgnoreCase(String pseudo);

    boolean existsByMailIgnoreCase(String mail);
}
