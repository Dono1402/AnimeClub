package com.example.AnimaClub.services;

import com.example.AnimaClub.model.Compte;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class EmailConfirmationService {

    private static final Logger LOGGER = LoggerFactory.getLogger(EmailConfirmationService.class);

    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final String frontendUrl;
    private final String smtpHost;
    private final String from;
    private final String brandImageUrl;
    private final String passwordResetImageUrl;
    private final boolean exposeConfirmationLink;

    public EmailConfirmationService(
            ObjectProvider<JavaMailSender> mailSenderProvider,
            @Value("${app.frontend-url:http://localhost:4200}") String frontendUrl,
            @Value("${spring.mail.host:}") String smtpHost,
            @Value("${spring.mail.from:no-reply@animeclub.fr}") String from,
            @Value("${app.mail.brand-image-url:}") String brandImageUrl,
            @Value("${app.mail.password-reset-image-url:}") String passwordResetImageUrl,
            @Value("${app.email-confirmation.expose-link:false}") boolean exposeConfirmationLink
    ) {
        this.mailSenderProvider = mailSenderProvider;
        this.frontendUrl = frontendUrl;
        this.smtpHost = smtpHost;
        this.from = from;
        this.brandImageUrl = brandImageUrl;
        this.passwordResetImageUrl = passwordResetImageUrl;
        this.exposeConfirmationLink = exposeConfirmationLink;
    }

    public String buildConfirmationLink(String token) {
        return UriComponentsBuilder
                .fromUriString(frontendUrl)
                .path("/confirmation-email")
                .queryParam("token", token)
                .build()
                .toUriString();
    }

    public String buildPasswordResetLink(String token) {
        return UriComponentsBuilder
                .fromUriString(frontendUrl)
                .path("/reinitialiser-mot-de-passe")
                .queryParam("token", token)
                .build()
                .toUriString();
    }

    public String exposedLink(String confirmationLink) {
        return exposeConfirmationLink ? confirmationLink : null;
    }

    public void sendConfirmationEmail(Compte account, String confirmationLink) {
        if (!isMailConfigured()) {
            LOGGER.warn("SMTP non configure. Mail de confirmation non envoye pour le compte {}.", account.getId());
            return;
        }

        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (mailSender == null) {
            LOGGER.warn("JavaMailSender indisponible. Mail de confirmation non envoye pour le compte {}.", account.getId());
            return;
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(from);
            helper.setTo(account.getMail());
            helper.setSubject("Confirme ton compte AnimeClub");
            helper.setText(
                    confirmationPlainText(account, confirmationLink),
                    confirmationHtml(account, confirmationLink)
            );

            mailSender.send(message);
        } catch (MessagingException | RuntimeException exception) {
            LOGGER.error("Envoi du mail de confirmation impossible pour le compte {}.", account.getId(), exception);
        }
    }

    public void sendPasswordResetEmail(Compte account, String resetLink) {
        if (!isMailConfigured()) {
            LOGGER.warn("SMTP non configure. Mail de reinitialisation non envoye pour le compte {}.", account.getId());
            return;
        }

        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (mailSender == null) {
            LOGGER.warn("JavaMailSender indisponible. Mail de reinitialisation non envoye pour le compte {}.", account.getId());
            return;
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(from);
            helper.setTo(account.getMail());
            helper.setSubject("R\u00E9initialise ton mot de passe AnimeClub");
            helper.setText(
                    passwordResetPlainText(account, resetLink),
                    passwordResetHtml(account, resetLink)
            );

            mailSender.send(message);
        } catch (MessagingException | RuntimeException exception) {
            LOGGER.error("Envoi du mail de reinitialisation impossible pour le compte {}.", account.getId(), exception);
        }
    }

    private boolean isMailConfigured() {
        return smtpHost != null && !smtpHost.isBlank();
    }

    private String confirmationPlainText(Compte account, String confirmationLink) {
        return """
                Bienvenue sur AnimeClub, %s.

                Il ne reste qu'une \u00E9tape pour activer ton compte.
                Confirme ton adresse mail avec ce lien :
                %s

                Une fois ton compte confirm\u00E9, tu pourras compl\u00E9ter ton profil, ajouter des animes \u00E0 ton Animeth\u00E8que et retrouver tes favoris.

                Ce lien expire dans 24 heures. Si tu n'es pas \u00E0 l'origine de cette inscription, tu peux ignorer ce message.
                """.formatted(displayName(account), confirmationLink);
    }

    private String confirmationHtml(Compte account, String confirmationLink) {
        String escapedName = escapeHtml(displayName(account));
        String escapedLink = escapeHtml(confirmationLink);
        String imageBlock = buildImageBlock(
                brandImageUrl,
                confirmationLink,
                "Bienvenue sur AnimeClub, confirme ton compte"
        );

        return """
                <!doctype html>
                <html lang="fr">
                  <head>
                    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Confirme ton compte AnimeClub</title>
                  </head>
                  <body style="margin:0;padding:0;background:#0f0f14;color:#f7efe3;font-family:Arial,Helvetica,sans-serif;">
                    <div style="display:none;max-height:0;overflow:hidden;color:transparent;">
                      Active ton compte AnimeClub pour commencer &agrave; cr&eacute;er ton Animeth&egrave;que.
                    </div>
                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#0f0f14;margin:0;padding:32px 12px;">
                      <tr>
                        <td align="center">
                          <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#17171f;border:1px solid #2b2833;border-radius:18px;overflow:hidden;">
                            %s
                            <tr>
                              <td style="padding:34px 30px 12px 30px;">
                                <p style="margin:0 0 12px 0;color:#ffcf70;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Bienvenue sur AnimeClub</p>
                                <h1 style="margin:0;color:#fff6e7;font-size:30px;line-height:1.2;font-weight:800;">Confirme ton adresse mail</h1>
                                <p style="margin:18px 0 0 0;color:#d9d1c5;font-size:16px;line-height:1.65;">
                                  Salut %s, ton compte est presque pr&ecirc;t. Confirme ton adresse mail pour acc&eacute;der &agrave; ton profil, cr&eacute;er ton Animeth&egrave;que et garder tes favoris au m&ecirc;me endroit.
                                </p>
                              </td>
                            </tr>
                            <tr>
                              <td align="center" style="padding:22px 30px 18px 30px;">
                                <a href="%s" style="display:inline-block;background:#ff664f;color:#111015;text-decoration:none;font-size:16px;font-weight:800;padding:15px 26px;border-radius:12px;">
                                  Confirmer mon compte
                                </a>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:0 30px 28px 30px;">
                                <p style="margin:0;color:#a99f94;font-size:14px;line-height:1.6;">
                                  Ce lien expire dans 24 heures. Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :
                                </p>
                                <p style="margin:10px 0 0 0;word-break:break-all;color:#ffcf70;font-size:13px;line-height:1.5;">
                                  <a href="%s" style="color:#ffcf70;text-decoration:underline;">%s</a>
                                </p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:20px 30px 30px 30px;border-top:1px solid #2b2833;">
                                <p style="margin:0;color:#8f877d;font-size:12px;line-height:1.6;">
                                  Tu re&ccedil;ois cet email parce qu'un compte AnimeClub a &eacute;t&eacute; cr&eacute;&eacute; avec cette adresse. Si ce n'&eacute;tait pas toi, ignore simplement ce message.
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </body>
                </html>
                """.formatted(imageBlock, escapedName, escapedLink, escapedLink, escapedLink);
    }

    private String passwordResetPlainText(Compte account, String resetLink) {
        return """
                Bonjour %s.

                Une demande de r\u00E9initialisation de mot de passe a \u00E9t\u00E9 faite pour ton compte AnimeClub.
                Choisis un nouveau mot de passe avec ce lien :
                %s

                Ce lien expire automatiquement. Si tu n'es pas \u00E0 l'origine de cette demande, tu peux ignorer ce message.
                """.formatted(displayName(account), resetLink);
    }

    private String passwordResetHtml(Compte account, String resetLink) {
        String escapedName = escapeHtml(displayName(account));
        String escapedLink = escapeHtml(resetLink);
        String imageBlock = buildImageBlock(
                passwordResetImageUrl,
                resetLink,
                "AnimeClub, reinitialise ton mot de passe"
        );

        return """
                <!doctype html>
                <html lang="fr">
                  <head>
                    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>R&eacute;initialise ton mot de passe AnimeClub</title>
                  </head>
                  <body style="margin:0;padding:0;background:#0f0f14;color:#f7efe3;font-family:Arial,Helvetica,sans-serif;">
                    <div style="display:none;max-height:0;overflow:hidden;color:transparent;">
                      Choisis un nouveau mot de passe pour s&eacute;curiser ton compte AnimeClub.
                    </div>
                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#0f0f14;margin:0;padding:32px 12px;">
                      <tr>
                        <td align="center">
                          <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#17171f;border:1px solid #2b2833;border-radius:18px;overflow:hidden;">
                            %s
                            <tr>
                              <td style="padding:34px 30px 12px 30px;">
                                <p style="margin:0 0 12px 0;color:#ffcf70;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">S&eacute;curit&eacute; du compte</p>
                                <h1 style="margin:0;color:#fff6e7;font-size:30px;line-height:1.2;font-weight:800;">R&eacute;initialise ton mot de passe</h1>
                                <p style="margin:18px 0 0 0;color:#d9d1c5;font-size:16px;line-height:1.65;">
                                  Bonjour %s, nous avons re&ccedil;u une demande de r&eacute;initialisation pour ton compte AnimeClub. Utilise le bouton ci-dessous pour choisir un nouveau mot de passe.
                                </p>
                              </td>
                            </tr>
                            <tr>
                              <td align="center" style="padding:22px 30px 18px 30px;">
                                <a href="%s" style="display:inline-block;background:#ff4f9a;color:#111015;text-decoration:none;font-size:16px;font-weight:800;padding:15px 26px;border-radius:12px;">
                                  R&eacute;initialiser mon mot de passe
                                </a>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:0 30px 28px 30px;">
                                <p style="margin:0;color:#a99f94;font-size:14px;line-height:1.6;">
                                  Ce lien expire automatiquement. Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :
                                </p>
                                <p style="margin:10px 0 0 0;word-break:break-all;color:#ffcf70;font-size:13px;line-height:1.5;">
                                  <a href="%s" style="color:#ffcf70;text-decoration:underline;">%s</a>
                                </p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:20px 30px 30px 30px;border-top:1px solid #2b2833;">
                                <p style="margin:0;color:#8f877d;font-size:12px;line-height:1.6;">
                                  Si tu n'es pas &agrave; l'origine de cette demande, ignore simplement cet email. Ton mot de passe actuel reste inchang&eacute;.
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </body>
                </html>
                """.formatted(imageBlock, escapedName, escapedLink, escapedLink, escapedLink);
    }

    private String buildImageBlock(String imageUrl, String link, String altText) {
        if (imageUrl == null || imageUrl.isBlank()) {
            return "";
        }

        String escapedImageUrl = escapeHtml(imageUrl.trim());
        String escapedLink = escapeHtml(link);
        String escapedAltText = escapeHtml(altText);
        return """
                <tr>
                  <td>
                    <a href="%s" style="display:block;text-decoration:none;">
                      <img src="%s" width="640" alt="%s" style="display:block;width:100%%;max-width:640px;height:auto;border:0;">
                    </a>
                  </td>
                </tr>
                """.formatted(escapedLink, escapedImageUrl, escapedAltText);
    }

    private String displayName(Compte account) {
        if (account.getDisplayName() != null && !account.getDisplayName().isBlank()) {
            return account.getDisplayName().trim();
        }
        return account.getPseudo();
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "";
        }

        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
