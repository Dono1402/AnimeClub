package com.example.AnimaClub.dto;

public record FollowFeedLikeResponse(
        String activityKey,
        String type,
        Integer entryId,
        long likesCount,
        boolean likedByCurrentAccount
) {
}
