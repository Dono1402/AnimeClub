package com.example.AnimaClub.repository;

import com.example.AnimaClub.model.AccountFollow;
import com.example.AnimaClub.model.Compte;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AccountFollowRepository extends JpaRepository<AccountFollow, Integer> {

    boolean existsByFollower_IdAndFollowed_Id(Integer followerId, Integer followedId);

    Optional<AccountFollow> findByFollower_IdAndFollowed_Id(Integer followerId, Integer followedId);

    List<AccountFollow> findByFollower_IdOrderByCreatedAtDesc(Integer followerId);

    List<AccountFollow> findByFollowed_IdOrderByCreatedAtDesc(Integer followedId);

    @Query("""
            select follow.followed from AccountFollow follow
            where follow.follower.id = :accountId
              and exists (
                select reverseFollow.id from AccountFollow reverseFollow
                where reverseFollow.follower.id = follow.followed.id
                  and reverseFollow.followed.id = :accountId
              )
            order by follow.createdAt desc
            """)
    List<Compte> findMutualFriends(@Param("accountId") Integer accountId);

    long countByFollower_Id(Integer followerId);

    long countByFollowed_Id(Integer followedId);
}
