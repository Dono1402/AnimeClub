# Audit securite AnimeClub - 2026-05-29

Portee: frontend Angular, backend Spring Boot, PostgreSQL, configuration VPS/Caddy, controles HTTP/TCP non destructifs sur `animeclub.fr`.

Limite importante: le risque zero n'existe pas. L'objectif realiste est de ramener l'exposition a un niveau tres bas, avec defense en profondeur, monitoring, sauvegardes et rotation de secrets.

## Synthese

Etat global: base saine pour un projet personnel en prod, avec authentification, Argon2id, sessions serveur hashees, CORS strict en prod, HSTS actif cote API, Postgres limite a localhost, et aucun port DB expose publiquement.

Priorites principales:

1. Ajouter les headers securite sur le HTML/static servi par Caddy, pas seulement sur `/api`.
2. Migrer les sessions `Authorization: Bearer` stockees en `localStorage/sessionStorage` vers cookies `HttpOnly; Secure; SameSite`.
3. Hasher les tokens de confirmation/reset email en base, comme les tokens de session.
4. Fermer ou authentifier les endpoints de statut d'import catalogue.
5. Ajouter un rate limit sur la telemetrie frontend et les flows password reset/Discord.
6. Faire ecouter le backend sur `127.0.0.1` uniquement.
7. Reduire les privileges du role applicatif Postgres.

## Correctifs appliques localement le 2026-05-30

Ces correctifs sont prepares en local uniquement. Aucun push et aucun deploiement production n'ont ete effectues.

- Sessions: passage frontend vers session applicative sans token JS, emission backend d'un cookie `HttpOnly; Secure; SameSite=Lax`, conservation de la compatibilite `Authorization: Bearer` pour transition.
- CSRF: ajout d'un controle d'origine sur les requetes mutatrices via `Origin`/`Referer`, configure par `ORIGIN_CHECK_ENABLED`.
- Tokens sensibles: hash des tokens de confirmation e-mail et reset password avant stockage DB, avec fallback legacy pour les liens deja emis.
- Rate-limit: ajout password reset, OAuth Discord et telemetrie frontend.
- Admin/import: endpoints de statut d'import catalogue proteges par `X-Admin-Token`.
- Uploads: retrait du GIF pour avatars/bannieres/messages, seuls JPEG/PNG/WebP restent acceptes.
- Headers/CSP: CSP backend sans localhost, durcissement Caddy ajoute dans les scripts utilisateur.
- Backend prod: `server.address` parametrable et force a `127.0.0.1` par les scripts.
- Routes inconnues: mapping propre en `404` pour les ressources API inexistantes.
- Pseudos: validation stricte `A-Za-z0-9_-`, 3 a 16 caracteres.
- DB: script SQL de durcissement du role runtime ajoute, a executer manuellement cote serveur.

## Constats critiques / hauts

### 1. Headers securite absents sur la page HTML principale

