# Audit prod sans changement de routes

Date: 2026-05-25
Domaine: https://animeclub.fr
Principe: aucune URL existante n'a ete renommee ou supprimee. Les redirections historiques restent conservees.

## Synthese

- Build front verifie avant audit: `npm.cmd run build` OK.
- Tests backend verifies avant audit: `JAVA_HOME=C:\Program Files\Java\jdk-25` puis `.\mvnw.cmd test` OK.
- Probleme critique trouve: les assets SEO statiques (`index.html`, `robots.txt`, `sitemap.xml`) utilisaient encore `animeclub.local`.
- Probleme visible trouve: `/landing` existait en prod comme route partageable mais redirigeait vers `/not-found`.
- Libelle a risque trouve: `A regarder` sur les fiches anime, remplace par `A voir`.

## Routes testees

| Route | Statut | Bug trouve | Correction appliquee | Risque | Recommandation sans changement d'URL |
|---|---:|---|---|---|---|
| `/` | OK | Metas statiques encore sur `animeclub.local` avant rendu Angular | Metas statiques et fallback SEO corriges vers `https://animeclub.fr` | Moyen | Garder `/` comme entree principale et mesurer les CTA inscription/catalogue |
| `/animes` | OK | Title/meta trop generiques | Fallback SEO catalogue anime ameliore | Faible | Conserver la route, optimiser les liens internes vers les fiches |
| `/animes/:id` | OK | Libelle visible `A regarder` sur le statut planifie | Remplace par `A voir`; tracking `anime_view` et ajout/progression prepare | Faible | Ne pas changer les slugs; garder les fiches comme pages SEO longues |
| `/personnages` | OK, redirige vers `/characters` | Aucun bug bloquant | Redirection conservee | Faible | Ne pas supprimer l'alias francais deja partage |
| `/personnages/:id` | OK, redirige vers `/characters/:id` | Aucun bug bloquant | Redirection conservee | Faible | Documenter `/characters/:id` comme canonical SEO |
| `/manga` | OK | Title/meta a clarifier | Fallback SEO catalogue manga ameliore | Faible | Garder `/manga` public et indexable |
| `/manga/:id` | OK | Title/meta dynamique a surveiller par contenu | Documente dans le plan SEO | Faible | Ne pas generer un sitemap massif tant que les URLs dynamiques ne sont pas decoupees |
| `/animetheque` | OK, redirige vers `/anime-library` puis login si non connecte | Page privee indexable pendant le rendu statique initial | Noindex dynamique confirme; alias ajoute aux chemins prives | Moyen | Garder la redirection, ne pas indexer les bibliotheques privees |
| `/mangatheque` | OK, redirige vers `/manga-library` puis login si non connecte | Meme risque que Animetheque | Noindex dynamique confirme; alias ajoute aux chemins prives | Moyen | Garder la redirection, presenter la valeur via accueil/landing |
| `/profil` | OK, redirige vers `/profile` puis login si non connecte | `/profile/:pseudo` ne devait pas etre traite comme prive SEO | Noindex limite a `/profile` exact; profils publics gardes indexables | Moyen | Conserver `/profil/:pseudo` comme alias partageable |
| `/messages` | OK, login requis | Page privee | Noindex dynamique conserve; robots bloque `/messages` | Faible | Ne jamais utiliser en landing Ads |
| `/suivis` | OK, redirige vers `/following` puis login si non connecte | Page privee | Alias ajoute aux chemins prives | Faible | Garder la redirection existante |
| `/login` | OK | Page d'auth pouvant etre indexee | Noindex dynamique et robots | Faible | Garder accessible, ne pas utiliser comme page d'acquisition |
| `/register` | OK | Page d'auth pouvant etre indexee | Noindex dynamique et robots; tracking `sign_up_start/complete` prepare | Faible | Utiliser comme cible CTA, pas comme page SEO |
| `/forgot-password` | OK | Page utilitaire privee | Noindex dynamique et robots | Faible | Aucun changement d'URL |
| `/reset-password` | OK | Page utilitaire privee | Noindex dynamique et robots | Faible | Aucun changement d'URL |
| `/landing` | KO avant correction | Redirection vers `/not-found` | Nouvelle page isolee ajoutee sans toucher aux routes principales | Moyen | Utiliser pour UTM Discord/Ads apres verification tracking |

## Points a reverifier apres deploiement

1. `https://animeclub.fr/robots.txt` doit afficher `Sitemap: https://animeclub.fr/sitemap.xml`.
2. `https://animeclub.fr/sitemap.xml` doit contenir `/`, `/animes`, `/manga`, `/characters`, `/landing`, pages legales.
3. `/landing` doit rester accessible en desktop et mobile.
4. Les pages privees doivent produire `robots=noindex,nofollow` apres rendu Angular.
5. Les tests mutatifs en prod doivent attendre le compte test fourni.
