package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.AccountMessageResponse;
import com.example.AnimaClub.dto.MessageConversationResponse;
import com.example.AnimaClub.dto.PublicProfileResponse;
import com.example.AnimaClub.dto.SendMessageRequest;
import com.example.AnimaClub.model.AccountMessage;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.repository.AccountFollowRepository;
import com.example.AnimaClub.repository.AccountMessageRepository;
import com.example.AnimaClub.repository.CompteRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class MessagingService {

    private static final int MESSAGE_MAX_LENGTH = 1000;
    private static final long MESSAGE_IMAGE_MAX_BYTES = 10L * 1024L * 1024L;
    private static final Duration TYPING_TTL = Duration.ofSeconds(5);
    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of(
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
    );

    public record MessageImage(byte[] data, String contentType) {
    }

    private record TypingKey(Integer accountId, Integer friendId) {
    }

    private final AccountFollowRepository accountFollowRepository;
    private final AccountMessageRepository accountMessageRepository;
    private final CompteRepository compteRepository;
    private final Map<TypingKey, Instant> typingExpirations = new ConcurrentHashMap<>();

    public MessagingService(
            AccountFollowRepository accountFollowRepository,
            AccountMessageRepository accountMessageRepository,
            CompteRepository compteRepository
    ) {
        this.accountFollowRepository = accountFollowRepository;
        this.accountMessageRepository = accountMessageRepository;
        this.compteRepository = compteRepository;
    }

    @Transactional(readOnly = true)
    public List<PublicProfileResponse> friends(Integer accountId) {
        account(accountId);
        return accountFollowRepository.findMutualFriends(accountId)
                .stream()
                .map(this::toPublicProfile)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<MessageConversationResponse> conversations(Integer accountId) {
        account(accountId);
        return accountFollowRepository.findMutualFriends(accountId)
                .stream()
                .map((friend) -> toConversation(accountId, friend))
                .sorted(Comparator
                        .comparing((MessageConversationResponse conversation) -> conversation.lastMessage() == null
                                ? null
                                : conversation.lastMessage().createdAt(), Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing((conversation) -> conversation.friend().displayName(), String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    @Transactional
    public List<AccountMessageResponse> conversation(Integer accountId, Integer friendId) {
        assertMutualFriend(accountId, friendId);

        accountMessageRepository.findBySender_IdAndRecipient_IdAndReadAtIsNull(friendId, accountId)
                .forEach(AccountMessage::markRead);

        return accountMessageRepository.findConversation(accountId, friendId)
                .stream()
                .map((message) -> toMessageResponse(message, accountId))
                .toList();
    }

    @Transactional
    public AccountMessageResponse send(Integer accountId, Integer friendId, SendMessageRequest request) {
        Compte sender = account(accountId);
        Compte recipient = account(friendId);
        assertMutualFriend(sender.getId(), recipient.getId());

        String content = request == null ? "" : clean(request.content());
        if (content.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le message est vide.");
        }

        if (content.length() > MESSAGE_MAX_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le message depasse 1000 caracteres.");
        }

        AccountMessage message = accountMessageRepository.save(new AccountMessage(sender, recipient, content));
        typingExpirations.remove(new TypingKey(accountId, friendId));
        return toMessageResponse(message, accountId);
    }

    @Transactional
    public AccountMessageResponse send(Integer accountId, Integer friendId, String content, MultipartFile image) {
        Compte sender = account(accountId);
        Compte recipient = account(friendId);
        assertMutualFriend(sender.getId(), recipient.getId());

        String cleanedContent = clean(content);
        boolean hasImage = image != null && !image.isEmpty();
        if (cleanedContent.isBlank() && !hasImage) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le message est vide.");
        }

        if (cleanedContent.length() > MESSAGE_MAX_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le message depasse 1000 caracteres.");
        }

        byte[] imageData = null;
        String imageContentType = null;
        if (hasImage) {
            String declaredImageContentType = validateImageMetadata(image);
            imageData = readBytes(image);
            imageContentType = validateImageData(imageData, declaredImageContentType);
        }

        AccountMessage message = accountMessageRepository.save(
                new AccountMessage(sender, recipient, cleanedContent, imageData, imageContentType)
        );
        typingExpirations.remove(new TypingKey(accountId, friendId));
        return toMessageResponse(message, accountId);
    }

    @Transactional
    public void markTyping(Integer accountId, Integer friendId) {
        assertMutualFriend(accountId, friendId);
        account(accountId).markActive();
        typingExpirations.put(new TypingKey(accountId, friendId), Instant.now().plus(TYPING_TTL));
    }

    @Transactional(readOnly = true)
    public Optional<MessageImage> messageImage(Integer accountId, Integer messageId) {
        account(accountId);
        return accountMessageRepository.findById(messageId)
                .filter((message) -> isParticipant(message, accountId))
                .filter(AccountMessage::hasImage)
                .map((message) -> new MessageImage(
                        message.getImageData(),
                        firstNotBlank(message.getImageContentType(), "image/jpeg")
                ));
    }

    private MessageConversationResponse toConversation(Integer accountId, Compte friend) {
        AccountMessageResponse lastMessage = accountMessageRepository
                .findLatestConversationMessage(accountId, friend.getId(), PageRequest.of(0, 1))
                .stream()
                .findFirst()
                .map((message) -> toMessageResponse(message, accountId))
                .orElse(null);

        return new MessageConversationResponse(
                friend.getId(),
                toPublicProfile(friend),
                lastMessage,
                accountMessageRepository.countBySender_IdAndRecipient_IdAndReadAtIsNull(friend.getId(), accountId),
                isTyping(friend.getId(), accountId)
        );
    }

    private void assertMutualFriend(Integer accountId, Integer friendId) {
        if (accountId.equals(friendId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tu ne peux pas t'envoyer de message a toi-meme.");
        }

        account(accountId);
        account(friendId);
        boolean mutualFollow = accountFollowRepository.existsByFollower_IdAndFollowed_Id(accountId, friendId)
                && accountFollowRepository.existsByFollower_IdAndFollowed_Id(friendId, accountId);
        if (!mutualFollow) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Messagerie reservee aux amis : vous devez vous suivre mutuellement."
            );
        }
    }

    private AccountMessageResponse toMessageResponse(AccountMessage message, Integer accountId) {
        return new AccountMessageResponse(
                message.getId(),
                toPublicProfile(message.getSender()),
                toPublicProfile(message.getRecipient()),
                message.getSender().getId().equals(accountId),
                message.getContent(),
                message.hasImage() ? "/account/%d/messages/%d/image".formatted(accountId, message.getId()) : null,
                message.isRead(),
                message.getCreatedAt()
        );
    }

    private boolean isParticipant(AccountMessage message, Integer accountId) {
        return message.getSender().getId().equals(accountId) || message.getRecipient().getId().equals(accountId);
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

    private Compte account(Integer accountId) {
        return compteRepository.findById(accountId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Compte introuvable."));
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

    private boolean isTyping(Integer accountId, Integer friendId) {
        TypingKey key = new TypingKey(accountId, friendId);
        Instant expiresAt = typingExpirations.get(key);
        if (expiresAt == null) {
            return false;
        }

        if (expiresAt.isBefore(Instant.now())) {
            typingExpirations.remove(key, expiresAt);
            return false;
        }

        return true;
    }

    private boolean hasBytes(byte[] bytes) {
        return bytes != null && bytes.length > 0;
    }

    private String validateImageMetadata(MultipartFile file) {
        String contentType = normalizeContentType(file.getContentType());
        if (!ALLOWED_IMAGE_TYPES.contains(contentType)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Le fichier doit etre une image JPG, PNG, WebP ou GIF."
            );
        }

        if (file.getSize() <= 0 || file.getSize() > MESSAGE_IMAGE_MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "L'image ne doit pas depasser 10 Mo.");
        }

        return contentType;
    }

    private byte[] readBytes(MultipartFile file) {
        try {
            byte[] data = file.getBytes();
            if (data.length == 0 || data.length > MESSAGE_IMAGE_MAX_BYTES) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "L'image ne doit pas depasser 10 Mo.");
            }
            return data;
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lecture de l'image impossible.");
        }
    }

    private String validateImageData(byte[] data, String declaredContentType) {
        String detectedContentType = detectImageContentType(data)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Le contenu du fichier image est invalide."
                ));

        if (!detectedContentType.equals(declaredContentType)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Le type de fichier ne correspond pas au contenu de l'image."
            );
        }

        return detectedContentType;
    }

    private Optional<String> detectImageContentType(byte[] data) {
        if (startsWith(data, 0xFF, 0xD8, 0xFF)) {
            return Optional.of("image/jpeg");
        }

        if (startsWith(data, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) {
            return Optional.of("image/png");
        }

        if (startsWithAscii(data, 0, "GIF87a") || startsWithAscii(data, 0, "GIF89a")) {
            return Optional.of("image/gif");
        }

        if (startsWithAscii(data, 0, "RIFF") && startsWithAscii(data, 8, "WEBP")) {
            return Optional.of("image/webp");
        }

        return Optional.empty();
    }

    private String normalizeContentType(String contentType) {
        return contentType == null ? "" : contentType.trim().toLowerCase(Locale.ROOT);
    }

    private boolean startsWith(byte[] data, int... expected) {
        if (data.length < expected.length) {
            return false;
        }

        for (int index = 0; index < expected.length; index++) {
            if ((data[index] & 0xFF) != expected[index]) {
                return false;
            }
        }

        return true;
    }

    private boolean startsWithAscii(byte[] data, int offset, String expected) {
        if (data.length < offset + expected.length()) {
            return false;
        }

        for (int index = 0; index < expected.length(); index++) {
            if (data[offset + index] != (byte) expected.charAt(index)) {
                return false;
            }
        }

        return true;
    }
}
