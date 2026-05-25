import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { MenuBarComponent } from '../menu-bar/menu-bar.component';
import { LanguageService } from '../services/language.service';

type LegalPageKey = 'legal' | 'privacy' | 'terms';

interface LegalSection {
  title: string;
  body: string;
}

interface LegalPageContent {
  eyebrow: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}

interface LegalLink {
  path: string;
  label: string;
}

const CONTACT_EMAIL = 'contact@animeclub.fr';

const LEGAL_CONTENT: Record<LegalPageKey, LegalPageContent> = {
  legal: {
    eyebrow: 'Informations éditeur',
    title: 'Mentions légales',
    intro: 'Cette page présente les informations légales d’AnimeClub, plateforme communautaire de base de données anime et manga.',
    sections: [
      {
        title: 'Éditeur du site',
        body: `AnimeClub est édité pour le site animeclub.fr. Pour toute demande administrative, juridique ou relative au contenu publié sur le site, le contact de référence est ${CONTACT_EMAIL}.`,
      },
      {
        title: 'Responsable de publication',
        body: `Le responsable de publication est le propriétaire du service AnimeClub. Les demandes de correction, suppression ou signalement doivent être adressées à ${CONTACT_EMAIL}.`,
      },
      {
        title: 'Hébergement',
        body: 'Le site est hébergé sur une infrastructure OVHcloud. OVH SAS, 2 rue Kellermann, 59100 Roubaix, France, fournit les services d’hébergement, de réseau et de nom de domaine utilisés pour la mise en ligne.',
      },
      {
        title: 'Nature du service',
        body: 'AnimeClub est une plateforme de suivi, de catalogue et de profil communautaire autour des anime et manga. Le site ne propose aucun service de streaming, de lecture vidéo, de téléchargement d’œuvres protégées ou de mise à disposition de contenus audiovisuels.',
      },
      {
        title: 'Propriété intellectuelle',
        body: 'La marque AnimeClub, l’interface, les textes propres au service, les visuels de marque et les développements appartiennent à leurs titulaires respectifs. Les titres, synopsis, affiches, images, personnages, marques et œuvres référencés restent la propriété de leurs ayants droit.',
      },
      {
        title: 'Signalement',
        body: `Tout contenu manifestement illicite, abusif, portant atteinte à un droit de tiers ou affiché par erreur peut être signalé à ${CONTACT_EMAIL}. Le signalement doit contenir l’URL concernée, le motif et les éléments permettant de traiter la demande.`,
      },
    ],
  },
  privacy: {
    eyebrow: 'Données personnelles',
    title: 'Politique de confidentialité',
    intro: 'AnimeClub collecte uniquement les données nécessaires au fonctionnement des comptes, des listes personnelles, des profils publics et des échanges communautaires.',
    sections: [
      {
        title: 'Responsable du traitement',
        body: `Le responsable du traitement des données personnelles est AnimeClub. Pour exercer un droit ou poser une question sur les données, l’utilisateur peut écrire à ${CONTACT_EMAIL}.`,
      },
      {
        title: 'Données collectées',
        body: 'Les données traitées peuvent inclure le pseudo, l’adresse e-mail, le mot de passe hashé, l’état de validation e-mail, l’avatar, la bannière, la bio, le statut de profil, les préférences de confidentialité, les listes Anime/Manga, les favoris, la progression, les suivis, les abonnés, les notifications et les messages privés.',
      },
      {
        title: 'Finalités',
        body: 'Ces données servent à créer et sécuriser le compte, confirmer l’adresse e-mail, permettre la connexion, gérer l’Animethèque et la Mangathèque, afficher le profil public selon les préférences choisies, envoyer des messages privés, afficher le feed social, prévenir les abus et maintenir la sécurité du service.',
      },
      {
        title: 'Base légale',
        body: 'Le traitement repose principalement sur l’exécution du service demandé par l’utilisateur, l’intérêt légitime d’AnimeClub pour sécuriser la plateforme et respecter son bon fonctionnement, ainsi que le consentement lorsque celui-ci est requis pour des traceurs non essentiels.',
      },
      {
        title: 'Mots de passe et sécurité',
        body: 'Les mots de passe ne sont jamais stockés en clair. Ils sont hashés côté serveur. Les sessions utilisent un jeton d’authentification stocké côté navigateur et doivent être protégées par l’utilisateur sur ses appareils personnels.',
      },
      {
        title: 'Messages privés',
        body: 'Les messages privés ne sont pas publics. Ils sont accessibles uniquement aux comptes autorisés par les règles sociales du site et aux traitements techniques strictement nécessaires à la sécurité, au support ou au respect d’une obligation légale.',
      },
      {
        title: 'Visibilité du profil',
        body: 'L’utilisateur peut configurer la visibilité de certaines informations de profil, de ses abonnés, de ses suivis, de son Animethèque et de sa Mangathèque lorsque ces options sont disponibles dans le compte.',
      },
      {
        title: 'Destinataires',
        body: 'Les données sont destinées au service AnimeClub et à ses prestataires techniques nécessaires, notamment l’hébergeur, la base de données, le service e-mail transactionnel et les outils de supervision. AnimeClub ne vend pas les données personnelles.',
      },
      {
        title: 'Durée de conservation',
        body: 'Les données du compte sont conservées tant que le compte existe. Les jetons de confirmation e-mail et de réinitialisation de mot de passe expirent automatiquement. Les journaux techniques sont conservés pour une durée limitée nécessaire à la sécurité et au diagnostic.',
      },
      {
        title: 'Droits utilisateur',
        body: `L’utilisateur peut demander l’accès, la correction, l’export ou la suppression de ses données en écrivant à ${CONTACT_EMAIL}. Une vérification d’identité peut être demandée avant traitement de la demande.`,
      },
      {
        title: 'Cookies et traceurs',
        body: 'AnimeClub peut utiliser des stockages strictement nécessaires à la session, à la sécurité et aux préférences utilisateur. Aucun traceur publicitaire ou analytics non essentiel ne doit être activé sans information claire et consentement préalable lorsque la loi l’exige.',
      },
      {
        title: 'Discord',
        body: 'Si l’utilisateur choisit la connexion Discord, AnimeClub reçoit l’adresse e-mail vérifiée transmise par Discord, le nom public et les informations strictement nécessaires à l’authentification. Un nouveau compte créé via Discord doit définir un mot de passe AnimeClub et confirmer son adresse e-mail. La connexion Discord repose ensuite sur la correspondance entre l’adresse e-mail Discord vérifiée et l’adresse e-mail du compte AnimeClub.',
      },
    ],
  },
  terms: {
    eyebrow: 'Règles du service',
    title: 'Conditions d’utilisation',
    intro: 'Ces conditions encadrent l’utilisation d’AnimeClub comme plateforme communautaire de catalogue, de suivi anime/manga et de profil social.',
    sections: [
      {
        title: 'Acceptation',
        body: 'En créant un compte ou en utilisant AnimeClub, l’utilisateur accepte les présentes conditions d’utilisation et la politique de confidentialité. Si l’utilisateur refuse ces conditions, il ne doit pas créer de compte.',
      },
      {
        title: 'Objet du service',
        body: 'AnimeClub permet de consulter des fiches anime/manga, gérer une Animethèque et une Mangathèque, suivre une progression, marquer des favoris, consulter des profils publics, suivre d’autres utilisateurs et échanger des messages selon les règles du site.',
      },
      {
        title: 'Absence de streaming',
        body: 'AnimeClub n’est pas une plateforme de streaming. Le service ne permet pas de regarder, lire, télécharger ou lancer des épisodes, films, scans ou œuvres protégées. Les boutons et contenus doivent rester orientés fiche, suivi et gestion de liste.',
      },
      {
        title: 'Compte utilisateur',
        body: 'L’utilisateur doit fournir des informations exactes, garder ses identifiants confidentiels et ne pas utiliser le compte d’un tiers. Une adresse e-mail valide peut être requise pour activer le compte et récupérer l’accès.',
      },
      {
        title: 'Connexion Discord',
        body: 'La connexion Discord est optionnelle. Elle sert uniquement à faciliter la création ou la connexion au compte AnimeClub. Un nouveau compte Discord doit définir un mot de passe AnimeClub et confirmer son e-mail avant de pouvoir se connecter normalement. Si l’adresse e-mail AnimeClub change, la connexion Discord ne correspondra plus au compte tant que l’adresse e-mail Discord vérifiée ne sera pas la même.',
      },
      {
        title: 'Comportements interdits',
        body: 'Sont interdits : usurpation d’identité, harcèlement, spam, contenus haineux, contenus sexuels explicites, menaces, collecte abusive de données, tentative d’accès non autorisé, contournement des protections, injection de code et utilisation du service pour diffuser des contenus illicites.',
      },
      {
        title: 'Contenus publiés',
        body: 'L’utilisateur reste responsable de ses bios, statuts, images de profil, messages privés et autres contenus envoyés. AnimeClub peut retirer ou masquer un contenu manifestement abusif, illicite ou contraire aux présentes conditions.',
      },
      {
        title: 'Messagerie et suivis',
        body: 'Les fonctions sociales doivent être utilisées de manière respectueuse. Les messages privés ne doivent pas servir à harceler, spammer, menacer ou contourner les règles de modération. AnimeClub peut limiter l’accès aux messages en cas d’abus.',
      },
      {
        title: 'Disponibilité',
        body: 'AnimeClub est fourni en l’état. Des interruptions peuvent survenir pour maintenance, incident, déploiement, sauvegarde ou évolution technique. AnimeClub ne garantit pas une disponibilité permanente.',
      },
      {
        title: 'Données externes',
        body: 'Certaines informations de catalogue peuvent provenir d’API ou de sources tierces. AnimeClub fait ses meilleurs efforts pour afficher des données cohérentes, mais ne garantit pas l’exactitude permanente des titres, images, scores, synopsis, épisodes ou métadonnées.',
      },
      {
        title: 'Suppression du compte',
        body: `L’utilisateur peut demander la suppression de son compte et des données associées en écrivant à ${CONTACT_EMAIL}. Certaines données peuvent être conservées temporairement lorsqu’une obligation légale, une preuve de sécurité ou un traitement technique l’impose.`,
      },
      {
        title: 'Évolution des conditions',
        body: 'AnimeClub peut modifier ces conditions pour tenir compte des évolutions du service, de la sécurité ou de la loi. En cas de changement important, une information visible sera publiée sur le site ou envoyée par e-mail lorsque cela est pertinent.',
      },
    ],
  },
};

