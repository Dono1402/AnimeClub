package com.example.AnimaClub.dto;

public record UpdatePrivacyRequest(
        Boolean showFollowers,
        Boolean showFollowing,
        Boolean showAnimeLibrary,
        Boolean showMangaLibrary,
        Boolean showOnlineDiscovery
) {
}
