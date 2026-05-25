package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.AccountMessageResponse;
import com.example.AnimaClub.model.AccountFollow;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.repository.AccountFollowRepository;
import com.example.AnimaClub.repository.CompteRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Transactional
class MessagingServiceTests {

    @Autowired
    private MessagingService messagingService;

    @Autowired
    private CompteRepository compteRepository;

    @Autowired
    private AccountFollowRepository accountFollowRepository;

    @Test
    void sendImageAcceptsValidPng() {
        Participants participants = mutualFriends("msg-valid-a", "msg-valid-b");
        byte[] imageData = pngBytes();
        MockMultipartFile image = new MockMultipartFile("image", "avatar.png", "image/png", imageData);

        AccountMessageResponse response = messagingService.send(
                participants.sender().getId(),
                participants.recipient().getId(),
                "",
                image
        );

        MessagingService.MessageImage storedImage = messagingService
                .messageImage(participants.sender().getId(), response.id())
                .orElseThrow();
        assertEquals("image/png", storedImage.contentType());
        assertArrayEquals(imageData, storedImage.data());
    }

    @Test
    void sendImageRejectsMismatchedContentType() {
        Participants participants = mutualFriends("msg-mismatch-a", "msg-mismatch-b");
        byte[] jpegData = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00};
        MockMultipartFile image = new MockMultipartFile("image", "fake.png", "image/png", jpegData);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> messagingService.send(participants.sender().getId(), participants.recipient().getId(), "", image)
        );

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    void sendImageRejectsInvalidImageContent() {
        Participants participants = mutualFriends("msg-invalid-a", "msg-invalid-b");
        MockMultipartFile image = new MockMultipartFile(
                "image",
                "fake.gif",
                "image/gif",
                "not an image".getBytes(StandardCharsets.US_ASCII)
        );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> messagingService.send(participants.sender().getId(), participants.recipient().getId(), "", image)
        );

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    void sendImageRejectsOversizedImage() {
        Participants participants = mutualFriends("msg-oversize-a", "msg-oversize-b");
        byte[] imageData = new byte[(10 * 1024 * 1024) + 1];
        byte[] signature = pngBytes();
        System.arraycopy(signature, 0, imageData, 0, signature.length);
        MockMultipartFile image = new MockMultipartFile("image", "big.png", "image/png", imageData);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> messagingService.send(participants.sender().getId(), participants.recipient().getId(), "", image)
        );

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    void sendMultipartRejectsEmptyMessageWithoutImage() {
        Participants participants = mutualFriends("msg-empty-a", "msg-empty-b");

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> messagingService.send(participants.sender().getId(), participants.recipient().getId(), " ", null)
        );

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    private Participants mutualFriends(String senderPseudo, String recipientPseudo) {
        Compte sender = compteRepository.save(new Compte(
                senderPseudo,
                senderPseudo + "@example.test",
                "{noop}password"
        ));
        Compte recipient = compteRepository.save(new Compte(
                recipientPseudo,
                recipientPseudo + "@example.test",
                "{noop}password"
        ));
        accountFollowRepository.save(new AccountFollow(sender, recipient));
        accountFollowRepository.save(new AccountFollow(recipient, sender));
        assertTrue(accountFollowRepository.existsByFollower_IdAndFollowed_Id(sender.getId(), recipient.getId()));
        assertTrue(accountFollowRepository.existsByFollower_IdAndFollowed_Id(recipient.getId(), sender.getId()));
        return new Participants(sender, recipient);
    }

    private byte[] pngBytes() {
        return new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
    }

    private record Participants(Compte sender, Compte recipient) {
    }
}