const LEGAL_CONTENT_EN: Record<LegalPageKey, LegalPageContent> = {
  legal: {
    eyebrow: 'Publisher information',
    title: 'Legal notice',
    intro: 'This page provides the legal information for AnimeClub, a community anime and manga database platform.',
    sections: [
      {
        title: 'Website publisher',
        body: `AnimeClub is published for the animeclub.fr website. For any administrative, legal, or content-related request, the reference contact is ${CONTACT_EMAIL}.`,
      },
      {
        title: 'Publication manager',
        body: `The publication manager is the owner of the AnimeClub service. Requests for correction, removal, or reporting must be sent to ${CONTACT_EMAIL}.`,
      },
      {
        title: 'Hosting',
        body: 'The website is hosted on OVHcloud infrastructure. OVH SAS, 2 rue Kellermann, 59100 Roubaix, France, provides the hosting, network, and domain name services used to publish the website.',
      },
      {
        title: 'Nature of the service',
        body: 'AnimeClub is a tracking, catalog, and community profile platform for anime and manga. The website does not provide streaming, video playback, downloading of protected works, or audiovisual content distribution.',
      },
      {
        title: 'Intellectual property',
        body: 'The AnimeClub brand, interface, service-specific text, brand visuals, and developments belong to their respective owners. Referenced titles, synopses, posters, images, characters, brands, and works remain the property of their rights holders.',
      },
      {
        title: 'Reports',
        body: `Any manifestly unlawful, abusive, rights-infringing, or incorrectly displayed content can be reported to ${CONTACT_EMAIL}. The report should include the relevant URL, the reason, and the information required to process the request.`,
      },
    ],
  },
  privacy: {
    eyebrow: 'Personal data',
    title: 'Privacy policy',
    intro: 'AnimeClub only collects the data required for accounts, personal lists, public profiles, and community exchanges to function.',
    sections: [
      {
        title: 'Data controller',
        body: `The personal data controller is AnimeClub. To exercise a right or ask a question about data, users can write to ${CONTACT_EMAIL}.`,
      },
      {
        title: 'Data collected',
        body: 'Processed data may include username, email address, hashed password, email validation status, avatar, banner, bio, profile status, privacy preferences, anime and manga lists, favorites, progress, following, followers, notifications, and private messages.',
      },
      {
        title: 'Purposes',
        body: 'This data is used to create and secure accounts, confirm email addresses, allow login, manage the Animethèque and Mangathèque, display public profiles according to chosen preferences, send private messages, display the social feed, prevent abuse, and maintain service security.',
      },
      {
        title: 'Legal basis',
        body: 'Processing is mainly based on performance of the service requested by the user, AnimeClub’s legitimate interest in securing the platform and maintaining proper operation, and consent when required for non-essential trackers.',
      },
      {
        title: 'Passwords and security',
        body: 'Passwords are never stored in plain text. They are hashed server-side. Sessions use an authentication token stored in the browser and must be protected by users on their personal devices.',
      },
      {
        title: 'Private messages',
        body: 'Private messages are not public. They are only accessible to accounts authorized by the site’s social rules and to technical processing strictly required for security, support, or legal obligations.',
      },
      {
        title: 'Profile visibility',
        body: 'Users can configure the visibility of certain profile information, followers, following, Animethèque, and Mangathèque when these options are available in the account settings.',
      },
      {
        title: 'Recipients',
        body: 'Data is intended for AnimeClub and the necessary technical providers, including hosting, database, transactional email, and monitoring services. AnimeClub does not sell personal data.',
      },
      {
        title: 'Retention period',
        body: 'Account data is retained for as long as the account exists. Email confirmation and password reset tokens expire automatically. Technical logs are retained for a limited period required for security and diagnostics.',
      },
      {
        title: 'User rights',
        body: `Users may request access, correction, export, or deletion of their data by writing to ${CONTACT_EMAIL}. Identity verification may be requested before the request is processed.`,
      },
      {
        title: 'Cookies and trackers',
        body: 'AnimeClub may use storage that is strictly necessary for sessions, security, and user preferences. No non-essential advertising or analytics tracker should be enabled without clear information and prior consent when required by law.',
      },
      {
        title: 'Discord',
        body: 'If a user chooses Discord login, AnimeClub receives the verified email address sent by Discord, the public name, and the data strictly required for authentication. A new account created through Discord must still define an AnimeClub password and confirm its email address. Discord login then relies on the verified Discord email matching the AnimeClub account email.',
      },
    ],
  },
  terms: {
    eyebrow: 'Service rules',
    title: 'Terms of use',
    intro: 'These terms govern the use of AnimeClub as a community catalog, anime/manga tracking, and social profile platform.',
    sections: [
      {
        title: 'Acceptance',
        body: 'By creating an account or using AnimeClub, the user accepts these terms of use and the privacy policy. If the user refuses these terms, they must not create an account.',
      },
      {
        title: 'Purpose of the service',
        body: 'AnimeClub allows users to view anime and manga pages, manage an Animethèque and a Mangathèque, track progress, mark favorites, view public profiles, follow other users, and exchange messages according to the site rules.',
      },
      {
        title: 'No streaming',
        body: 'AnimeClub is not a streaming platform. The service does not allow users to watch, read, download, or launch episodes, films, scans, or protected works. Buttons and content must remain focused on pages, tracking, and list management.',
      },
      {
        title: 'User account',
        body: 'The user must provide accurate information, keep their credentials confidential, and not use another person’s account. A valid email address may be required to activate the account and recover access.',
      },
      {
        title: 'Discord login',
        body: 'Discord login is optional. It is only used to make AnimeClub account creation or login easier. A new Discord-based account must define an AnimeClub password and confirm its email address before normal login. If the AnimeClub email address changes, Discord login will no longer match the account until the verified Discord email is the same.',
      },
      {
        title: 'Prohibited behavior',
        body: 'The following are prohibited: impersonation, harassment, spam, hateful content, explicit sexual content, threats, abusive data collection, unauthorized access attempts, bypassing protections, code injection, and using the service to distribute illegal content.',
      },
      {
        title: 'Published content',
        body: 'The user remains responsible for their bios, statuses, profile images, private messages, and other submitted content. AnimeClub may remove or hide content that is manifestly abusive, unlawful, or contrary to these terms.',
      },
      {
        title: 'Messaging and following',
        body: 'Social features must be used respectfully. Private messages must not be used for harassment, spam, threats, or bypassing moderation rules. AnimeClub may limit access to messages in case of abuse.',
      },
      {
        title: 'Availability',
        body: 'AnimeClub is provided as is. Interruptions may occur for maintenance, incidents, deployments, backups, or technical changes. AnimeClub does not guarantee permanent availability.',
      },
      {
        title: 'External data',
        body: 'Some catalog information may come from APIs or third-party sources. AnimeClub makes its best efforts to display consistent data, but does not guarantee the permanent accuracy of titles, images, scores, synopses, episodes, or metadata.',
      },
      {
        title: 'Account deletion',
        body: `Users may request deletion of their account and associated data by writing to ${CONTACT_EMAIL}. Some data may be kept temporarily when required by a legal obligation, security evidence, or technical processing.`,
      },
      {
        title: 'Changes to the terms',
        body: 'AnimeClub may modify these terms to reflect changes to the service, security, or the law. In case of a significant change, visible information will be published on the site or sent by email when relevant.',
      },
    ],
  },
};

