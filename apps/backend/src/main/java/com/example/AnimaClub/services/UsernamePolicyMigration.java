package com.example.AnimaClub.services;

import com.example.AnimaClub.model.AccountNotification;
import com.example.AnimaClub.model.Compte;
import com.example.AnimaClub.repository.AccountNotificationRepository;
import com.example.AnimaClub.repository.CompteRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class UsernamePolicyMigration implements ApplicationRunner {

    private static final int PSEUDO_MAX_LENGTH = 16;

    private final CompteRepository compteRepository;
    private final AccountNotificationRepository notificationRepository;

    public UsernamePolicyMigration(
            CompteRepository compteRepository,
            AccountNotificationRepository notificationRepository
    ) {
        this.compteRepository = compteRepository;
        this.notificationRepository = notificationRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        compteRepository.findAll().forEach((account) -> {
            String pseudo = account.getPseudo();
            if (pseudo != null && pseudo.length() > PSEUDO_MAX_LENGTH) {
                account.setLegacyPseudo(pseudo);
                account.setPseudo(temporaryPseudo(account));
                account.setUsernameChangeRequired(true);
            }

            if (account.isUsernameChangeRequired()
                    && !notificationRepository.existsByRecipient_IdAndType(
                            account.getId(),
                            AccountNotification.TYPE_USERNAME_CHANGE_REQUIRED
                    )) {
                notificationRepository.save(new AccountNotification(
                        account,
                        account,
                        AccountNotification.TYPE_USERNAME_CHANGE_REQUIRED
                ));
            }
        });
    }

    private String temporaryPseudo(Compte account) {
        String base = "temp" + account.getId();
        String candidate = trim(base);
        int suffix = 1;

        while (compteRepository.existsByPseudoIgnoreCase(candidate)) {
            String suffixText = String.valueOf(suffix);
            candidate = trim(base, suffixText.length()) + suffixText;
            suffix++;
        }

        return candidate;
    }

    private String trim(String value) {
        return trim(value, 0);
    }

    private String trim(String value, int reservedLength) {
        int maxLength = Math.max(1, PSEUDO_MAX_LENGTH - reservedLength);
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }
}
