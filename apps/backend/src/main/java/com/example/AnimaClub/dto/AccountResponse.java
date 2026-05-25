package com.example.AnimaClub.dto;

public record AccountResponse(
        Integer id,
        String pseudo,
        String mail,
        Boolean emailVerified,
        String displayName,
        String bio,
        String profileStatus,
        String favoriteAnime,
        String accentColor,
        String profilePictureUrl,
        String backgroundUrl,
        Boolean showFollowers,
        Boolean showFollowing,
        Boolean showAnimeLibrary,
        Boolean showMangaLibrary,
        Boolean showOnlineDiscovery,
        Boolean usernameChangeRequired
) {
}
