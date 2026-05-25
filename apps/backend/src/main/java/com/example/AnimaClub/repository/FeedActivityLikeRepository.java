package com.example.AnimaClub.repository;

import com.example.AnimaClub.model.FeedActivityLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FeedActivityLikeRepository extends JpaRepository<FeedActivityLike, Integer> {

    Optional<FeedActivityLike> findByAccount_IdAndActivityTypeAndActivityEntryId(
            Integer accountId,
            String activityType,
            Integer activityEntryId
    );

    List<FeedActivityLike> findByAccount_IdAndActivityTypeAndActivityEntryIdIn(
            Integer accountId,
            String activityType,
            Collection<Integer> activityEntryIds
    );

    long countByActivityTypeAndActivityEntryId(String activityType, Integer activityEntryId);

    @Query("""
            select activityLike.activityType as activityType,
                   activityLike.activityEntryId as activityEntryId,
                   count(activityLike.id) as likeCount
            from FeedActivityLike activityLike
            where activityLike.activityType = :activityType
              and activityLike.activityEntryId in :entryIds
            group by activityLike.activityType, activityLike.activityEntryId
            """)
    List<ActivityLikeCount> countByActivityTypeAndEntryIds(
            @Param("activityType") String activityType,
            @Param("entryIds") Collection<Integer> entryIds
    );

    interface ActivityLikeCount {
        String getActivityType();

        Integer getActivityEntryId();

        Long getLikeCount();
    }
}
