import { Injectable, NgZone, effect, inject } from '@angular/core';

import { LanguageService } from './language.service';

const TEXT_TRANSLATIONS: Record<string, string> = {
  'Nouvelles sorties': 'New releases',
  'AnimeClub accueil': 'AnimeClub home',
  'Nouvelle sortie simulcast': 'New simulcast release',
  'Bienvenue dans le chaos': 'Welcome to chaos',
  'La nuit commence vraiment': 'The night truly begins',
  "Monstres géants, unité d'élite": 'Giant monsters, elite unit',
  'La baston comme langage': 'Fighting as a language',
  'La sélection des attaquants': 'The strikers selection',
  "L'envers brutal des idoles": 'The brutal side of idols',
  "Momo croit aux fantômes, Okarun croit aux extraterrestres. Leur pari déclenche une série d'affrontements surnaturels où l'humour, l'horreur et l'action se mélangent sans respirer.":
    'Momo believes in ghosts, Okarun believes in aliens. Their bet triggers a string of supernatural clashes where humor, horror, and action collide at full speed.',
  "Amnésique et transformé par magie, Caiman traque les sorciers avec Nikaido pour comprendre qui lui a volé son visage. Sale, violent, étrange et impossible à confondre.":
    'Amnesiac and magically transformed, Caiman hunts sorcerers with Nikaido to discover who stole his face. Dirty, violent, strange, and impossible to mistake.',
  'Ko Yamori erre dans les rues pour fuir son quotidien et croise Nazuna, une vampire libre et imprévisible. Pour devenir comme elle, il devra comprendre ce que signifie tomber amoureux.':
    'Ko Yamori wanders the streets to escape his daily life and meets Nazuna, a free and unpredictable vampire. To become like her, he must understand what falling in love means.',
  "Kafka Hibino rêve de rejoindre les forces anti-kaiju. Après un incident impossible, il obtient une puissance monstrueuse qui pourrait faire de lui l'arme la plus dangereuse du front.":
    'Kafka Hibino dreams of joining the anti-kaiju forces. After an impossible incident, he gains monstrous power that could make him the most dangerous weapon on the front line.',
  'Haruka débarque dans un lycée réputé pour ses combattants. Il cherche le sommet, mais découvre une bande qui protège son quartier avec les poings et un code bien à elle.':
    'Haruka arrives at a high school known for its fighters. He aims for the top, but discovers a crew that protects its neighborhood with fists and its own code.',
  "Trois cents joueurs sont enfermés dans un centre d'entraînement brutal pour créer l'attaquant ultime. Ici, l'ego compte autant que le talent.":
    'Three hundred players are locked in a brutal training center to create the ultimate striker. Here, ego matters as much as talent.',
  "Derrière les lumières de la scène, l'industrie du divertissement cache mensonges, pression et vengeance. Une série brillante, sombre et très addictive.":
    'Behind the stage lights, the entertainment industry hides lies, pressure, and revenge. A brilliant, dark, and highly addictive series.',
  'Baston': 'Brawls',
  'Drame': 'Drama',
  'Disponibilités': 'Availability',
  'Voir la fiche': 'View details',
  'Anime précédent': 'Previous anime',
  'Anime suivant': 'Next anime',
  'Afficher': 'Show',
  'Tableau de bord AnimeClub': 'AnimeClub dashboard',
  'Mettre à jour votre Animethèque': 'Update your anime library',
  'Tout voir': 'View all',
  'Chargement de votre progression...': 'Loading your progress...',
  'Aucun anime en cours pour le moment.': 'No anime currently in progress.',
  'Connectez-vous pour mettre à jour votre Animethèque.': 'Log in to update your anime library.',
  'Top 10 de la semaine': 'Weekly Top 10',
  'Tout le classement': 'Full ranking',
  'Chargement du classement...': 'Loading ranking...',
  'Classement indisponible.': 'Ranking unavailable.',
  'Suggestions indisponibles.': 'Suggestions unavailable.',
  'Fil d’activité': 'Activity feed',
  'Fil d’activite': 'Activity feed',
  'Retirer le like': 'Unlike',
  'Liker cette activité': 'Like this activity',
  'Liker cette activite': 'Like this activity',
  'Aucune activité récente chez les profils que vous suivez.': 'No recent activity from profiles you follow.',
  'Aucune activite recente chez les profils que vous suivez.': 'No recent activity from profiles you follow.',
  'Connectez-vous pour afficher l’activité des profils suivis.': 'Log in to view activity from followed profiles.',
  'Connectez-vous pour afficher l’activite des profils suivis.': 'Log in to view activity from followed profiles.',
  'Voir plus d’activités': 'More activity',
  'Voir plus d’activites': 'More activity',
  'Collections éditoriales': 'Editorial collections',
  'Collections editoriales': 'Editorial collections',
  'Sélections du moment': 'Current picks',
  'Selections du moment': 'Current picks',
  'Sélections pour vous': 'Picks for you',
  'Selections pour vous': 'Picks for you',
  'Nouveautés printemps': 'Spring releases',
  'Nouveautes printemps': 'Spring releases',
  'Séries récentes': 'Recent series',
  'Series recentes': 'Recent series',
  'Chefs-d’œuvre incontournables': 'Must-watch masterpieces',
  "Chefs-d'oeuvre incontournables": 'Must-watch masterpieces',
  'Classiques et mieux notés': 'Classics and top rated',
  'Classiques et mieux notes': 'Classics and top rated',
  'Univers sombres': 'Dark universes',
  'Action, mystère, tension': 'Action, mystery, tension',
  'Action, mystere, tension': 'Action, mystery, tension',
  'Voyages & découvertes': 'Journeys and discoveries',
  'Voyages & decouvertes': 'Journeys and discoveries',
  'Aventure et grands mondes': 'Adventure and vast worlds',
  'Suite': 'Sequel',
  'Pour vous': 'For you',
  'Hors radar': 'Under the radar',
  'À rattraper': 'Catch up',
  'A rattraper': 'Catch up',
  'Suite liée à votre Animethèque': 'Sequel linked to your anime library',
  'Suite liee a votre Animetheque': 'Sequel linked to your anime library',
  'Nouvelle suite à surveiller': 'New sequel to watch',
  'Nouvelle suite a surveiller': 'New sequel to watch',
  'Dans la continuité de vos séries': 'In line with your series',
  'Dans la continuite de vos series': 'In line with your series',
  'Proche de votre Animethèque': 'Close to your anime library',
  'Proche de votre Animetheque': 'Close to your anime library',
  'Moins exposé, bon potentiel': 'Less exposed, strong potential',
  'Moins expose, bon potentiel': 'Less exposed, strong potential',
  'Valeur sûre du catalogue': 'A safe catalog pick',
  'Valeur sure du catalogue': 'A safe catalog pick',
  "Très bon point d’entrée": 'Very good entry point',
  "Tres bon point d'entree": 'Very good entry point',
  'a mis à jour sa liste': 'updated their list',
  'a mis a jour sa liste': 'updated their list',
  'a terminé': 'completed',
  'a termine': 'completed',
  'a commencé': 'started',
  'a commence': 'started',
  'a ajouté à son Animethèque': 'added to their anime library',
  'a ajoute a son Animetheque': 'added to their anime library',
  'a mis à jour sa Mangathèque': 'updated their manga library',
  'a mis a jour sa Mangatheque': 'updated their manga library',
  'a ajouté à sa Mangathèque': 'added to their manga library',
  'a ajoute a sa Mangatheque': 'added to their manga library',

  'Catalogue Jikan': 'Jikan Catalog',
  'Animes': 'Anime',
  'Mangas': 'Manga',
  'Personnages': 'Characters',
  "Explore le catalogue complet d'animes, des classiques intemporels aux dernières nouveautés.":
    'Explore the full anime catalog, from timeless classics to the latest releases.',
  "Explore le catalogue complet d'animes, des classiques intemporels aux dernieres nouveautes.":
    'Explore the full anime catalog, from timeless classics to the latest releases.',
  'Explore le catalogue complet de mangas, des classiques intemporels aux dernières nouveautés.':
    'Explore the full manga catalog, from timeless classics to the latest releases.',
  'Explore le catalogue complet de mangas, des classiques intemporels aux dernieres nouveautes.':
    'Explore the full manga catalog, from timeless classics to the latest releases.',
  'Explore le catalogue complet des personnages, découvre leurs fiches, leurs apparitions et leurs relations.':
    'Explore the full character catalog, discover their pages, appearances, and relationships.',
  'Explore le catalogue complet des personnages, decouvre leurs fiches, leurs apparitions et leurs relations.':
    'Explore the full character catalog, discover their pages, appearances, and relationships.',
  'titres référencés': 'referenced titles',
  'titres references': 'referenced titles',
  'personnages référencés': 'referenced characters',
  'personnages references': 'referenced characters',
  'Rechercher un anime...': 'Search anime...',
  'Rechercher un manga...': 'Search manga...',
  'Rechercher un personnage...': 'Search character...',
  'Trier par': 'Sort by',
  'Type': 'Type',
  'Statut': 'Status',
  'Tous': 'All',
  'Toutes': 'All',
  'Année': 'Year',
  'Annee': 'Year',
  'Plus de filtres': 'More filters',
  'Filtres actifs': 'Active filters',
  'Filtres actifs :': 'Active filters:',
  'Tout effacer': 'Clear all',
  'Saison': 'Season',
  'Score': 'Score',
  'Catégories': 'Categories',
  'Categories': 'Categories',
  'Pagination des animes': 'Anime pagination',
  'Pagination des mangas': 'Manga pagination',
  'Page précédente': 'Previous page',
  'Page precedente': 'Previous page',
  'Page suivante': 'Next page',
  'Chargement des mangas...': 'Loading manga...',
  'Le catalogue se met a jour.': 'The catalog is updating.',
  'Réessaie dans quelques instants.': 'Try again in a moment.',
  'Reessaie dans quelques instants.': 'Try again in a moment.',
  'Aucun manga trouvé': 'No manga found',
  'Aucun manga trouve': 'No manga found',
  'Essaie un autre titre, genre, auteur ou année.': 'Try another title, genre, author, or year.',
  'Essaie un autre titre, genre, auteur ou annee.': 'Try another title, genre, author, or year.',

  'Filtres personnages': 'Character filters',
  'Univers': 'Universe',
  'Rôle': 'Role',
  'Role': 'Role',
  'Popularité': 'Popularity',
  'Popularite': 'Popularity',
  'Filtres avancés': 'Advanced filters',
  'Filtres avances': 'Advanced filters',
  'Tout réinitialiser': 'Reset all',
  'Tout reinitialiser': 'Reset all',
  'Personnages populaires': 'Popular characters',
  'Aucun personnage populaire disponible.': 'No popular character available.',
  'Tous les personnages': 'All characters',
  "Mode d'affichage": 'Display mode',
  'Affichage grille': 'Grid view',
  'Affichage liste': 'List view',
  'Grille': 'Grid',
  'Liste': 'List',
  'Erreur': 'Error',
  'Aucun personnage trouvé': 'No character found',
  'Aucun personnage trouve': 'No character found',
  'Modifie la recherche ou les filtres actifs.': 'Change the search or active filters.',
  'Chargement...': 'Loading...',
  'Charger plus': 'Load more',
  'Rôle principal': 'Main role',
  'Rôle secondaire': 'Supporting role',
  'Antagoniste': 'Antagonist',
  'Principal': 'Main',
  'Secondaire': 'Supporting',

  'Mon Animethèque': 'My anime library',
  'Mon Animetheque': 'My anime library',
  'Ma Mangathèque': 'My manga library',
  'Ma Mangatheque': 'My manga library',
  'Animethèque': 'Anime library',
  'Animetheque': 'Anime library',
  'Mangathèque': 'Manga library',
  'Mangatheque': 'Manga library',
  'Gérez votre collection, suivez votre progression et gardez une trace de chaque anime.':
    'Manage your collection, track your progress, and keep every anime organized.',
  'Gerez votre collection, suivez votre progression et gardez une trace de chaque anime.':
    'Manage your collection, track your progress, and keep every anime organized.',
  'Gérez votre collection, suivez vos tomes lus et gardez une trace de chaque manga.':
    'Manage your collection, track your read volumes, and keep every manga organized.',
  'Gerez votre collection, suivez vos tomes lus et gardez une trace de chaque manga.':
    'Manage your collection, track your read volumes, and keep every manga organized.',
  'Actions et filtres Animethèque': 'Anime library actions and filters',
  'Actions et filtres Animetheque': 'Anime library actions and filters',
  'Actions et filtres Mangathèque': 'Manga library actions and filters',
  'Actions et filtres Mangatheque': 'Manga library actions and filters',
  'Ajouter un anime': 'Add anime',
  'Ajouter un manga': 'Add manga',
  'Rechercher dans ma collection...': 'Search my collection...',
  'Réinitialiser': 'Reset',
  'Reinitialiser': 'Reset',
  'Chargement de votre Animethèque...': 'Loading your anime library...',
  'Chargement de votre Animetheque...': 'Loading your anime library...',
  'Chargement de votre Mangathèque...': 'Loading your manga library...',
  'Chargement de votre Mangatheque...': 'Loading your manga library...',
  'Votre Animethèque est vide.': 'Your anime library is empty.',
  'Votre Animetheque est vide.': 'Your anime library is empty.',
  'Explorer les animes': 'Explore anime',
  'Aucun manga dans votre Mangathèque.': 'No manga in your manga library.',
  'Aucun manga dans votre Mangatheque.': 'No manga in your manga library.',
  'Aucun résultat avec ces filtres.': 'No result with these filters.',
  'Aucun resultat avec ces filtres.': 'No result with these filters.',
  'Réinitialiser les filtres': 'Reset filters',
  'Reinitialiser les filtres': 'Reset filters',
  'En cours': 'Watching',
  'Terminé': 'Completed',
  'Termines': 'Completed',
  'Terminés': 'Completed',
  'À voir et autres statuts': 'Plan to watch and other statuses',
  'A voir et autres statuts': 'Plan to watch and other statuses',
  'À lire et autres statuts': 'Plan to read and other statuses',
  'A lire et autres statuts': 'Plan to read and other statuses',
  'Retirer des favoris': 'Remove from favorites',
  'Ajouter aux favoris': 'Add to favorites',
  'Mettre à jour': 'Update',
  'Mettre a jour': 'Update',
  "Retirer de l'Animethèque": 'Remove from anime library',
  "Retirer de l'Animetheque": 'Remove from anime library',
  'Retirer de la Mangathèque': 'Remove from manga library',
  'Retirer de la Mangatheque': 'Remove from manga library',
  'Messagerie': 'Messaging',
  'Messages': 'Messages',
  'Discutez avec vos amis, échangez autour de vos animes préférés et partagez vos découvertes.':
    'Chat with your friends, talk about your favorite anime, and share your discoveries.',
  'Discutez avec vos amis, echangez autour de vos animes preferes et partagez vos decouvertes.':
    'Chat with your friends, talk about your favorite anime, and share your discoveries.',
  'Voir mes suivis': 'View following',
  'Rechercher un contact': 'Search contact',
  'Non lus': 'Unread',
  'En ligne': 'Online',
  'Gérer mes contacts': 'Manage contacts',
  'Gerer mes contacts': 'Manage contacts',
  'Écrire un message...': 'Write a message...',
  'Ecrire un message...': 'Write a message...',
  'Ajouter une image': 'Add image',
  'Envoyer le message': 'Send message',
  'Masquer localement': 'Hide locally',
  'Aucun ami': 'No friend',
  'Aucun message. Envoie le premier message.': 'No message. Send the first one.',
  'Messages rapides': 'Quick messages',
  'Retour aux conversations': 'Back to conversations',
  'Fermer les messages': 'Close messages',
  'Supprimer le chat': 'Delete chat',
  'Nouvelle conversation': 'New conversation',
  'Fermer la creation de conversation': 'Close conversation creation',
  'Masquer les messages': 'Hide messages',
  "Fermer l'image": 'Close image',

  'Communauté': 'Community',
  'Communaute': 'Community',
  'Mes suivis': 'Following',
  'Découvre les dernières avancées et actions des personnes que tu suis.':
    'Discover the latest progress and actions from people you follow.',
  'Decouvre les dernieres avancees et actions des personnes que tu suis.':
    'Discover the latest progress and actions from people you follow.',
  'Actualisation...': 'Refreshing...',
  'Rafraîchir': 'Refresh',
  'Rafraichir': 'Refresh',
  'Mon profil': 'My profile',
  'Résumé social': 'Social summary',
  'Resume social': 'Social summary',
  'Suivis': 'Following',
  'Abonnés': 'Followers',
  'Abonnes': 'Followers',
  'Dernière activité': 'Last activity',
  'Derniere activite': 'Last activity',
  'Chargement des suivis...': 'Loading following...',
  'Effacer la recherche': 'Clear search',
  'Rechercher un profil': 'Search profile',
  'Voir': 'View',
  'Les suggestions à suivre peuvent alimenter ce fil en quelques clics.':
    'Follow suggestions can fill this feed in a few clicks.',
  'En ligne à découvrir': 'Online profiles to discover',
  'Voir les profils connectés disponibles': 'View available online profiles',
  'Profils à découvrir': 'Profiles to discover',
  'Découvre les membres que tu ne suis pas encore, en ligne ou hors ligne.':
    'Discover members you do not follow yet, online or offline.',
  'Voir les comptes que tu ne suis pas encore': 'View accounts you do not follow yet',
  'Aucun profil à découvrir ne correspond à cette recherche.':
    'No profile to discover matches this search.',
  'Aucun profil à découvrir pour le moment.': 'No profile to discover for now.',
  'Hors ligne, mais disponible à suivre': 'Offline, but available to follow',
  'Connecte-toi pour découvrir les profils.': 'Log in to discover profiles.',
  'Impossible de charger les profils à découvrir.': 'Unable to load profiles to discover.',
  'activités': 'activities',
  'activites': 'activities',
  'Les animés les plus ajoutés récemment': 'Most recently added anime',
  'Les animes les plus ajoutés récemment': 'Most recently added anime',
  'Les tendances apparaîtront avec les prochaines activités.': 'Trends will appear with upcoming activity.',
  'Voir toutes les tendances': 'View all trends',
  'Suggestions à suivre': 'Follow suggestions',
  'Des profils qui partagent tes goûts': 'Profiles that share your tastes',
  'Suivre': 'Follow',
  'Tu suis déjà les profils publics disponibles.': 'You already follow the available public profiles.',
  'Voir plus de suggestions': 'View more suggestions',

  'Mon Profil': 'My Profile',
  'Profil public': 'Public profile',
  'Modifier la bannière': 'Edit banner',
  'Modifier la banniere': 'Edit banner',
  'Modifier la photo de profil': 'Edit profile picture',
  'Abonnés masqués': 'Followers hidden',
  'Abonnes masques': 'Followers hidden',
  'Modifier le profil': 'Edit profile',
  'Partager': 'Share',
  'Niveau': 'Level',
  'Rang': 'Rank',
  'vers le niveau': 'to level',
  'Animes suivis': 'Tracked anime',
  'Mangas suivis': 'Tracked manga',
  'Épisodes vus': 'Watched episodes',
  'Episodes vus': 'Watched episodes',
  'Tomes lus': 'Read volumes',
  'Changer la bannière': 'Change banner',
  'Changer la banniere': 'Change banner',
  'Actions photo de profil': 'Profile picture actions',
  'Actions bannière': 'Banner actions',
  'Actions banniere': 'Banner actions',
  'Changer la photo': 'Change picture',
  'Supprimer la photo': 'Delete picture',
  'Supprimer la bannière': 'Delete banner',
  'Supprimer la banniere': 'Delete banner',
  'Photo de profil': 'Profile picture',
  'Bannière': 'Banner',
  'Banniere': 'Banner',
  'Recadrer la photo': 'Crop picture',
  'Recadrer la bannière': 'Crop banner',
  'Recadrer la banniere': 'Crop banner',
  'Déplace l’image directement dans le cadre. Utilise le zoom si nécessaire.':
    'Move the image directly inside the frame. Use zoom if needed.',
  "Déplace l'image directement dans le cadre. Utilise le zoom si nécessaire.":
    'Move the image directly inside the frame. Use zoom if needed.',
  'Deplace l’image directement dans le cadre. Utilise le zoom si necessaire.':
    'Move the image directly inside the frame. Use zoom if needed.',
  'Dézoomer': 'Zoom out',
  'Dezoomer': 'Zoom out',
  'Appliquer': 'Apply',
  'Annuler': 'Cancel',
  'Épisodes': 'Episodes',
  'Episodes': 'Episodes',
  'Dernière activité du profil': 'Latest profile activity',
  'Voir toute l’activité': 'View all activity',
  "Voir toute l'activité": 'View all activity',
  'Aucune activité récente.': 'No recent activity.',
  'Badges': 'Badges',
  'Voir tous les badges': 'View all badges',
  'Favoris': 'Favorites',
  'Aucun favori pour le moment.': 'No favorite yet.',
  'Genres préférés': 'Favorite genres',
  'Genres preferes': 'Favorite genres',
  'Voir tous': 'View all',
  'Aucun genre détecté.': 'No genre detected.',
  'Aucun genre detecte.': 'No genre detected.',
  'Statistiques': 'Stats',
  'Voir le détail': 'View details',
  'Voir le detail': 'View details',
  'Séries terminées': 'Completed series',
  'Series terminees': 'Completed series',
  'Épisodes regardés': 'Watched episodes',
  'Episodes regardes': 'Watched episodes',
  'Mangas terminés': 'Completed manga',
  'Mangas termines': 'Completed manga',
  'Tous droits réservés': 'All rights reserved',
  'Tous droits reserves': 'All rights reserved',
  'À propos': 'About',
  'A propos': 'About',
  'Confidentialité': 'Privacy',
  'Confidentialite': 'Privacy',

  'Compte': 'Account',
  'Identifiant': 'Identifier',
  'Changer mon pseudo': 'Change my username',
  'Pseudo actuel :': 'Current username:',
  'Maximum 16 caractères.': 'Maximum 16 characters.',
  'Maximum 16 caracteres.': 'Maximum 16 characters.',
  'Nouveau pseudo': 'New username',
  'Le pseudo doit faire 16 caractères maximum.': 'Username must be 16 characters or fewer.',
  'Le pseudo doit faire 16 caracteres maximum.': 'Username must be 16 characters or fewer.',
  'Sauvegarde...': 'Saving...',
  'Sauvegarder le pseudo': 'Save username',
  'Visibilité du profil': 'Profile visibility',
  'Visibilite du profil': 'Profile visibility',
  'Choisis les options sociales de ta page publique. Ton Animethèque et ta Mangathèque sont toujours publiques.':
    'Choose the social options for your public page. Your anime and manga libraries are always public.',
  'Afficher mes abonnés': 'Show my followers',
  'Afficher mes abonnes': 'Show my followers',
  "Masque le compteur d'abonnés sur ton profil public.": 'Hide the follower counter on your public profile.',
  "Masque le compteur d'abonnes sur ton profil public.": 'Hide the follower counter on your public profile.',
  'Apparaître dans les profils en ligne': 'Appear in online profiles',
  'Apparaitre dans les profils en ligne': 'Appear in online profiles',
  'Ton profil peut être proposé quand tu es connecté.': 'Your profile can be suggested when you are online.',
  'Ton profil peut etre propose quand tu es connecte.': 'Your profile can be suggested when you are online.',
  'Sauvegarder la confidentialité': 'Save privacy',
  'Sauvegarder la confidentialite': 'Save privacy',

  "Retourner à l'accueil AnimeClub": 'Back to AnimeClub home',
  'Aperçu AnimeClub': 'AnimeClub preview',
  'Garanties AnimeClub': 'AnimeClub guarantees',
  'Bon': 'Welcome',
  'retour': 'back',
  'Accède à ton': 'Access your',
  ', ton profil et tes favoris.': ', profile, and favorites.',
  'Pseudo ou e-mail': 'Username or email',
  'Mot de passe': 'Password',
  "Le pseudo ou l'e-mail est requis.": 'Username or email is required.',
  'Le mot de passe est requis.': 'Password is required.',
  'Rester connecté': 'Stay signed in',
  'Connexion en cours...': 'Logging in...',
  'OU': 'OR',
  'Continuer avec Discord': 'Continue with Discord',
  'Redirection Discord...': 'Redirecting to Discord...',
  'Pas encore de compte ?': 'No account yet?',
  'Ton univers, ta liste.': 'Your universe, your list.',
  "Ajoute tes animes et mangas préférés, suis ta progression, découvre de nouvelles œuvres et connecte-toi avec d'autres passionnés.":
    'Add your favorite anime and manga, track your progress, discover new works, and connect with other fans.',
  'Sécurisé': 'Secure',
  'Tes données sont protégées': 'Your data is protected',
  'Confidentiel': 'Private',
  'Aucun spam, jamais': 'No spam, ever',
  'Fait pour toi': 'Made for you',
  '100% passion anime': '100% anime passion',
  'Créer ton': 'Create your',
  'compte': 'account',
  'Rejoins': 'Join',
  'et sauvegarde ton aventure.': 'and save your journey.',
  'Pseudo': 'Username',
  'Adresse e-mail': 'Email address',
  'Choisis un pseudo unique': 'Choose a unique username',
  'Le pseudo est requis.': 'Username is required.',
  'Nous ne partagerons jamais ton e-mail.': 'We will never share your email.',
  "L'adresse e-mail est requise.": 'Email address is required.',
  'Entre une adresse e-mail valide.': 'Enter a valid email address.',
  'Minimum 8 caractères': 'Minimum 8 characters',
  'Le mot de passe doit contenir au moins 8 caractères.': 'Password must contain at least 8 characters.',
  'Confirme ton mot de passe': 'Confirm your password',
  'Les mots de passe doivent correspondre': 'Passwords must match',
  'Les mots de passe ne correspondent pas.': 'Passwords do not match.',
  "J'accepte les": 'I accept the',
  "Conditions d'utilisation": 'Terms of use',
  'et la': 'and the',
  'Politique de confidentialité': 'Privacy policy',
  'Tu dois accepter les conditions pour créer ton compte.': 'You must accept the terms to create your account.',
  'Mode local : lien de confirmation disponible.': 'Local mode: confirmation link available.',
  'Confirmer mon e-mail': 'Confirm my email',
  "Je me suis trompé d'e-mail": 'I used the wrong email',
  'Créer mon compte': 'Create my account',
  'Création en cours...': 'Creating account...',
  'Déjà un compte ?': 'Already have an account?',
  'Masquer le mot de passe': 'Hide password',
  'Afficher le mot de passe': 'Show password',
  'Masquer la confirmation': 'Hide confirmation',
  'Afficher la confirmation': 'Show confirmation',
  'Discord': 'Discord',
  'Connexion en cours': 'Logging in',
  'AnimeClub finalise ta session.': 'AnimeClub is finalizing your session.',
  'Connexion impossible': 'Unable to log in',
  "Retour à l'inscription": 'Back to sign up',
  'Aller à la connexion': 'Go to log in',
  'Page introuvable': 'Page not found',
  "Cette adresse n'existe pas ou a ete deplacee.": 'This address does not exist or has been moved.',
  "Cette adresse n'existe pas ou a été déplacée.": 'This address does not exist or has been moved.',
  "Retour a l'accueil": 'Back to home',
  "Retour à l'accueil": 'Back to home',
  'Catalogue animes': 'Anime catalog',
  'Connexion': 'Log in',
  'Mot de passe oublié ?': 'Forgot password?',
  'Mot de passe oublie ?': 'Forgot password?',
  'E-mail de validation incorrect ?': 'Wrong validation email?',
  "Changer l'adresse de validation": 'Change validation email',
  "Changer l'e-mail de validation": 'Change validation email',
  "Si tu t'es trompé d'e-mail à l'inscription, indique ton pseudo ou ton ancien e-mail, ton mot de passe, puis la bonne adresse. Un nouveau lien de confirmation sera envoyé.": 'If you used the wrong email when signing up, enter your username or old email, your password, then the correct address. A new confirmation link will be sent.',
  'Pseudo ou e-mail actuel': 'Current username or email',
  "Le pseudo ou l'e-mail actuel est requis.": 'Current username or email is required.',
  'Nouvelle adresse e-mail': 'New email address',
  "La nouvelle adresse e-mail est requise.": 'New email address is required.',
  'Envoi en cours...': 'Sending...',
  'Retour à la connexion': 'Back to log in',
  "S'inscrire": 'Sign up',
  'Se connecter': 'Log in',
  'Déconnexion': 'Log out',
  'Deconnexion': 'Log out',
  'Nouvelle notification': 'New notification',
  'Badge débloqué': 'Badge unlocked',
  'Badge debloque': 'Badge unlocked',
  'Mes badges': 'My badges',
  'Mon compte': 'My account',
  'Bibliothèques': 'Libraries',
  'Bibliotheques': 'Libraries',
};

