# SEO technique sur routes existantes

Domaine canonical: `https://animeclub.fr`
Regle: ne pas renommer les routes, ne pas changer les slugs, ne pas casser les aliases deja partages.

## Sitemap v1

Le sitemap reste volontairement court pour eviter un fichier dynamique massif non decoupe:

- `https://animeclub.fr/`
- `https://animeclub.fr/animes`
- `https://animeclub.fr/manga`
- `https://animeclub.fr/characters`
- `https://animeclub.fr/landing`
- `https://animeclub.fr/legal-notice`
- `https://animeclub.fr/privacy-policy`
- `https://animeclub.fr/terms`

Les templates dynamiques `/animes/:slug`, `/manga/:slug`, `/characters/:id` sont documentes ci-dessous, mais ne sont pas exportes massivement dans le sitemap v1.

## Recommandations par URL

| URL existante | Title recommande | Meta description recommandee | Indexation | OG image | Priorite SEO |
|---|---|---|---|---|---:|
| `/` | `AnimeClub - Crée ton Animethèque et suis tes animes` | `Découvre AnimeClub, organise tes animes et mangas, suis ta progression, crée ton profil et partage tes listes avec la communauté.` | index | `/assets/animetheque/animetheque-banner.png` | Haute |
| `/landing` | `AnimeClub - Crée ton Animethèque et suis tes animes` | `Crée ton Animethèque, suis tes épisodes, organise tes favoris et découvre ce que la communauté ajoute à sa liste.` | index | `/assets/animetheque/animetheque-banner.png` | Haute pour campagnes |
| `/animes` | `Catalogue Anime - AnimeClub` | `Explore les animes, films, OVA et séries disponibles dans le catalogue AnimeClub.` | index | `/assets/anime-catalog/anime-page-bg.png` | Haute |
| `/animes/:slug` | `{animeTitle} - Fiche anime | AnimeClub` | `Découvre {animeTitle} : synopsis, épisodes, personnages, genres, score et ajout à ton Animethèque.` | index | poster anime si disponible | Haute |
| `/manga` | `Catalogue Manga - AnimeClub` | `Explore le catalogue manga AnimeClub : recherche, filtres, auteurs, score et ajout à ta Mangathèque.` | index | `/assets/mangatheque/mangatheque-banner.png` | Moyenne |
| `/manga/:slug` | `{mangaTitle} - Fiche manga | AnimeClub` | `Découvre {mangaTitle} : synopsis, volumes, chapitres, auteurs, score et ajout à ta Mangathèque.` | index | couverture manga si disponible | Moyenne |
| `/characters` | `Personnages - AnimeClub` | `Parcourez les personnages anime, leurs fiches, leurs rôles et leurs animes associés sur AnimeClub.` | index | `/assets/brand/animeclub-logo-nav.png` | Moyenne |
| `/characters/:id` | `{characterName} - Personnage | AnimeClub` | `Découvre {characterName} : fiche personnage, image, description, origine et animes associés.` | index | image personnage si disponible | Moyenne |
| `/personnages` | Alias vers `/characters` | Redirection conservee | index via canonical cible | cible `/characters` | Moyenne |
| `/personnages/:id` | Alias vers `/characters/:id` | Redirection conservee | index via canonical cible | cible `/characters/:id` | Moyenne |
| `/animetheque` | `Mon Animethèque - AnimeClub` | `Gère ta collection anime, suis tes épisodes, tes favoris et ta progression sur AnimeClub.` | noindex | `/assets/animetheque/animetheque-banner.png` | Conversion |
| `/anime-library` | `Mon Animethèque - AnimeClub` | `Gère ta collection anime, suis tes épisodes, tes favoris et ta progression sur AnimeClub.` | noindex | `/assets/animetheque/animetheque-banner.png` | Conversion |
| `/mangatheque` | `Ma Mangathèque - AnimeClub` | `Gère ta collection manga, tes volumes, tes favoris et ta progression sur AnimeClub.` | noindex | `/assets/mangatheque/mangatheque-banner.png` | Conversion |
| `/manga-library` | `Ma Mangathèque - AnimeClub` | `Gère ta collection manga, tes volumes, tes favoris et ta progression sur AnimeClub.` | noindex | `/assets/mangatheque/mangatheque-banner.png` | Conversion |
| `/profile/:pseudo` | `Profil de {pseudo} - AnimeClub` | `Profil public de {pseudo} sur AnimeClub : favoris, badges, activité et listes publiques.` | index si profil public | avatar/banniere profil | Moyenne |
| `/profil/:pseudo` | Alias vers `/profile/:pseudo` | Redirection conservee | index via canonical cible | cible `/profile/:pseudo` | Moyenne |
| `/profile` | `Espace utilisateur - AnimeClub` | `Espace utilisateur AnimeClub.` | noindex | logo | Prive |
| `/profil` | Alias vers `/profile` | Redirection conservee | noindex | logo | Prive |
| `/messages` | `Messagerie - AnimeClub` | `Messagerie privee AnimeClub.` | noindex | logo | Prive |
| `/following` | `Suivis - AnimeClub` | `Fil prive des profils suivis sur AnimeClub.` | noindex | logo | Prive |
| `/suivis` | Alias vers `/following` | Redirection conservee | noindex | logo | Prive |
| `/login` | `Connexion - AnimeClub` | `Connecte-toi pour retrouver ton Animethèque et ta progression.` | noindex | logo | Auth |
| `/register` | `Inscription - AnimeClub` | `Crée ton compte pour sauvegarder ta progression anime et manga.` | noindex | logo | Auth |
| `/forgot-password` | `Mot de passe oublié - AnimeClub` | `Réinitialise l'accès à ton compte AnimeClub.` | noindex | logo | Auth |
| `/reset-password` | `Réinitialisation du mot de passe - AnimeClub` | `Choisis un nouveau mot de passe AnimeClub.` | noindex | logo | Auth |

## Controle H1, images et liens internes

- Chaque page publique doit garder un H1 unique: accueil/landing, catalogue anime, fiche anime, catalogue manga, fiche manga, personnages, fiche personnage, profil public.
- Les images principales doivent conserver un `alt` descriptif quand elles portent une information; les images decoratives restent `alt=""`.
- Les liens internes existants restent privilegies: catalogue vers fiche, fiche vers Animetheque, profil vers listes publiques, feed vers profil/fiche.
- Les aliases historiques restent des redirections et ne deviennent pas des nouvelles pages SEO.
