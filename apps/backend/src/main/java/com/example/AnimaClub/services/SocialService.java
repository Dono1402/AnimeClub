package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.AccountNotificationResponse;
import com.example.AnimaClub.dto.AnimeLibraryEntryResponse;
import com.example.AnimaClub.dto.FollowFeedEntryResponse;
import com.example.AnimaClub.dto.FollowFeedLikeRequest;
import com.example.AnimaClub.dto.FollowFeedLikeResponse;
import com.example.AnimaClub.dto.FollowStateResponse;
import com.example.AnimaClub.dto.MangaLibraryEntryResponse;
import com.example.AnimaClub.dto.PublicProfileResponse;
import com.example.AnimaClub.model.AccountFollow;
import com.example.AnimaClub.model.AccountNotification;
import com.example.AnimaClub.model.AnimeLibraryEntry;
import com.example.AnimaClub.model.AnimeWatchStatus;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.model.FeedActivityLike;
import com.example.AnimaClub.model.MangaLibraryEntry;
import com.example.AnimaClub.repository.AccountFollowRepository;
import com.example.AnimaClub.repository.AccountNotificationRepository;
import com.example.AnimaClub.repository.AnimeLibraryEntryRepository;
import com.example.AnimaClub.repository.CompteRepository;
import com.example.AnimaClub.repository.FeedActivityLikeRepository;
import com.example.AnimaClub.repository.MangaLibraryEntryRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class SocialService {

    private final AccountFollowRepository accountFollowRepository;
    private final AccountNotificationRepository accountNotificationRepository;
    private final AnimeLibraryEntryRepository animeLibraryEntryRepository;
    private final MangaLibraryEntryRepository mangaLibraryEntryRepository;
    private final FeedActivityLikeRepository feedActivityLikeRepository;
    private final CompteRepository compteRepository;

    public SocialService(
            AccountFollowRepository accountFollowRepository,
            AccountNotificationRepository accountNotificationRepository,
            AnimeLibraryEntryRepository animeLibraryEntryRepository,
            MangaLibraryEntryRepository mangaLibraryEntryRepository,
            FeedActivityLikeRepository feedActivityLikeRepository,
            CompteRepository compteRepository
    ) {
        this.accountFollowRepository = accountFollowRepository;
        this.accountNotificationRepository = accountNotificationRepository;
        this.animeLibraryEntryRepository = animeLibraryEntryRepository;
        this.mangaLibraryEntryRepository = mangaLibraryEntryRepository;
        this.feedActivityLikeRepository = feedActivityLikeRepository;
        this.compteRepository = compteRepository;
    }

    @Transactional
    public FollowStateResponse follow(Integer accountId, Integer targetId) {
        if (accountId.equals(targetId)) {
            throw new IllegalArgumentException("Tu ne peux pas te suivre toi-même.");
        }

        Compte follower = account(accountId);
        Compte followed = account(targetId);
        if (!accountFollowRepository.existsByFollower_IdAndFollowed_Id(accountId, targetId)) {
            accountFollowRepository.save(new AccountFollow(follower, followed));
            accountNotificationRepository.save(new AccountNotification(followed, follower, AccountNotification.TYPE_FOLLOW));
        }

        return followState(accountId, targetId);
    }

    @Transactional
    public FollowStateResponse unfollow(Integer accountId, Integer targetId) {
        account(accountId);
        account(targetId);
        accountFollowRepository.findByFollower_IdAndFollowed_Id(accountId, targetId)
                .ifPresent(accountFollowRepository::delete);
        return followState(accountId, targetId);
    }

    @Transactional(readOnly = true)
    public FollowStateResponse followState(Integer accountId, Integer targetId) {
        account(accountId);
        Compte target = account(targetId);
        boolean ownProfile = accountId.equals(targetId);
        boolean following = accountFollowRepository.existsByFollower_IdAndFollowed_Id(accountId, targetId);
        boolean followedByTarget = accountFollowRepository.existsByFollower_IdAndFollowed_Id(targetId, accountId);
        boolean followersVisible = ownProfile || target.isShowFollowers();
        boolean followingVisible = ownProfile;

        return new FollowStateResponse(
                accountId,
                targetId,
                following,
                followersVisible ? accountFollowRepository.countByFollowed_Id(targetId) : 0,
                followingVisible ? accountFollowRepository.countByFollower_Id(targetId) : 0,
                followersVisible,
                followingVisible,
                !ownProfile && following && followedByTarget
        );
    }

    @Transactional(readOnly = true)
    public List<PublicProfileResponse> following(Integer accountId) {
        account(accountId);
        return accountFollowRepository.findByFollower_IdOrderByCreatedAtDesc(accountId)
                .stream()
                .map((follow) -> toPublicProfile(follow.getFollowed()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PublicProfileResponse> publicFollowing(String pseudo) {
        publicAccount(pseudo);
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La liste des suivis est personnelle.");
    }

    @Transactional(readOnly = true)
    public List<PublicProfileResponse> publicFollowers(String pseudo) {
        Compte target = publicAccount(pseudo);
        if (!target.isShowFollowers()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Les abonnes de ce profil sont prives.");
        }

        return followers(target.getId());
    }

    @Transactional(readOnly = true)
    public List<PublicProfileResponse> followers(Integer accountId) {
        account(accountId);
        return accountFollowRepository.findByFollowed_IdOrderByCreatedAtDesc(accountId)
                .stream()
                .map((follow) -> toPublicProfile(follow.getFollower()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PublicProfileResponse> onlineDiscoveryProfiles(Integer accountId) {
        account(accountId);
        return compteRepository.findOnlineDiscoveryProfiles(accountId, Instant.now().minus(Duration.ofSeconds(60)))
                .stream()
                .map(this::toPublicProfile)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<FollowFeedEntryResponse> followingFeed(Integer accountId) {
        account(accountId);

        List<Integer> followedIds = accountFollowRepository.findByFollower_IdOrderByCreatedAtDesc(accountId)
                .stream()
                .map((follow) -> follow.getFollowed().getId())
                .toList();
        if (followedIds.isEmpty()) {
            return List.of();
        }

        Map<Integer, Compte> profilesById = compteRepository.findAllById(followedIds)
                .stream()
                .collect(Collectors.toMap(Compte::getId, Function.identity()));

        List<AnimeLibraryEntry> animeEntries = animeLibraryEntryRepository.findTop50ByAccount_IdInOrderByUpdatedAtDesc(followedIds)
                .stream()
                .filter((entry) -> entry.getAccount().isShowAnimeLibrary())
                .toList();
        List<MangaLibraryEntry> mangaEntries = mangaLibraryEntryRepository.findTop50ByAccount_IdInOrderByUpdatedAtDesc(followedIds)
                .stream()
                .filter((entry) -> entry.getAccount().isShowMangaLibrary())
                .toList();

        List<Integer> animeEntryIds = animeEntries.stream().map(AnimeLibraryEntry::getId).toList();
        List<Integer> mangaEntryIds = mangaEntries.stream().map(MangaLibraryEntry::getId).toList();
        Map<String, Long> likeCounts = activityLikeCounts(animeEntryIds, mangaEntryIds);
        Set<String> likedActivities = likedActivityKeys(accountId, animeEntryIds, mangaEntryIds);

        Stream<FollowFeedEntryResponse> animeFeed = animeEntries.stream()
                .map((entry) -> toFollowFeedEntry(
                        profilesById.get(entry.getAccount().getId()),
                        FeedActivityLike.TYPE_ANIME,
                        toEntryResponse(entry),
                        null,
                        entry.getId(),
                        entry.getUpdatedAt(),
                        likeCounts,
                        likedActivities
                ));
        Stream<FollowFeedEntryResponse> mangaFeed = mangaEntries.stream()
                .map((entry) -> toFollowFeedEntry(
                        profilesById.get(entry.getAccount().getId()),
                        FeedActivityLike.TYPE_MANGA,
                        null,
                        toMangaEntryResponse(entry),
                        entry.getId(),
                        entry.getUpdatedAt(),
                        likeCounts,
                        likedActivities
                ));

        return Stream.concat(animeFeed, mangaFeed)
                .sorted(Comparator.comparing(FollowFeedEntryResponse::updatedAt).reversed())
                .limit(50)
                .toList();
    }

    @Transactional
    public FollowFeedLikeResponse toggleFollowingFeedLike(Integer accountId, FollowFeedLikeRequest request) {
        Compte liker = account(accountId);
        String activityType = normalizeActivityType(request.type());
        Integer entryId = request.entryId();
        if (entryId == null || entryId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Activite invalide.");
        }

        Compte owner = activityOwner(activityType, entryId);
        if (!accountFollowRepository.existsByFollower_IdAndFollowed_Id(accountId, owner.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cette activite n'est pas dans tes suivis.");
        }

        boolean liked = feedActivityLikeRepository
                .findByAccount_IdAndActivityTypeAndActivityEntryId(accountId, activityType, entryId)
                .map((activityLike) -> {
                    feedActivityLikeRepository.delete(activityLike);
                    return false;
                })
                .orElseGet(() -> {
                    feedActivityLikeRepository.save(new FeedActivityLike(liker, owner, activityType, entryId));
                    return true;
                });

        if (liked) {
            notifyActivityLike(owner, liker);
        }

        long likesCount = feedActivityLikeRepository.countByActivityTypeAndActivityEntryId(activityType, entryId);
        return new FollowFeedLikeResponse(activityKey(activityType, entryId), activityType, entryId, likesCount, liked);
    }

    @Transactional(readOnly = true)
    public List<AccountNotificationResponse> notifications(Integer accountId) {
        account(accountId);
        return accountNotificationRepository.findByRecipient_IdOrderByCreatedAtDesc(accountId)
                .stream()
                .map(this::toNotificationResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Long> unreadNotificationCount(Integer accountId) {
        account(accountId);
        return Map.of("count", accountNotificationRepository.countByRecipient_IdAndReadAtIsNull(accountId));
    }

    @Transactional
    public List<AccountNotificationResponse> markNotificationsRead(Integer accountId) {
        account(accountId);
        accountNotificationRepository.findByRecipient_IdAndReadAtIsNull(accountId)
                .forEach(AccountNotification::markRead);

        return notifications(accountId);
    }

    @Transactional
    public List<AccountNotificationResponse> markNotificationsReadByType(Integer accountId, String type) {
        account(accountId);
        String notificationType = normalizeNotificationType(type);
        accountNotificationRepository.findByRecipient_IdAndTypeAndReadAtIsNull(accountId, notificationType)
                .forEach(AccountNotification::markRead);

        return notifications(accountId);
    }

    @Transactional
    public void deleteNotifications(Integer accountId) {
        account(accountId);
        accountNotificationRepository.deleteByRecipient_Id(accountId);
    }

    @Transactional
    public void deleteNotification(Integer accountId, Integer notificationId) {
        account(accountId);
        accountNotificationRepository.findByIdAndRecipient_Id(notificationId, accountId)
                .ifPresent(accountNotificationRepository::delete);
    }

    private Compte account(Integer accountId) {
        return compteRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Compte introuvable."));
    }

    private String normalizeNotificationType(String type) {
        return switch (type == null ? "" : type.trim().toUpperCase()) {
            case AccountNotification.TYPE_FOLLOW -> AccountNotification.TYPE_FOLLOW;
            case AccountNotification.TYPE_ACTIVITY_LIKE -> AccountNotification.TYPE_ACTIVITY_LIKE;
            case AccountNotification.TYPE_USERNAME_CHANGE_REQUIRED -> AccountNotification.TYPE_USERNAME_CHANGE_REQUIRED;
            case AccountNotification.TYPE_FRIEND_ONLINE -> AccountNotification.TYPE_FRIEND_ONLINE;
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Type de notification inconnu.");
        };
    }

    private void notifyActivityLike(Compte recipient, Compte actor) {
        if (recipient.getId().equals(actor.getId())) {
            return;
        }

        boolean alreadyHasUnreadLikeNotification = accountNotificationRepository
                .existsByRecipient_IdAndActor_IdAndTypeAndReadAtIsNull(
                        recipient.getId(),
                        actor.getId(),
                        AccountNotification.TYPE_ACTIVITY_LIKE
                );
        if (alreadyHasUnreadLikeNotification) {
            return;
        }

        accountNotificationRepository.save(new AccountNotification(
                recipient,
                actor,
                AccountNotification.TYPE_ACTIVITY_LIKE
        ));
    }

    private Compte publicAccount(String pseudo) {
        if (pseudo == null || pseudo.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Profil introuvable.");
        }

        String cleanedPseudo = pseudo.trim();
        return compteRepository.findByPseudoIgnoreCase(cleanedPseudo)
                .or(() -> compteRepository.findByLegacyPseudoIgnoreCase(cleanedPseudo))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Profil introuvable."));
    }

    private AccountNotificationResponse toNotificationResponse(AccountNotification notification) {
        return new AccountNotificationResponse(
                notification.getId(),
                notification.getType(),
                toPublicProfile(notification.getActor()),
                notification.isRead(),
                notification.getCreatedAt()
        );
    }

    private FollowFeedEntryResponse toFollowFeedEntry(
            Compte profile,
            String activityType,
            AnimeLibraryEntryResponse animeEntry,
            MangaLibraryEntryResponse mangaEntry,
            Integer activityEntryId,
            Instant updatedAt,
            Map<String, Long> likeCounts,
            Set<String> likedActivities
    ) {
        String key = activityKey(activityType, activityEntryId);
        return new FollowFeedEntryResponse(
                toPublicProfile(profile),
                activityType,
                animeEntry,
                mangaEntry,
                updatedAt,
                key,
                activityEntryId,
                likeCounts.getOrDefault(key, 0L),
                likedActivities.contains(key)
        );
    }

    private Map<String, Long> activityLikeCounts(List<Integer> animeEntryIds, List<Integer> mangaEntryIds) {
        Map<String, Long> counts = new HashMap<>();
        collectActivityLikeCounts(counts, FeedActivityLike.TYPE_ANIME, animeEntryIds);
        collectActivityLikeCounts(counts, FeedActivityLike.TYPE_MANGA, mangaEntryIds);
        return counts;
    }

    private void collectActivityLikeCounts(Map<String, Long> counts, String activityType, List<Integer> entryIds) {
        if (entryIds.isEmpty()) {
            return;
        }

        feedActivityLikeRepository.countByActivityTypeAndEntryIds(activityType, entryIds)
                .forEach((count) -> counts.put(
                        activityKey(count.getActivityType(), count.getActivityEntryId()),
                        count.getLikeCount()
                ));
    }

    private Set<String> likedActivityKeys(Integer accountId, List<Integer> animeEntryIds, List<Integer> mangaEntryIds) {
        Set<String> keys = new HashSet<>();
        collectLikedActivityKeys(keys, accountId, FeedActivityLike.TYPE_ANIME, animeEntryIds);
        collectLikedActivityKeys(keys, accountId, FeedActivityLike.TYPE_MANGA, mangaEntryIds);
        return keys;
    }

    private void collectLikedActivityKeys(Set<String> keys, Integer accountId, String activityType, List<Integer> entryIds) {
        if (entryIds.isEmpty()) {
            return;
        }

        feedActivityLikeRepository.findByAccount_IdAndActivityTypeAndActivityEntryIdIn(accountId, activityType, entryIds)
                .forEach((activityLike) -> keys.add(activityKey(
                        activityLike.getActivityType(),
                        activityLike.getActivityEntryId()
                )));
    }

    private String normalizeActivityType(String activityType) {
        if (activityType == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Type d'activite invalide.");
        }

        String cleaned = activityType.trim().toUpperCase();
        if (FeedActivityLike.TYPE_ANIME.equals(cleaned) || FeedActivityLike.TYPE_MANGA.equals(cleaned)) {
            return cleaned;
        }

        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Type d'activite invalide.");
    }

    private Compte activityOwner(String activityType, Integer entryId) {
        if (FeedActivityLike.TYPE_ANIME.equals(activityType)) {
            AnimeLibraryEntry entry = animeLibraryEntryRepository.findById(entryId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Activite introuvable."));
            if (!entry.getAccount().isShowAnimeLibrary()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Animetheque privee.");
            }
            return entry.getAccount();
        }

        MangaLibraryEntry entry = mangaLibraryEntryRepository.findById(entryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Activite introuvable."));
        if (!entry.getAccount().isShowMangaLibrary()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Mangatheque privee.");
        }
        return entry.getAccount();
    }

    private String activityKey(String activityType, Integer activityEntryId) {
        return activityType + "-" + activityEntryId;
    }

    private PublicProfileResponse toPublicProfile(Compte compte) {
        boolean hasProfilePicture = hasBytes(compte.getProfilPicture());
        boolean hasBackground = hasBytes(compte.getBackground());

        return new PublicProfileResponse(
                compte.getId(),
                compte.getPseudo(),
                firstNotBlank(compte.getDisplayName(), compte.getPseudo()),
                clean(compte.getProfileBio()),
                clean(compte.getProfileStatus()),
                clean(compte.getFavoriteAnime()),
                firstNotBlank(compte.getAccentColor(), "#c7954c"),
                hasProfilePicture ? "/account/%d/profile-picture".formatted(compte.getId()) : null,
                hasBackground ? "/account/%d/background".formatted(compte.getId()) : null,
                isOnline(compte),
                compte.getLastActiveAt(),
                compte.isShowFollowers(),
                false,
                compte.isShowFollowers() ? accountFollowRepository.countByFollowed_Id(compte.getId()) : 0,
                0L,
                compte.isShowAnimeLibrary(),
                compte.isShowMangaLibrary()
        );
    }

    private AnimeLibraryEntryResponse toEntryResponse(AnimeLibraryEntry entry) {
        return new AnimeLibraryEntryResponse(
                entry.getId(),
                entry.getAccount().getId(),
                entry.getAnimeSlug(),
                entry.getParentAnimeSlug(),
                entry.getParentTitle(),
                entry.getSeasonSlug(),
                entry.getSeasonTitle(),
                entry.getSeasonNumber(),
                entry.getTrackingMode() == null ? "SERIES" : entry.getTrackingMode(),
                entry.getMediaType(),
                entry.getTitle(),
                entry.getCoverUrl(),
                displayAnimeStatus(entry),
                entry.getWatchedEpisodes(),
                entry.getTotalEpisodes(),
                null,
                entry.getFavorite(),
                entry.getNotes(),
                entry.getUpdatedAt(),
                null,
                null,
                null,
                List.of()
        );
    }

    private AnimeWatchStatus displayAnimeStatus(AnimeLibraryEntry entry) {
        if (entry.getStatus() != AnimeWatchStatus.WATCHING) {
            return entry.getStatus();
        }

        int watchedEpisodes = Math.max(0, entry.getWatchedEpisodes() == null ? 0 : entry.getWatchedEpisodes());
        int totalEpisodes = Math.max(0, entry.getTotalEpisodes() == null ? 0 : entry.getTotalEpisodes());

        if (watchedEpisodes <= 0) {
            return AnimeWatchStatus.PLANNED;
        }

        if (totalEpisodes > 0 && watchedEpisodes >= totalEpisodes) {
            return AnimeWatchStatus.COMPLETED;
        }

        return AnimeWatchStatus.WATCHING;
    }

    private MangaLibraryEntryResponse toMangaEntryResponse(MangaLibraryEntry entry) {
        return new MangaLibraryEntryResponse(
                entry.getId(),
                entry.getAccount().getId(),
                entry.getMangaSlug(),
                entry.getTitle(),
                entry.getCoverUrl(),
                entry.getStatus(),
                entry.getReadChapters(),
                entry.getTotalChapters(),
                Math.max(0, entry.getReadVolumes() == null ? 0 : entry.getReadVolumes()),
                Math.max(0, entry.getTotalVolumes() == null ? 0 : entry.getTotalVolumes()),
                entry.getScore(),
                entry.getFavorite(),
                entry.getNotes(),
                entry.getUpdatedAt(),
                entry.getCatalogType(),
                entry.getCatalogScore(),
                entry.getCatalogYear(),
                splitCatalogList(entry.getCatalogGenres()),
                splitCatalogList(entry.getCatalogAuthors())
        );
    }

    private List<String> splitCatalogList(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }

        return List.of(value.split("\\R"))
                .stream()
                .map(String::trim)
                .filter((item) -> !item.isBlank())
                .toList();
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private String firstNotBlank(String value, String fallback) {
        String cleaned = clean(value);
        return cleaned.isBlank() ? fallback : cleaned;
    }

    private boolean isOnline(Compte compte) {
        Instant lastActiveAt = compte.getLastActiveAt();
        return lastActiveAt != null && lastActiveAt.isAfter(Instant.now().minus(Duration.ofSeconds(60)));
    }

    private boolean hasBytes(byte[] bytes) {
        return bytes != null && bytes.length > 0;
    }
}