const LEGAL_LINKS: Record<'fr' | 'en', LegalLink[]> = {
  fr: [
    { path: '/legal-notice', label: 'Mentions légales' },
    { path: '/privacy-policy', label: 'Confidentialité' },
    { path: '/terms', label: 'Conditions d’utilisation' },
  ],
  en: [
    { path: '/legal-notice', label: 'Legal notice' },
    { path: '/privacy-policy', label: 'Privacy' },
    { path: '/terms', label: 'Terms of use' },
  ],
};

const LEGAL_NAV_LABEL: Record<'fr' | 'en', string> = {
  fr: 'Pages légales',
  en: 'Legal pages',
};

@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [RouterLink, MenuBarComponent],
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.scss',
})
export class LegalPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly languageService = inject(LanguageService);
  private readonly pageKey = toSignal(
    this.route.data.pipe(map((data) => (data['legalPage'] as LegalPageKey | undefined) ?? 'legal')),
    { initialValue: 'legal' as LegalPageKey },
  );

  readonly language = computed(() => this.languageService.language());
  readonly content = computed(() => (this.language() === 'en' ? LEGAL_CONTENT_EN : LEGAL_CONTENT)[this.pageKey()]);
  readonly legalLinks = computed(() => LEGAL_LINKS[this.language()]);
  readonly legalNavLabel = computed(() => LEGAL_NAV_LABEL[this.language()]);
}