const GENRE_TRANSLATIONS: Record<string, string> = {
  Action: 'Action',
  Aventure: 'Adventure',
  'Avant-garde': 'Avant-garde',
  'Primé': 'Award Winning',
  'Prime': 'Award Winning',
  'Boys Love': 'Boys Love',
  'Comédie': 'Comedy',
  Comedie: 'Comedy',
  Drame: 'Drama',
  Ecchi: 'Ecchi',
  Erotica: 'Erotica',
  Fantastique: 'Fantasy',
  Fantasy: 'Fantasy',
  'Girls Love': 'Girls Love',
  Gastronomie: 'Gourmet',
  Horror: 'Horror',
  Horreur: 'Horror',
  Mystère: 'Mystery',
  Mystere: 'Mystery',
  Romance: 'Romance',
  'Science-fiction': 'Sci-Fi',
  'Tranche de vie': 'Slice of Life',
  Sport: 'Sports',
  Sports: 'Sports',
  Surnaturel: 'Supernatural',
  Suspense: 'Suspense',
  Psychologique: 'Psychological',
  'Sur naturel': 'Supernatural',
};

const ATTRIBUTE_NAMES = ['placeholder', 'aria-label', 'title'] as const;

interface TranslatedValue {
  original: string;
  translated: string;
}

