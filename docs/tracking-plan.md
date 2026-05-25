# Plan de tracking avant publicite

Objectif: mesurer la source du trafic, les actions produit et les conversions avant toute campagne payante.

## Configuration

- GA4 prepare cote front avec `ga4MeasurementId`, `analyticsEnabled`, `consentRequired`.
- En absence de Measurement ID, GA4 reste desactive sans casser le site.
- Les UTM sont persistés en `sessionStorage` pour enrichir les evenements.
- Search Console doit etre reliee a `https://animeclub.fr` pour suivre impressions, clics, requetes et pages.
- La telemetrie backend existante reste limitee aux erreurs/API/web vitals; ne pas ajouter `anime_title` en tag Micrometer.

## Proprietes standard

| Propriete | Description |
|---|---|
| `source` | Valeur `utm_source` persistée |
| `medium` | Valeur `utm_medium` persistée |
| `campaign` | Valeur `utm_campaign` persistée |
| `content` | Valeur `utm_content` persistée |
| `term` | Valeur `utm_term` persistée |
| `route` | Route courante sans query string |
| `referrer` | Referrer initial si disponible |
| `user_logged_in` | Etat de connexion au moment de l'evenement |
| `anime_id` | Slug ou identifiant anime selon le contexte |
| `anime_title` | Titre anime, uniquement en front analytics |

## Evenements

| Evenement | Declencheur | Proprietes specifiques | Priorite | Page concernee |
|---|---|---|---:|---|
| `page_view` | Navigation Angular | `page_location`, `page_title` | Haute | Toutes |
| `sign_up_start` | Soumission valide du formulaire d'inscription | `method` | Haute | `/register`, `/register/discord` |
| `sign_up_complete` | Creation de compte reussie | `method` | Haute | `/register`, `/register/discord` |
| `login` | Connexion reussie | `method` | Haute | `/login`, `/auth/discord/callback` |
| `anime_view` | Fiche anime chargee | `anime_id`, `anime_title` | Haute | `/animes/:slug` |
| `anime_search` | Recherche catalogue apres debounce | `query` | Moyenne | `/animes` |
| `anime_add_to_library` | Sauvegarde anime dans Animetheque | `anime_id`, `anime_title`, `status`, `watched_episodes` | Haute | `/animes`, `/animes/:slug` |
| `anime_progress_update` | Changement de statut/progression | `anime_id`, `anime_title`, `status`, `watched_episodes` | Haute | `/animes`, `/animes/:slug`, `/anime-library` |
| `anime_mark_completed` | Passage au statut termine | `anime_id`, `anime_title`, `status`, `watched_episodes` | Haute | `/animes`, `/animes/:slug`, `/anime-library` |
| `profile_view` | Profil public charge | `profile_id`, `profile_pseudo` | Moyenne | `/profile/:pseudo` |
| `profile_follow` | Follow/unfollow reussi | `profile_id`, `profile_pseudo`, `following` | Moyenne | `/profile/:pseudo` |
| `message_sent` | Message envoye avec succes | `recipient_id`, `has_image` | Basse | `/messages` |
| `discord_landing_visit` | Visite `/` ou `/landing` depuis Discord | UTM standard | Haute | `/`, `/landing` |
| `discord_cta_click` | Clic CTA campagne/Discord | `target`, `cta` | Haute | `/landing`, `/login`, `/register` |
| `ad_landing_visit` | Visite `/` ou `/landing` depuis CPC/Google | UTM standard | Haute | `/`, `/landing` |

## A faire avant lancement payant

1. Renseigner le Measurement ID GA4 de production.
2. Activer `analyticsEnabled` seulement apres validation consentement.
3. Creer les conversions GA4: `sign_up_complete`, puis importer dans Google Ads.
4. Tester les UTM en navigation privee.
5. Verifier dans DebugView GA4 que les proprietes standard remontent.
