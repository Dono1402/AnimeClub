package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.FollowFeedEntryResponse;
import com.example.AnimaClub.dto.FollowFeedLikeRequest;
import com.example.AnimaClub.dto.FollowFeedLikeResponse;
import com.example.AnimaClub.dto.PublicProfileResponse;
import com.example.AnimaClub.model.AccountFollow;
import com.example.AnimaClub.model.AccountNotification;
import com.example.AnimaClub.model.AnimeLibraryEntry;
import com.example.AnimaClub.model.AnimeWatchStatus;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.repository.AccountFollowRepository;
import com.example.AnimaClub.repository.AccountNotificationRepository;
import com.example.AnimaClub.repository.AnimeLibraryEntryRepository;
import com.example.AnimaClub.repository.CompteRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Transactional
class SocialServiceTests {

    @Autowired
    private SocialService socialService;

    @Autowired
    private CompteRepository compteRepository;

    @Autowired
    private AccountFollowRepository accountFollowRepository;

    @Autowired
    private AccountNotificationRepository accountNotificationRepository;

    @Autowired
    private AnimeLibraryEntryRepository animeLibraryEntryRepository;

    @Test
    void followingFeedLikesAreSharedAcrossFollowers() {
        Compte owner = account("feed-owner");
        Compte firstFollower = account("feed-one");
        Compte secondFollower = account("feed-two");
        follow(firstFollower, owner);
        follow(secondFollower, owner);
        AnimeLibraryEntry entry = animeEntry(owner);

        FollowFeedEntryResponse initialFeedEntry = socialService.followingFeed(firstFollower.getId()).get(0);
        assertEquals(0, initialFeedEntry.likesCount());
        assertFalse(initialFeedEntry.likedByCurrentAccount());

        FollowFeedLikeResponse firstLike = socialService.toggleFollowingFeedLike(
                firstFollower.getId(),
                new FollowFeedLikeRequest("ANIME", entry.getId())
        );
        assertTrue(firstLike.likedByCurrentAccount());
        assertEquals(1, firstLike.likesCount());
        assertEquals(1, accountNotificationRepository.countByRecipient_IdAndReadAtIsNull(owner.getId()));

        FollowFeedEntryResponse secondFollowerFeedEntry = socialService.followingFeed(secondFollower.getId()).get(0);
        assertEquals(1, secondFollowerFeedEntry.likesCount());
        assertFalse(secondFollowerFeedEntry.likedByCurrentAccount());

        FollowFeedLikeResponse secondLike = socialService.toggleFollowingFeedLike(
                secondFollower.getId(),
                new FollowFeedLikeRequest("ANIME", entry.getId())
        );
        assertTrue(secondLike.likedByCurrentAccount());
        assertEquals(2, secondLike.likesCount());
        assertEquals(2, accountNotificationRepository.countByRecipient_IdAndReadAtIsNull(owner.getId()));

        FollowFeedEntryResponse updatedFirstFollowerEntry = socialService.followingFeed(firstFollower.getId()).get(0);
        assertEquals(2, updatedFirstFollowerEntry.likesCount());
        assertTrue(updatedFirstFollowerEntry.likedByCurrentAccount());
    }

    @Test
    void followingFeedLikeRejectsNonFollowedActivities() {
        Compte owner = account("feed-hidden");
        Compte viewer = account("feed-viewer");
        AnimeLibraryEntry entry = animeEntry(owner);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> socialService.toggleFollowingFeedLike(
                        viewer.getId(),
                        new FollowFeedLikeRequest("ANIME", entry.getId())
                )
        );

        assertEquals(HttpStatus.FORBIDDEN, exception.getStatusCode());
    }

    @Test
    void onlineDiscoveryReturnsOptedInUnfollowedProfilesIncludingOffline() {
        Compte viewer = account("online-viewer");
        Compte visible = account("online-visible");
        Compte hidden = account("online-hidden");
        Compte offline = account("online-offline");
        Compte followed = account("online-followed");

        visible.setShowOnlineDiscovery(true);
        visible.markActive();
        hidden.markActive();
        offline.setShowOnlineDiscovery(true);
        followed.setShowOnlineDiscovery(true);
        followed.markActive();
        follow(viewer, followed);

        List<PublicProfileResponse> profiles = socialService.onlineDiscoveryProfiles(viewer.getId());

        assertEquals(List.of(visible.getId(), offline.getId()), profiles.stream().map(PublicProfileResponse::id).toList());
        assertTrue(profiles.get(0).online());
        assertFalse(profiles.get(1).online());
    }

    @Test
    void markNotificationsReadByTypeOnlyClearsMatchingType() {
        Compte owner = account("notif-owner");
        Compte follower = account("notif-follower");
        Compte liker = account("notif-liker");
        accountNotificationRepository.save(new AccountNotification(owner, follower, AccountNotification.TYPE_FOLLOW));
        accountNotificationRepository.save(new AccountNotification(owner, liker, AccountNotification.TYPE_ACTIVITY_LIKE));

        socialService.markNotificationsReadByType(owner.getId(), AccountNotification.TYPE_FOLLOW);

        assertEquals(1, accountNotificationRepository.countByRecipient_IdAndReadAtIsNull(owner.getId()));
        assertTrue(accountNotificationRepository
                .findByRecipient_IdAndTypeAndReadAtIsNull(owner.getId(), AccountNotification.TYPE_FOLLOW)
                .isEmpty());
        assertEquals(1, accountNotificationRepository
                .findByRecipient_IdAndTypeAndReadAtIsNull(owner.getId(), AccountNotification.TYPE_ACTIVITY_LIKE)
                .size());
    }

    private void follow(Compte follower, Compte followed) {
        accountFollowRepository.save(new AccountFollow(follower, followed));
    }

    private Compte account(String pseudo) {
        return compteRepository.save(new Compte(pseudo, pseudo + "@example.test", "{noop}password"));
    }

    private AnimeLibraryEntry animeEntry(Compte account) {
        AnimeLibraryEntry entry = new AnimeLibraryEntry(account, "mal-social-test-" + account.getId());
        entry.setTitle("Social Test Anime");
        entry.setCoverUrl("https://cdn.example.test/social.jpg");
        entry.setStatus(AnimeWatchStatus.WATCHING);
        entry.setWatchedEpisodes(3);
        entry.setTotalEpisodes(12);
        return animeLibraryEntryRepository.save(entry);
    }
}