@Injectable({ providedIn: 'root' })
export class DomI18nService {
  private readonly languageService = inject(LanguageService);
  private readonly zone = inject(NgZone);
  private readonly translatedTextNodes = new WeakMap<Text, TranslatedValue>();
  private readonly translatedAttributes = new WeakMap<Element, Map<string, TranslatedValue>>();
  private observer: MutationObserver | null = null;
  private queued = false;

  constructor() {
    effect(() => {
      this.languageService.language();
      this.queueApply();
    });
  }

  start(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined' || this.observer) {
      return;
    }

    this.zone.runOutsideAngular(() => {
      this.observer = new MutationObserver(() => this.queueApply());
      this.observer.observe(document.body, {
        attributes: true,
        attributeFilter: [...ATTRIBUTE_NAMES],
        characterData: true,
        childList: true,
        subtree: true,
      });
      this.queueApply();
    });
  }

  private queueApply(): void {
    if (typeof window === 'undefined' || this.queued) {
      return;
    }

    this.queued = true;
    window.setTimeout(() => {
      this.queued = false;
      this.apply(document.body);
    }, 0);
  }

  private apply(root: ParentNode): void {
    const language = this.languageService.language();
    this.walkTextNodes(root, (node) => this.applyTextNode(node, language));
    this.walkElements(root, (element) => this.applyElementAttributes(element, language));
  }

  private walkTextNodes(root: ParentNode, visitor: (node: Text) => void): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || ['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE'].includes(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes: Text[] = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode as Text);
    }
    nodes.forEach(visitor);
  }

  private walkElements(root: ParentNode, visitor: (element: Element) => void): void {
    if (root instanceof Element) {
      visitor(root);
    }
    root.querySelectorAll('*').forEach(visitor);
  }

  private applyTextNode(node: Text, language: 'fr' | 'en'): void {
    if (language === 'fr') {
      const stored = this.translatedTextNodes.get(node);
      if (stored) {
        node.nodeValue = stored.original;
        this.translatedTextNodes.delete(node);
      }
      return;
    }

    const stored = this.translatedTextNodes.get(node);
    const current = node.nodeValue ?? '';
    const original = stored && (current === stored.translated || current === stored.original)
      ? stored.original
      : current;
    const translated = this.translatePreservingWhitespace(original);
    if (translated && translated !== original) {
      this.translatedTextNodes.set(node, { original, translated });
      node.nodeValue = translated;
    }
  }

  private applyElementAttributes(element: Element, language: 'fr' | 'en'): void {
    for (const attribute of ATTRIBUTE_NAMES) {
      if (!element.hasAttribute(attribute)) {
        continue;
      }

      const originals = this.translatedAttributes.get(element);
      if (language === 'fr') {
        const stored = originals?.get(attribute);
        if (stored) {
          element.setAttribute(attribute, stored.original);
          originals?.delete(attribute);
        }
        continue;
      }

      const stored = originals?.get(attribute);
      const current = element.getAttribute(attribute) ?? '';
      const original = stored && (current === stored.translated || current === stored.original)
        ? stored.original
        : current;
      const translated = this.translatePreservingWhitespace(original);
      if (translated && translated !== original) {
        const next = originals ?? new Map<string, TranslatedValue>();
        next.set(attribute, { original, translated });
        this.translatedAttributes.set(element, next);
        element.setAttribute(attribute, translated);
      }
    }
  }

  private translatePreservingWhitespace(value: string): string | null {
    const leading = value.match(/^\s*/)?.[0] ?? '';
    const trailing = value.match(/\s*$/)?.[0] ?? '';
    const compact = value.trim().replace(/\s+/g, ' ');
    if (!compact) {
      return null;
    }

    const translated = this.translateCompact(compact);
    return translated ? `${leading}${translated}${trailing}` : null;
  }

  private translateCompact(value: string): string | null {
    const exact = TEXT_TRANSLATIONS[value] ?? GENRE_TRANSLATIONS[value];
    if (exact) {
      return exact;
    }

    let match = value.match(/^(\d[\d\s.,]*) titres r(?:é|e)f(?:é|e)renc(?:é|e)s$/i);
    if (match) {
      return `${match[1]} referenced titles`;
    }

    match = value.match(/^(\d[\d\s.,]*) personnages r(?:é|e)f(?:é|e)renc(?:é|e)s$/i);
    if (match) {
      return `${match[1]} referenced characters`;
    }

    match = value.match(/^(\d[\d\s.,]*) r(?:é|e)sultats$/i);
    if (match) {
      return `${match[1]} results`;
    }

    match = value.match(/^(\d[\d\s.,]*) activit(?:é|e)s$/i);
    if (match) {
      return `${match[1]} activities`;
    }

    match = value.match(/^(\d[\d\s.,]*) abonn(?:é|e)s?$/i);
    if (match) {
      return `${match[1]} ${Number(match[1].replace(/\s/g, '')) > 1 ? 'followers' : 'follower'}`;
    }

    match = value.match(/^Afficher (.+)$/i);
    if (match) {
      return `Show ${match[1]}`;
    }

    match = value.match(/^Retirer (.+)$/i);
    if (match) {
      return `Remove ${match[1]}`;
    }

    match = value.match(/^(.+) favoris$/i);
    if (match) {
      return `${match[1]} favorites`;
    }

    match = value.match(/^(Univers|Rôle|Role|Popularité|Popularite) : (.+)$/i);
    if (match) {
      const filterName = this.translateCompact(match[1]) ?? match[1];
      const filterValue = this.translateCompact(match[2]) ?? match[2];
      return `${filterName}: ${filterValue}`;
    }

    match = value.match(/^(\d+) \/ (.+) épisodes vus$/i);
    if (match) {
      return `${match[1]} / ${match[2]} watched episodes`;
    }

    match = value.match(/^(\d+) \/ (.+) tomes lus$/i);
    if (match) {
      return `${match[1]} / ${match[2]} read volumes`;
    }

    match = value.match(/^Épisode (\d+) sur (\d+)$/i);
    if (match) {
      return `Episode ${match[1]} of ${match[2]}`;
    }

    match = value.match(/^Épisode (\d+)$/i);
    if (match) {
      return `Episode ${match[1]}`;
    }

    match = value.match(/^il y a (\d+) min$/i);
    if (match) {
      return `${match[1]} min ago`;
    }

    match = value.match(/^il y a (\d+) h$/i);
    if (match) {
      return `${match[1]} h ago`;
    }

    match = value.match(/^il y a (\d+) j$/i);
    if (match) {
      return `${match[1]} d ago`;
    }

    return null;
  }
}
