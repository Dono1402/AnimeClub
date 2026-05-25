package com.example.AnimaClub.dto;

import java.time.Instant;

public record FollowFeedEntryResponse(
        PublicProfileResponse profile,
        String type,
        AnimeLibraryEntryResponse entry,
        MangaLibraryEntryResponse mangaEntry,
        Instant updatedAt,
        String activityKey,
        Integer activityEntryId,
        long likesCount,
        boolean likedByCurrentAccount
) {
}
