package com.example.AnimaClub.dto;

import java.time.Instant;

public record PublicProfileResponse(
        Integer id,
        String pseudo,
        String displayName,
        String bio,
        String profileStatus,
        String favoriteAnime,
        String accentColor,
        String profilePictureUrl,
        String backgroundUrl,
        Boolean online,
        Instant lastActiveAt,
        Boolean showFollowers,
        Boolean showFollowing,
        Long followersCount,
        Long followingCount,
        Boolean showAnimeLibrary,
        Boolean showMangaLibrary
) {
}
