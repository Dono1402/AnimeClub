package com.example.AnimaClub.dto;

public record FollowStateResponse(
        Integer accountId,
        Integer targetId,
        Boolean following,
        Long followersCount,
        Long followingCount,
        Boolean followersVisible,
        Boolean followingVisible,
        Boolean mutualFollow
) {
}
