import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal, untracked } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, tap } from 'rxjs';

import { environment } from '../../environments/environment';

export type AppLanguage = 'fr' | 'en';

type TranslationParams = Record<string, string | number>;
type TranslationDictionary = Record<string, Record<AppLanguage, string>>;

interface BackendTranslationResponse {
  translatedText?: string;
  provider?: string;
}

interface TranslationChunkResult {
  text: string;
  cacheable: boolean;
}

const LANGUAGE_KEY = 'animaclub.language';
const TRANSLATION_CACHE_KEY = 'animaclub.translationCache.backend.v2';

const DICTIONARY: TranslationDictionary = {
  'common.fr': { fr: 'Français', en: 'French' },
  'common.en': { fr: 'Anglais', en: 'English' },
  'common.loading': { fr: 'Chargement...', en: 'Loading...' },
  'common.searchAnime': { fr: 'Rechercher un anime', en: 'Search anime' },
  'common.results': { fr: '{count} résultats', en: '{count} results' },
  'common.note': { fr: 'Note', en: 'Score' },
  'common.status': { fr: 'Statut', en: 'Status' },
  'common.unrated': { fr: 'Non noté', en: 'Unrated' },
  'common.defineScore': { fr: 'Définir une note', en: 'Set a score' },
  'common.scoreOutOfTen': { fr: '{score}/10', en: '{score}/10' },
  'common.cancel': { fr: 'Annuler', en: 'Cancel' },

  'search.globalPlaceholder': { fr: 'Rechercher', en: 'Search' },
  'search.globalLabel': { fr: 'Rechercher dans le site', en: 'Search the site' },
  'search.empty': { fr: 'Aucun resultat', en: 'No result' },

  'nav.home': { fr: 'Accueil', en: 'Home' },
  'nav.animation': { fr: 'Animation', en: 'Animation' },
  'nav.animes': { fr: 'Animes', en: 'Anime' },
  'nav.library': { fr: 'Animethèque', en: 'Anime library' },
  'nav.profile': { fr: 'Profil', en: 'Profile' },
  'nav.myProfile': { fr: 'Mon profil', en: 'My profile' },
  'nav.accountSettings': { fr: 'Mon compte', en: 'My account' },
  'nav.seasonal': { fr: 'Calendrier saisonnier', en: 'Seasonal calendar' },
  'nav.manga': { fr: 'Manga', en: 'Manga' },
  'nav.mangas': { fr: 'Mangas', en: 'Manga' },
  'nav.characters': { fr: 'Personnages', en: 'Characters' },
  'nav.community': { fr: 'Communauté', en: 'Community' },
  'nav.about': { fr: 'À propos', en: 'About' },
  'nav.mangaLibrary': { fr: 'Mangathèque', en: 'Manga library' },
  'nav.following': { fr: 'Mes suivis', en: 'Following' },
  'nav.connected': { fr: 'Connecté : {pseudo}', en: 'Signed in: {pseudo}' },
  'nav.logout': { fr: 'Déconnexion', en: 'Log out' },
  'nav.signup': { fr: "S'inscrire", en: 'Sign up' },
  'nav.login': { fr: 'Se connecter', en: 'Log in' },
  'nav.language': { fr: 'Langue', en: 'Language' },

  'status.PLANNED': { fr: 'À voir', en: 'Plan to watch' },
  'status.WATCHING': { fr: 'En cours', en: 'Watching' },
  'status.COMPLETED': { fr: 'Terminé', en: 'Completed' },
  'status.PAUSED': { fr: 'En pause', en: 'Paused' },
  'status.DROPPED': { fr: 'Abandonné', en: 'Dropped' },

  'season.winter': { fr: 'Hiver', en: 'Winter' },
  'season.spring': { fr: 'Printemps', en: 'Spring' },
  'season.summer': { fr: 'Été', en: 'Summer' },
  'season.fall': { fr: 'Automne', en: 'Fall' },

  'anime.popular': { fr: 'Animes populaires', en: 'Popular anime' },
  'anime.browseSubtitle': {
    fr: 'Recherche, filtre par catégorie et ouvre la fiche complète.',
    en: 'Search, filter by category, and open the full page.',
  },
  'anime.episodesUnknown': { fr: 'Épisodes inconnus', en: 'Unknown episodes' },
  'anime.episodeCount': { fr: '{count} épisodes', en: '{count} episodes' },
  'anime.episodeTotal': { fr: '{count} épisodes au total', en: '{count} total episodes' },
  'anime.seasonCount': { fr: '{count} saisons', en: '{count} seasons' },
  'anime.sinceYear': { fr: 'depuis {year}', en: 'since {year}' },
  'anime.maximumEpisodes': { fr: 'Maximum {count}', en: 'Maximum {count}' },
  'anime.maximumLoaded': { fr: 'Maximum selon la liste chargée', en: 'Maximum based on loaded list' },
  'anime.loadingEpisodes': { fr: 'Chargement des épisodes...', en: 'Loading episodes...' },
  'anime.watchedEpisodes': { fr: 'Épisodes vus', en: 'Watched episodes' },
  'anime.lastCompletedEpisode': { fr: 'Dernier épisode terminé', en: 'Last completed episode' },
  'anime.lastCompletedEpisodeHint': {
    fr: 'Choisis le dernier épisode fini : épisode 12 = 12 épisodes vus. Maximum {count}.',
    en: 'Choose the last episode you finished: episode 12 = 12 episodes watched. Maximum {count}.',
  },
  'anime.lastCompletedEpisodeHintUnknown': {
    fr: 'Choisis le dernier épisode que tu as fini.',
    en: 'Choose the last episode you finished.',
  },
  'anime.noEpisodeWatched': { fr: 'Aucun épisode vu', en: 'No episode watched' },
  'anime.noEpisodeWatchedHint': { fr: 'Rien commencé pour le moment', en: 'Nothing started yet' },
  'anime.watchedUntilEpisode': { fr: "J'ai vu jusqu'à l'épisode {count}", en: 'Watched through episode {count}' },
  'anime.watchedUntilEpisodeSeason': {
    fr: "J'ai vu jusqu'à l'Episode {episode} - Saison {season}",
    en: 'Watched through Episode {episode} - Season {season}',
  },
  'anime.episode': { fr: 'Episode {count}', en: 'Episode {count}' },
  'anime.episodeWithTitle': { fr: 'Episode {count} - {title}', en: 'Episode {count} - {title}' },
  'anime.seasonLine': {
    fr: 'S{index} · {title} · {episodes}{seasonDate}',
    en: 'S{index} · {title} · {episodes}{seasonDate}',
  },
  'anime.add': { fr: 'Ajouter à mon Animethèque', en: 'Add to my anime library' },
  'anime.adding': { fr: 'Ajout...', en: 'Adding...' },
  'anime.viewList': { fr: 'Voir ma liste', en: 'View my list' },
  'anime.loginToAdd': { fr: 'Se connecter pour ajouter', en: 'Log in to add' },
  'anime.createAccount': { fr: 'Créer un compte', en: 'Create account' },
  'anime.selected': { fr: 'Anime sélectionné : {title}', en: 'Selected anime: {title}' },
  'anime.popularAz': { fr: 'Populaires A-Z', en: 'Popular A-Z' },
  'anime.loadMore': { fr: 'Charger plus', en: 'Load more' },
  'anime.actionAdventure': { fr: 'Action et aventure', en: 'Action and adventure' },
  'anime.allAnime': { fr: 'Tous les animes', en: 'All anime' },
  'anime.categories': { fr: 'Catégories', en: 'Categories' },
  'anime.allCategories': { fr: 'Toutes les catégories', en: 'All categories' },
  'anime.sort': { fr: 'Trier', en: 'Sort' },
  'anime.sortPopularityAsc': { fr: 'Popularité', en: 'Popularity' },
  'anime.sortTitleAsc': { fr: 'Titre A-Z', en: 'Title A-Z' },
  'anime.sortTitleDesc': { fr: 'Titre Z-A', en: 'Title Z-A' },
  'anime.sortRankAsc': { fr: 'Ranking', en: 'Ranking' },
  'anime.sortScoreDesc': { fr: 'Meilleures notes', en: 'Highest scores' },
  'anime.sortEpisodesDesc': { fr: "Nombre d'épisodes", en: 'Episode count' },
  'anime.resetFilters': { fr: 'Réinitialiser', en: 'Reset' },
  'anime.inLibrary': { fr: 'Dans ton Animethèque', en: 'In your anime library' },
  'anime.noResultsTitle': { fr: 'Aucun anime trouvé', en: 'No anime found' },
  'anime.noResultsText': { fr: 'Essaie un autre titre, genre, studio ou année.', en: 'Try another title, genre, studio, or year.' },
  'anime.added': { fr: '{title} est dans ton Animethèque.', en: '{title} is in your anime library.' },
  'anime.addError': {
    fr: 'Ajout impossible. Vérifie que tu es connecté et que le backend est lancé.',
    en: 'Unable to add. Check that you are signed in and that the backend is running.',
  },
  'anime.watchingNeedsEpisode': {
    fr: 'Choisis au moins 1 épisode vu pour passer cet anime en cours.',
    en: 'Choose at least 1 watched episode to mark this anime as watching.',
  },
  'anime.loadError': { fr: 'Impossible de charger la liste des animes.', en: 'Unable to load the anime list.' },
  'manga.sortPopularityAsc': { fr: 'Popularité', en: 'Popularity' },
  'manga.sortTitleAsc': { fr: 'Titre A-Z', en: 'Title A-Z' },
  'manga.sortTitleDesc': { fr: 'Titre Z-A', en: 'Title Z-A' },
  'manga.sortRankAsc': { fr: 'Ranking', en: 'Ranking' },
  'manga.sortScoreDesc': { fr: 'Meilleures notes', en: 'Highest scores' },
  'manga.sortVolumesDesc': { fr: 'Nombre de tomes', en: 'Volume count' },

  'library.connectedSpace': { fr: 'Espace connecté', en: 'Signed-in area' },
  'library.title': { fr: 'Mon Animethèque', en: 'My anime library' },
  'library.subtitle': {
    fr: 'Gère les animes que tu regardes, ceux que tu veux lancer, et tes favoris.',
    en: 'Manage the anime you watch, plan to start, and mark as favorites.',
  },
  'library.backCatalog': { fr: 'Retour catalogue', en: 'Back to catalog' },
  'library.search': { fr: 'Rechercher dans ma liste', en: 'Search my list' },
  'library.followed': { fr: 'Animes suivis', en: 'Tracked anime' },
  'library.watching': { fr: 'En cours', en: 'Watching' },
  'library.completed': { fr: 'Terminés', en: 'Completed' },
  'library.episodesWatched': { fr: 'Episodes vus', en: 'Episodes watched' },
  'library.progressNone': { fr: 'Aucun épisode commencé sur {total}', en: 'No episode started out of {total}' },
  'library.progressWatched': { fr: "Vu jusqu'à l'épisode {watched} sur {total}", en: 'Watched through episode {watched} of {total}' },
  'library.all': { fr: 'Tout', en: 'All' },
  'library.pause': { fr: 'Pause', en: 'Paused' },
  'library.loadingError': { fr: 'Impossible de charger ton Animethèque.', en: 'Unable to load your anime library.' },
  'library.removed': { fr: '{title} retiré de ton Animethèque.', en: '{title} removed from your anime library.' },
  'library.removeError': { fr: 'Suppression impossible.', en: 'Unable to remove.' },
  'library.updated': { fr: '{title} mis à jour.', en: '{title} updated.' },
  'library.updateError': { fr: 'Mise à jour impossible.', en: 'Unable to update.' },
  'library.favorite': { fr: 'Favori', en: 'Favorite' },
  'library.favoriteAsk': { fr: 'Favori ?', en: 'Favorite?' },
  'library.remove': { fr: 'Retirer', en: 'Remove' },
  'library.emptyTitle': { fr: 'Aucun anime ici.', en: 'No anime here.' },
  'library.emptyText': {
    fr: 'Ajoute un anime depuis le catalogue pour commencer ta liste.',
    en: 'Add an anime from the catalog to start your list.',
  },
  'library.noFilteredTitle': { fr: 'Aucun résultat avec ces filtres.', en: 'No result with these filters.' },
  'library.noFilteredText': { fr: 'Change le statut ou vide la recherche pour retrouver tes animes.', en: 'Change the status or clear search to find your anime again.' },
  'library.resetFilters': { fr: 'Réinitialiser les filtres', en: 'Reset filters' },
  'library.openCatalog': { fr: 'Ouvrir le catalogue', en: 'Open catalog' },

  'characters.animeEyebrow': { fr: 'Personnages', en: 'Characters' },
  'characters.animeTitle': { fr: 'Personnages', en: 'Characters' },
  'characters.animeSubtitle': {
    fr: 'Catalogue Jikan des personnages, avec recherche, images et fiches detaillees.',
    en: 'Jikan character catalog with search, images, and detail pages.',
  },
  'characters.search': { fr: 'Rechercher un personnage', en: 'Search character' },
  'characters.popular': { fr: 'Personnages populaires', en: 'Popular characters' },
  'characters.mainCharacters': { fr: 'Personnages principaux', en: 'Main characters' },
  'characters.allCharacters': { fr: 'Tous les personnages', en: 'All characters' },
  'characters.emptyTitle': { fr: 'Aucun personnage trouve', en: 'No character found' },
  'characters.emptyText': { fr: "Essaie un autre nom ou attends que l'import ajoute plus de donnees.", en: 'Try another name or wait for the import to add more data.' },

  'settings.eyebrow': { fr: 'Compte', en: 'Account' },
  'settings.title': { fr: 'Mon compte', en: 'My account' },
  'settings.subtitle': {
    fr: 'Gère ton profil public, ton mail et ton mot de passe.',
    en: 'Manage your public profile, email, and password.',
  },
  'settings.backProfile': { fr: 'Retour profil', en: 'Back to profile' },
  'settings.emailEyebrow': { fr: 'Connexion', en: 'Login' },
  'settings.emailTitle': { fr: 'Adresse mail', en: 'Email address' },
  'settings.currentEmail': { fr: 'Adresse actuelle :', en: 'Current address:' },
  'settings.newEmail': { fr: 'Nouvelle adresse mail', en: 'New email address' },
  'settings.currentPassword': { fr: 'Mot de passe actuel', en: 'Current password' },
  'settings.saveEmail': { fr: 'Changer le mail', en: 'Change email' },
  'settings.saving': { fr: 'Mise à jour...', en: 'Updating...' },
  'settings.emailUpdated': { fr: 'Adresse mail mise à jour.', en: 'Email address updated.' },
  'settings.emailUpdateError': { fr: 'Changement de mail impossible.', en: 'Unable to change email.' },
  'settings.passwordEyebrow': { fr: 'Sécurité', en: 'Security' },
  'settings.passwordTitle': { fr: 'Mot de passe', en: 'Password' },
  'settings.passwordDescription': {
    fr: 'Le mot de passe actuel est requis pour valider le changement.',
    en: 'Your current password is required to confirm the change.',
  },
  'settings.newPassword': { fr: 'Nouveau mot de passe', en: 'New password' },
  'settings.confirmPassword': { fr: 'Confirmer le nouveau mot de passe', en: 'Confirm new password' },
  'settings.savePassword': { fr: 'Changer le mot de passe', en: 'Change password' },
  'settings.passwordUpdated': { fr: 'Mot de passe mis à jour.', en: 'Password updated.' },
  'settings.passwordUpdateError': { fr: 'Changement de mot de passe impossible.', en: 'Unable to change password.' },
  'settings.passwordMismatch': { fr: 'Les deux nouveaux mots de passe ne correspondent pas.', en: 'The two new passwords do not match.' },

  'profile.eyebrow': { fr: 'Profil public', en: 'Public profile' },
  'profile.noStatus': { fr: 'Aucun statut défini', en: 'No status set' },
  'profile.averageScore': { fr: 'Note moyenne', en: 'Average score' },
  'profile.customization': { fr: 'Personnalisation', en: 'Customization' },
  'profile.editTitle': { fr: 'Modifier mon profil', en: 'Edit my profile' },
  'profile.picture': { fr: 'Image de profil', en: 'Profile picture' },
  'profile.pictureFormat': { fr: 'Image carrée recommandée. Maximum 4 Mo.', en: 'Square image recommended. Maximum 4 MB.' },
  'profile.background': { fr: 'Bannière', en: 'Banner' },
  'profile.backgroundFormat': { fr: 'Format large recommandé, style YouTube. Maximum 10 Mo.', en: 'Wide format recommended, YouTube style. Maximum 10 MB.' },
  'profile.cropPicture': { fr: "Recadrer l'image de profil", en: 'Crop profile picture' },
  'profile.cropBackground': { fr: 'Recadrer la bannière', en: 'Crop banner' },
  'profile.cropHint': {
    fr: "Déplace l'image directement dans le cadre, puis applique le recadrage pour l'enregistrer.",
    en: 'Move the image directly inside the frame, then apply the crop to save it.',
  },
  'profile.cropDirectHint': {
    fr: "L'image entière est affichée. Clique et glisse dedans pour placer le cadre, puis zoome si besoin.",
    en: 'The full image is displayed. Click and drag inside it to place the frame, then zoom if needed.',
  },
  'profile.cropZoom': { fr: 'Zoom', en: 'Zoom' },
  'profile.cropZoomOut': { fr: 'Dézoomer', en: 'Zoom out' },
  'profile.cropZoomIn': { fr: 'Zoomer', en: 'Zoom in' },
  'profile.cropReset': { fr: 'Réinitialiser', en: 'Reset' },
  'profile.cropApply': { fr: 'Appliquer le recadrage', en: 'Apply crop' },
  'profile.cropApplied': {
    fr: 'Recadrage appliqué.',
    en: 'Crop applied.',
  },
  'profile.change': { fr: 'Changer', en: 'Change' },
  'profile.remove': { fr: 'Retirer', en: 'Remove' },
  'profile.avatarActions': { fr: "Modifier l'avatar", en: 'Edit avatar' },
  'profile.backgroundActions': { fr: 'Modifier la bannière', en: 'Edit banner' },
  'profile.changeAvatar': { fr: "Changer l'avatar", en: 'Change avatar' },
  'profile.changeBackground': { fr: 'Changer la bannière', en: 'Change banner' },
  'profile.deleteAvatar': { fr: "Supprimer l'image de profil", en: 'Delete profile picture' },
  'profile.deleteBackground': { fr: 'Supprimer la bannière', en: 'Delete banner' },
  'profile.displayName': { fr: 'Nom affiché', en: 'Display name' },
  'profile.displayNameHelp': {
    fr: "Ce nom apparaît sur ton profil public. Ton pseudo reste l'identifiant de connexion.",
    en: 'This name appears on your public profile. Your username remains the login identifier.',
  },
  'profile.displayNameLength': { fr: 'Le nom affiché doit faire 80 caractères maximum.', en: 'Display name must be 80 characters or fewer.' },
  'profile.status': { fr: 'Statut court', en: 'Short status' },
  'profile.favoriteAnime': { fr: 'Anime favori', en: 'Favorite anime' },
  'profile.bio': { fr: 'Bio', en: 'Bio' },
  'profile.save': { fr: 'Sauvegarder', en: 'Save' },
  'profile.saving': { fr: 'Sauvegarde...', en: 'Saving...' },
  'profile.saved': { fr: 'Profil mis à jour.', en: 'Profile updated.' },
  'profile.pictureDeleted': { fr: 'Image de profil retirée.', en: 'Profile picture removed.' },
  'profile.backgroundDeleted': { fr: 'Bannière retirée.', en: 'Banner removed.' },
  'profile.pictureReady': {
    fr: 'Photo de profil prête.',
    en: 'Profile picture ready.',
  },
  'profile.backgroundReady': {
    fr: 'Bannière prête.',
    en: 'Banner ready.',
  },
  'profile.pictureChanged': { fr: 'Photo de profil changée.', en: 'Profile picture changed.' },
  'profile.backgroundChanged': { fr: 'Bannière changée.', en: 'Banner changed.' },
  'profile.imagesChanged': { fr: 'Images du profil changées.', en: 'Profile images changed.' },
  'profile.saveError': { fr: 'Sauvegarde impossible.', en: 'Unable to save.' },
  'profile.loadError': { fr: 'Impossible de charger le profil.', en: 'Unable to load the profile.' },
  'profile.imageOnly': { fr: 'Choisis un fichier image.', en: 'Choose an image file.' },
  'profile.imageSourceTooLarge': {
    fr: "L'image est trop lourde. Choisis une image de moins de 24 Mo.",
    en: 'The image is too large. Choose an image under 24 MB.',
  },
  'profile.pictureTooLarge': { fr: "L'image de profil dépasse 4 Mo.", en: 'Profile picture is larger than 4 MB.' },
  'profile.backgroundTooLarge': { fr: 'La bannière dépasse 10 Mo.', en: 'Banner is larger than 10 MB.' },
  'profile.favoriteAnimeEmpty': { fr: 'Anime favori non défini', en: 'No favorite anime set' },
  'profile.bioEmpty': { fr: 'Aucune bio pour le moment.', en: 'No bio yet.' },
  'profile.favorites': { fr: 'Favoris', en: 'Favorites' },
  'profile.favoriteList': { fr: 'Animes marqués favoris', en: 'Favorite anime' },
  'profile.noFavorites': { fr: 'Aucun favori dans ton Animethèque.', en: 'No favorite in your anime library.' },

  'auth.loginTitle': { fr: 'Connexion', en: 'Log in' },
  'auth.loginHelp': { fr: 'Accède à ton Animethèque, ton profil et tes favoris.', en: 'Access your anime library, profile, and favorites.' },
  'auth.loginProgress': { fr: 'Connexion...', en: 'Logging in...' },
  'auth.rememberSession': { fr: 'Rester connecté', en: 'Stay signed in' },
  'auth.signupTitle': { fr: "Formulaire d'inscription", en: 'Sign up form' },
  'auth.signupHelp': { fr: 'Crée ton compte pour sauvegarder ta progression.', en: 'Create your account to save your progress.' },
  'auth.signupProgress': { fr: 'Création...', en: 'Creating...' },
  'auth.noAccount': { fr: 'Pas encore de compte ?', en: 'No account yet?' },
  'auth.alreadyAccount': { fr: 'Déjà un compte ?', en: 'Already have an account?' },
  'auth.createSuccess': {
    fr: 'Compte créé pour {pseudo}. Confirme ton adresse mail avant de te connecter.',
    en: 'Account created for {pseudo}. Confirm your email address before logging in.',
  },
  'auth.createError': { fr: "Impossible de créer le compte pour l'instant.", en: 'Unable to create the account right now.' },
  'auth.loginError': { fr: 'Connexion impossible.', en: 'Unable to log in.' },
  'auth.networkError': {
    fr: 'Serveur injoignable. Verifie ta connexion ou reessaie dans quelques secondes.',
    en: 'Server unreachable. Check your connection or try again in a few seconds.',
  },
  'auth.pseudo': { fr: 'Pseudo', en: 'Username' },
  'auth.loginIdentifier': { fr: 'Pseudo ou mail', en: 'Username or email' },
  'auth.password': { fr: 'Mot de passe', en: 'Password' },
  'auth.mail': { fr: 'Mail', en: 'Email' },
  'auth.confirmPassword': { fr: 'Confirmation du mot de passe', en: 'Confirm password' },
  'auth.pseudoRequired': { fr: 'Le pseudonyme est requis.', en: 'Username is required.' },
  'auth.pseudoLength': { fr: 'Le pseudo doit faire 16 caracteres maximum.', en: 'Username must be 16 characters or less.' },
  'auth.loginIdentifierRequired': { fr: 'Le pseudo ou le mail est requis.', en: 'Username or email is required.' },
  'auth.passwordRequired': { fr: 'Le mot de passe est requis.', en: 'Password is required.' },
  'auth.mailRequired': { fr: "L'adresse mail est requise.", en: 'Email is required.' },
  'auth.mailInvalid': { fr: 'Veuillez entrer une adresse mail valide.', en: 'Enter a valid email address.' },
  'auth.passwordLength': {
    fr: 'Le mot de passe doit contenir au moins 8 caractères.',
    en: 'Password must contain at least 8 characters.',
  },
  'auth.passwordMismatch': { fr: 'Les mots de passe ne correspondent pas.', en: 'Passwords do not match.' },
  'auth.localMode': {
    fr: "Mode local : aucun SMTP n'est configuré, utilise ce lien de confirmation.",
    en: 'Local mode: no SMTP is configured, use this confirmation link.',
  },
  'auth.confirmEmail': { fr: 'Confirmer mon adresse mail', en: 'Confirm my email address' },
  'auth.goLogin': { fr: 'Aller à la connexion', en: 'Go to log in' },
  'auth.forgotPassword': { fr: 'Mot de passe oublié ?', en: 'Forgot password?' },
  'auth.forgotPasswordTitle': { fr: 'Mot de passe oublié', en: 'Forgot password' },
  'auth.forgotPasswordText': {
    fr: 'Entre ton adresse mail pour recevoir un lien de réinitialisation.',
    en: 'Enter your email address to receive a reset link.',
  },
  'auth.requestReset': { fr: 'Envoyer le lien', en: 'Send link' },
  'auth.requestResetProgress': { fr: 'Envoi...', en: 'Sending...' },
  'auth.passwordResetError': { fr: 'Réinitialisation impossible.', en: 'Unable to reset password.' },
  'auth.passwordResetLocalMode': {
    fr: 'Mode local : aucun SMTP n’est configuré, utilise ce lien.',
    en: 'Local mode: no SMTP is configured, use this link.',
  },
  'auth.openPasswordReset': { fr: 'Réinitialiser mon mot de passe', en: 'Reset my password' },
  'auth.resetPasswordTitle': { fr: 'Nouveau mot de passe', en: 'New password' },
  'auth.newPassword': { fr: 'Nouveau mot de passe', en: 'New password' },
  'auth.resetPassword': { fr: 'Mettre à jour', en: 'Update password' },
  'auth.resetPasswordProgress': { fr: 'Mise à jour...', en: 'Updating...' },
  'auth.resetPasswordInvalidLink': { fr: 'Lien de réinitialisation invalide.', en: 'Invalid reset link.' },

  'confirm.eyebrow': { fr: 'Confirmation mail', en: 'Email confirmation' },
  'confirm.confirmed': { fr: 'Adresse confirmée', en: 'Email confirmed' },
  'confirm.title': { fr: 'Confirmation', en: 'Confirmation' },
  'confirm.checking': { fr: 'Vérification du lien...', en: 'Checking link...' },
  'confirm.newAccount': { fr: 'Créer un nouveau compte', en: 'Create a new account' },
  'confirm.invalid': { fr: 'Lien de confirmation invalide.', en: 'Invalid confirmation link.' },
  'confirm.pending': { fr: 'Confirmation en cours...', en: 'Confirmation in progress...' },
  'confirm.failed': { fr: 'Confirmation impossible.', en: 'Unable to confirm.' },
};

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly http = inject(HttpClient);
  private readonly translationUrl = `${environment.apiUrl}/translation`;
  private readonly translationCache = signal<Record<string, string>>(this.readTranslationCache());

  readonly language = signal<AppLanguage>(this.readLanguage());
  readonly isFrench = computed(() => this.language() === 'fr');

  setLanguage(language: AppLanguage): void {
    localStorage.setItem(LANGUAGE_KEY, language);
    this.language.set(language);
  }

  t(key: string, params: TranslationParams = {}): string {
    const template = DICTIONARY[key]?.[this.language()] ?? DICTIONARY[key]?.fr ?? key;
    return Object.entries(params).reduce(
      (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
      template,
    );
  }

  translateText(text: string, source: AppLanguage, target: AppLanguage): Observable<string> {
    const cleanText = text.trim();
    if (!cleanText || source === target) {
      return of(text);
    }

    const cacheKey = `${source}:${target}:${cleanText}`;
    const cached = untracked(() => this.translationCache())[cacheKey];
    if (cached && this.isUsableTranslation(cached, cleanText)) {
      return of(cached);
    }

    const chunks = this.chunkText(cleanText);
    if (chunks.length === 0) {
      return of(text);
    }

    return forkJoin(chunks.map((chunk) => this.translateChunk(chunk, source, target))).pipe(
      map((results) => ({
        text: results.map((result) => result.text).join(' '),
        cacheable: results.every((result) => result.cacheable),
      })),
      tap((result) => {
        if (!result.cacheable || !this.isUsableTranslation(result.text, cleanText)) {
          return;
        }

        this.translationCache.update((cache) => {
          const updated = { ...cache, [cacheKey]: result.text };
          localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(updated));
          return updated;
        });
      }),
      map((result) => result.text),
      catchError(() => of(text)),
    );
  }

  private translateChunk(text: string, source: AppLanguage, target: AppLanguage): Observable<TranslationChunkResult> {
    return this.http.post<BackendTranslationResponse>(this.translationUrl, {
      text,
      sourceLanguage: source,
      targetLanguage: target,
    }).pipe(
      map((response) => {
        const translatedText = response.translatedText?.trim() || '';
        return {
          text: this.isUsableTranslation(translatedText, text) ? translatedText : text,
          cacheable: this.isUsableTranslation(translatedText, text),
        };
      }),
      catchError(() => of({ text, cacheable: false })),
    );
  }

  private isUsableTranslation(translatedText: string, originalText: string): boolean {
    const translated = translatedText.trim();
    if (!translated) {
      return false;
    }

    if (/mymemory warning|available free translations|quota|next available/i.test(translated)) {
      return false;
    }

    const original = originalText.trim();
    const isLongSentence = /[.!?]/.test(original) || original.split(/\s+/).length >= 5;
    if (isLongSentence && this.normalizeTranslationText(translated) === this.normalizeTranslationText(original)) {
      return false;
    }

    return true;
  }

  private normalizeTranslationText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private chunkText(text: string): string[] {
    const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) {
        continue;
      }

      if ((current + ' ' + trimmed).trim().length <= 420) {
        current = (current + ' ' + trimmed).trim();
        continue;
      }

      if (current) {
        chunks.push(current);
      }
      current = trimmed.length <= 420 ? trimmed : trimmed.slice(0, 420);
    }

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }

  private readLanguage(): AppLanguage {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    return saved === 'en' || saved === 'fr' ? saved : 'fr';
  }

  private readTranslationCache(): Record<string, string> {
    const rawValue = localStorage.getItem(TRANSLATION_CACHE_KEY);
    if (!rawValue) {
      return {};
    }

    try {
      return JSON.parse(rawValue) as Record<string, string>;
    } catch {
      localStorage.removeItem(TRANSLATION_CACHE_KEY);
      return {};
    }
  }
}