Preuve: `https://animeclub.fr` retourne `200 OK` avec `Server: Caddy`, mais sans `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, ni `Permissions-Policy`.

Les headers existent sur `/api/*`, car ils sont poses par `SecurityHeadersFilter`, mais le document Angular est servi directement par Caddy. Le navigateur applique surtout la CSP du document HTML, donc l'API protegee ne suffit pas.

Fix recommande: ajouter les headers globaux dans le bloc Caddy `animeclub.fr, www.animeclub.fr`.

Exemple:

```caddy
header {
  Strict-Transport-Security "max-age=31536000; includeSubDomains"
  X-Content-Type-Options "nosniff"
  X-Frame-Options "DENY"
  Referrer-Policy "strict-origin-when-cross-origin"
  Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)"
  Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://animeclub.fr https://api.jikan.moe https://graphql.anilist.co https://kitsu.io; frame-src https://www.youtube.com https://www.youtube-nocookie.com; media-src 'self' data: blob:"
}
```

Note: retirer `http://localhost:8080` et `http://127.0.0.1:8080` du CSP en prod.

### 2. Token de session lisible par JavaScript

Code: `apps/frontend/src/app/services/auth.service.ts` stocke `sessionToken` dans `localStorage` si "remember me", sinon `sessionStorage`. L'intercepteur le renvoie ensuite via `Authorization: Bearer`.

Impact: en cas de XSS, extension navigateur compromise, ou injection via dependance, le token peut etre vole et reutilise pendant 30 jours.

Fix recommande:

- backend: emettre un cookie `HttpOnly; Secure; SameSite=Lax` ou `Strict`;
- frontend: ne plus manipuler le token directement;
- backend: ajouter une protection CSRF si cookies et endpoints mutateurs;
- conserver la table `account_session` avec hash de token serveur.

### 3. Tokens email/reset stockes en clair en DB

Code: `Compte.emailConfirmationToken` et `Compte.passwordResetToken` stockent les tokens bruts. Les sessions sont deja hashees dans `account_session`, ce qui est le bon modele.

Preuve DB prod: `password_reset_tokens_present=2`, `email_tokens_present=0`.

Impact: une lecture DB permet d'utiliser directement les liens de reset encore valides.

Fix recommande: stocker `SHA-256(token + pepper)` ou HMAC serveur, puis rechercher par hash. Nettoyer aussi les tokens expires via job planifie.

## Constats moyens

### 4. Endpoints d'import status publics

Preuve:

- `/api/anime-catalog/import/status` retourne les compteurs catalogue.
- `/api/character-catalog/import/status` retourne les compteurs catalogue, mode, erreurs, et progression.

Impact: fuite d'informations operationnelles. Si `lastError` contient un jour un detail interne, il sera public.

Fix recommande: proteger ces endpoints avec `X-Admin-Token`, ou exposer une version publique minimale sans `lastError`.

### 5. Backend ecoute sur toutes les interfaces

Preuve VPS: `java` ecoute sur `*:8080`. Le port n'est pas ouvert publiquement depuis Internet lors du scan, mais le process devrait ecouter uniquement `127.0.0.1` puisque Caddy reverse-proxy vers `127.0.0.1:8080`.

Fix recommande: ajouter `SERVER_ADDRESS=127.0.0.1` ou `server.address=${SERVER_ADDRESS:127.0.0.1}`.

### 6. Role Postgres applicatif proprietaire de la DB

Preuve: `database_owner=animeclub_app`.

Impact: l'application a plus de privileges que necessaire en runtime. En cas de RCE ou injection logique, le blast radius est plus large.

Fix recommande:

- role `animeclub_owner` pour migrations/schema;
- role `animeclub_app` runtime avec `SELECT, INSERT, UPDATE, DELETE` uniquement;
- retirer `TRUNCATE`, ownership, DDL au role runtime.

### 7. Rate limit incomplet

Code: `SimpleRateLimitFilter` couvre login, creation compte, changement email de validation, messages, follow, bibliotheques, catalogues et traduction.

Manques:

- `/account/password-reset/request`
- `/account/password-reset/confirm`
- `/account/oauth/discord/login`
- `/account/oauth/discord/signup`
- `/telemetry/frontend`
- endpoints publics de suggestions/recherche selon trafic

Fix recommande: ajouter ces routes au filtre et envisager Redis si plusieurs instances.

### 8. Rate limit base sur `X-Forwarded-For`

Code: `SimpleRateLimitFilter.clientIp()` prend le premier `X-Forwarded-For`.

Impact: si l'application etait joignable directement, un client pourrait spoof l'IP et contourner le rate-limit. Aujourd'hui, 8080 n'est pas ouvert publiquement, mais le backend ecoute sur `*`.

Fix recommande:

- faire ecouter le backend en localhost;
- ne faire confiance aux headers proxy que venant de Caddy;
- sinon utiliser `request.getRemoteAddr()`.

### 9. Telemetrie frontend publique et a cardinalite controlable

Code: `/telemetry/frontend` est public et cree des compteurs Micrometer avec tags venant du client (`route`, `endpoint`, `name`, `message`), limites en longueur mais pas en cardinalite globale.

Impact: spam de metriques et consommation memoire possible.

Fix recommande: rate-limit, liste blanche des types/valeurs, bucketisation stricte, ou desactiver l'endpoint public en prod si inutile.

### 10. Routes `/api/*` inconnues retournent `500`

Preuve: `/api/.env`, `/api/swagger-ui/index.html`, `/api/actuator/env`, `/api/actuator/metrics`, `/api/actuator/prometheus` retournent `500` generique au lieu de `404` ou `403`.

Impact: pas de fuite directe vue, mais mauvais signal et logs inutiles.

Fix recommande: handler `NoResourceFoundException` / `NoHandlerFoundException` vers `404`, et proteger explicitement `/actuator/**` sauf `/actuator/health`.

## Constats bas / hygiene

### 11. Pseudos pas assez normalises

Les DTO limitent la taille a 16 caracteres, mais pas de pattern strict pour les pseudos de creation standard.

Fix recommande: imposer `^[A-Za-z0-9_-]{3,16}$` ou equivalent Unicode controle, et normaliser en backend.

### 12. GIF autorise en upload

Images profile/messages acceptent JPEG/PNG/WebP/GIF, avec verification magic bytes. Correct, mais les GIF peuvent etre lourds et animes.

Fix recommande: accepter PNG/JPEG/WebP seulement pour avatar/banniere, ou transcoder et redimensionner cote serveur.

### 13. Fallback SPA retourne 200 sur chemins sensibles inexistants

Preuve: `/.env`, `/.git/config`, `/phpmyadmin/` retournent le HTML Angular. Pas de fuite de fichier constatee.

Fix recommande: dans Caddy, retourner `404` pour chemins sensibles avant `try_files`.

### 14. Config env avec doublons

`APP_FRONTEND_URL`, `EMAIL_CONFIRMATION_EXPOSE_LINK`, `MAIL_HEALTH_ENABLED` apparaissent plusieurs fois dans `/etc/animeclub/backend.env`.

Fix recommande: nettoyer le fichier pour eviter les surprises de precedence.

## Points positifs verifies

- `npm audit --audit-level=moderate`: 0 vulnerabilite.
- Tests backend: 81 tests OK.
- Build frontend: OK.
- CORS prod strict: `https://animeclub.fr` autorise, `https://evil.example` et `http://localhost:4200` rejetes.
- API admin `/api/account/public`: `403` sans token.
- Endpoints compte proteges: `/api/account/1`, `/api/account/1/messages`: `401` sans token.
- SSRF image-color mitige: `http://127.0.0.1` rejete avec `400 Image non autorisee`.
- Postgres ecoute en `localhost`, pas expose publiquement.
- Port scan externe: `22`, `80`, `443`, plus ports WotLK `3724`, `4000`.
- Sessions serveur stockees en hash SHA-256 dans `account_session`, pas de colonne token brute.
- Upload images: taille limitee, type declare controle, magic bytes verifies.
- Secrets prod non presents dans le repo d'apres scan local.
- Backups DB manuels dans `/home/debian/animeclub-db-backups` en `700/600`.

## Actions recommandees par ordre

1. Caddy: ajouter headers securite globaux + 404 explicites pour chemins sensibles.
2. Backend: basculer sessions vers cookies HttpOnly + CSRF.
3. Backend/DB: hasher tokens email/reset et nettoyer les tokens expires.
4. Backend: proteger ou reduire les endpoints `/import/status`.
5. Backend: `SERVER_ADDRESS=127.0.0.1`.
6. Backend: ajouter rate-limit sur reset password, Discord OAuth, telemetrie.
7. DB: creer un role runtime non owner.
8. Backend: corriger 404/403 pour routes inconnues/actuator.
9. Front/backend: pattern strict pseudo.
10. Ops: installer un job d'audit dependances backend avec cle NVD ou OSV/Trivy.

## Commandes executees

- `npm audit --audit-level=moderate --json`
- `npm run build`
- `mvnw test`
- OWASP Dependency-Check Maven, bloque par NVD `429`
- Probes HTTP `curl` sur headers, auth, actuator, import status, SSRF image-color
- Scan TCP externe ports courants
- Inspection VPS via SSH: `ss`, Caddyfile, systemd, Postgres, env keys sans secrets
- Scan local de secrets dans le repo

## Non effectue

- Pas de brute-force de mots de passe.
- Pas de test destructif de charge/DoS.
- Pas d'exploitation active.
- Pas de push.
- Pas de deploiement.
