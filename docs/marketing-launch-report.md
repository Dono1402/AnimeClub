# Rapport final marketing stable AnimeClub

Date: 2026-05-25
Domaine: `https://animeclub.fr`

## 1. Pret

- Routes existantes conservees.
- Redirections historiques conservees: `/personnages`, `/animetheque`, `/mangatheque`, `/profil`, `/suivis`.
- SEO statique corrige vers `https://animeclub.fr`.
- `robots.txt` et `sitemap.xml` corriges.
- Page `/landing` ajoutee sans toucher aux routes principales.
- Tracking front prepare avec GA4 desactivable.
- UTM Discord, socials et SEA documentes.
- Messages Discord et posts sociaux prets.

## 2. Risque

- GA4 est prepare mais desactive tant qu'aucun Measurement ID n'est fourni.
- Search Console doit encore etre validee cote Google.
- Tests prod mutatifs non effectues sans compte test fourni.
- Les pages SPA dependent du rendu Angular pour certaines metas dynamiques.
- Publicite payante a ne pas lancer avant validation `sign_up_complete`.

## 3. Changements appliques

- Ajout du service front `MarketingAnalyticsService`.
- Ajout des evenements: page view, inscription, login, anime view, recherche anime, ajout Animetheque, progression, completion, profil, follow, message, landing Discord/Ads.
- Correction des metas statiques `index.html`.
- Correction `robots.txt` et `sitemap.xml`.
- Ajout de `/landing`.
- Remplacement du libelle visible `A regarder` par `A voir`.
- Remplacement des formulations `prevoit de regarder` par `prevoit de voir` dans le feed.

## 4. Routes non modifiees

- `/`
- `/animes`
- `/animes/:slug`
- `/characters`
- `/characters/:id`
- `/personnages`
- `/personnages/:id`
- `/manga`
- `/manga/:slug`
- `/animetheque`
- `/anime-library`
- `/mangatheque`
- `/manga-library`
- `/profil`
- `/profile`
- `/profile/:pseudo`
- `/messages`
- `/suivis`
- `/following`
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`

## 5. URLs UTM

- Discord launch: `https://animeclub.fr/?utm_source=discord&utm_medium=community&utm_campaign=animeclub_launch&utm_content=announcement`
- Discord beta: `https://animeclub.fr/?utm_source=discord&utm_medium=community&utm_campaign=animeclub_beta&utm_content=feedback`
- Profil Discord: `https://animeclub.fr/?utm_source=discord&utm_medium=profile&utm_campaign=animeclub_launch&utm_content=signature`
- Reddit: `https://animeclub.fr/?utm_source=reddit&utm_medium=social&utm_campaign=animeclub_launch`
- TikTok: `https://animeclub.fr/?utm_source=tiktok&utm_medium=social&utm_campaign=animeclub_launch`
- Google Ads: `https://animeclub.fr/landing?utm_source=google&utm_medium=cpc&utm_campaign=animetheque&utm_content={creative}`

## 6. Plan Discord

- Pas de DM.
- Pas de `@everyone` par defaut.
- Soft launch, beta-test, puis lancement officiel.
- Salons proposes: `#animeclub`, `#animeclub-bugs`, `#animeclub-suggestions`.
- Badge `early member` uniquement si simple a ajouter.

## 7. Plan SEO

- Optimiser les routes existantes uniquement.
- Garder les aliases en redirection.
- Garder les pages publiques indexables.
- Noindex sur auth, messagerie, compte, bibliotheques privees et suivis prives.
- Sitemap v1 court; templates dynamiques documentes sans export massif.

## 8. Plan SEA

- Ne pas lancer sans tracking.
- Test 5 a 10 euros/jour pendant 7 jours.
- Arret si aucune inscription.
- Mesurer cout par inscription et ajout Animetheque apres inscription.
- Negatifs a exclure: streaming, gratuit, telechargement, scan, episode gratuit.

## 9. Evenements tracking

- `page_view`
- `sign_up_start`
- `sign_up_complete`
- `login`
- `anime_view`
- `anime_search`
- `anime_add_to_library`
- `anime_progress_update`
- `anime_mark_completed`
- `profile_view`
- `profile_follow`
- `message_sent`
- `discord_landing_visit`
- `discord_cta_click`
- `ad_landing_visit`

## 10. Recommandations 7 prochains jours

1. Deployer les corrections SEO/landing/tracking.
2. Verifier `robots.txt`, `sitemap.xml`, canonical et Open Graph en prod.
3. Renseigner GA4 et tester DebugView.
4. Valider Search Console sur `https://animeclub.fr`.
5. Tester inscription/login/Animetheque avec le compte test fourni.
6. Poster le message Discord soft launch sans mention globale.
7. Corriger les bugs issus des premiers retours avant SEA.

## Checklist finale

- Site accessible: a verifier apres deploiement.
- Inscription fonctionne: a verifier avec compte/test prod autorise.
- Login fonctionne: a verifier avec compte test fourni.
- Ajout Animetheque fonctionne: a verifier sans compte jetable.
- Tracking present: code pret, GA4 desactive sans ID.
- Search Console prete: configuration documentaire prete.
- Sitemap accessible: fichier corrige.
- Robots accessible: fichier corrige.
- Pages privees noindex: regle dynamique corrigee.
- Page d'accueil claire: metas ameliorees; landing ajoutee.
- Message Discord pret: oui.
- Aucun bouton ne suggere du streaming: libelles CTA maintenus sur fiche, liste, progression, catalogue.
