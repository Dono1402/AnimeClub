package com.example.AnimaClub.services;

import com.example.AnimaClub.dto.AccountResponse;
import com.example.AnimaClub.dto.UpdatePrivacyRequest;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.repository.CompteRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
@Transactional
class CompteServiceProfileImageTests {

    @Autowired
    private CompteService compteService;

    @Autowired
    private CompteRepository compteRepository;

    @Test
    void updateProfileAcceptsValidProfilePicture() {
        Compte account = account("pic-valid");
        byte[] imageData = webpBytes();
        MockMultipartFile image = new MockMultipartFile("profilePicture", "avatar.webp", "image/webp", imageData);

        compteService.updateProfile(account.getId(), null, null, null, null, null, image, null);

        CompteService.AccountImage storedImage = compteService.profilePicture(account.getId()).orElseThrow();
        assertEquals("image/webp", storedImage.contentType());
        assertArrayEquals(imageData, storedImage.data());
    }

    @Test
    void updateProfileRejectsMismatchedProfilePictureContentType() {
        Compte account = account("pic-mismatch");
        byte[] jpegData = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00};
        MockMultipartFile image = new MockMultipartFile("profilePicture", "fake.png", "image/png", jpegData);

        assertThrows(
                IllegalArgumentException.class,
                () -> compteService.updateProfile(account.getId(), null, null, null, null, null, image, null)
        );
    }

    @Test
    void updateProfileRejectsInvalidBackgroundContent() {
        Compte account = account("bg-invalid");
        MockMultipartFile background = new MockMultipartFile(
                "background",
                "banner.gif",
                "image/gif",
                new byte[]{'n', 'o', 'p', 'e'}
        );

        assertThrows(
                IllegalArgumentException.class,
                () -> compteService.updateProfile(account.getId(), null, null, null, null, null, null, background)
        );
    }

    @Test
    void updateProfileRejectsOversizedProfilePicture() {
        Compte account = account("pic-oversize");
        byte[] imageData = new byte[(4 * 1024 * 1024) + 1];
        byte[] signature = pngBytes();
        System.arraycopy(signature, 0, imageData, 0, signature.length);
        MockMultipartFile image = new MockMultipartFile("profilePicture", "big.png", "image/png", imageData);

        assertThrows(
                IllegalArgumentException.class,
                () -> compteService.updateProfile(account.getId(), null, null, null, null, null, image, null)
        );
    }

    @Test
    void updatePrivacyCanMakeAnimeOrMangaLibrariesPrivate() {
        Compte account = account("pub-libs");
        account.setShowAnimeLibrary(false);
        account.setShowMangaLibrary(false);
        compteRepository.save(account);

        AccountResponse response = compteService.updatePrivacy(
                account.getId(),
                new UpdatePrivacyRequest(false, false, false, false, false)
        );
        Compte storedAccount = compteRepository.findById(account.getId()).orElseThrow();

        assertEquals(false, response.showAnimeLibrary());
        assertEquals(false, response.showMangaLibrary());
        assertEquals(false, storedAccount.isShowAnimeLibrary());
        assertEquals(false, storedAccount.isShowMangaLibrary());
    }

    private Compte account(String pseudo) {
        return compteRepository.save(new Compte(pseudo, pseudo + "@example.test", "{noop}password"));
    }

    private byte[] pngBytes() {
        return new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
    }

    private byte[] webpBytes() {
        return new byte[]{'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'};
    }
}
