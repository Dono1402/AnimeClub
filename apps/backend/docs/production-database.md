# Base de donnees production AnimeClub

## Choix recommande

Pour la mise en ligne, utiliser une base PostgreSQL managee en region Europe.

Option recommandee pour AnimeClub :
- Scaleway Managed PostgreSQL si la priorite est l'hebergement EU/RGPD avec backups manages.
- Neon ou Supabase peuvent convenir pour un demarrage rapide, mais eviter le plan gratuit pour la production si les backups automatiques, la retention ou les limites ne couvrent pas le besoin.
- PostgreSQL auto-heberge sur le VPS est possible, mais demande de gerer soi-meme mises a jour, monitoring, sauvegardes et restauration. A reserver au budget tres contraint.

Le backend AnimeClub est deja compatible avec une base distante via les variables :

```env
DB_URL=jdbc:postgresql://<host>:5432/animeclub?sslmode=require
DB_USERNAME=<database_user>
DB_PASSWORD=
JPA_DDL_AUTO=validate
SQL_INIT_MODE=never
```

Ne pas mettre de mot de passe reel dans un fichier versionne. Injecter `DB_PASSWORD` via les secrets du provider, du service manager ou de l'environnement serveur.

## Regles production

- Utiliser le profil principal, pas `application-local.properties`.
- Garder `JPA_DDL_AUTO=validate` en production.
- Garder `SQL_INIT_MODE=never` en production.
- Activer TLS cote base avec `sslmode=require`, ou `sslmode=verify-full` si le certificat CA du provider est installe.
- Restreindre les connexions PostgreSQL a l'IP du backend si le provider le permet.
- Creer un utilisateur applicatif dedie, non superuser.
- Activer les backups automatiques du provider.
- Ajouter un backup exporte regulierement hors provider si possible.

## Conversion d'URL provider

Certains providers donnent une URL de ce type :

```text
postgresql://user:password@host.example:5432/animeclub?sslmode=require
```

Spring attend ici une URL JDBC :

```text
jdbc:postgresql://host.example:5432/animeclub?sslmode=require
```

Il faut donc mettre :

```env
DB_URL=jdbc:postgresql://host.example:5432/animeclub?sslmode=require
DB_USERNAME=user
DB_PASSWORD=
```

## Migration depuis la base locale

Depuis la machine locale ou le serveur ou PostgreSQL local existe :

```powershell
New-Item -ItemType Directory -Force C:\Codex\AnimeClub\backups
pg_dump -h 127.0.0.1 -p 5432 -U animeclub -d animeclub -Fc -f C:\Codex\AnimeClub\backups\animeclub-preprod.dump
```

Restaurer vers la base en ligne :

```powershell
pg_restore --clean --if-exists --no-owner --no-privileges -h <remote-host> -p 5432 -U <remote-user> -d <remote-db> C:\Codex\AnimeClub\backups\animeclub-preprod.dump
```

Si le provider impose TLS via les variables PostgreSQL :

```powershell
$env:PGSSLMODE = "require"
pg_restore --clean --if-exists --no-owner --no-privileges -h <remote-host> -p 5432 -U <remote-user> -d <remote-db> C:\Codex\AnimeClub\backups\animeclub-preprod.dump
```

## Verification apres migration

Demarrer le backend avec les variables de production, puis verifier :

```powershell
Invoke-RestMethod http://127.0.0.1:8080/actuator/health
```

Parcours minimum a tester :

1. Inscription.
2. Connexion.
3. Ouverture du catalogue animes.
4. Ajout a l'Animetheque.
5. Mise a jour de progression.
6. Deconnexion.
7. Verification que les pages privees redirigent vers login.

## Sauvegarde recurrente minimale

Conserver au moins :

- backups automatiques provider actives ;
- un dump `pg_dump -Fc` avant chaque deploiement ;
- une verification periodique de restauration sur une base de test ;
- retention separee des logs applicatifs et des dumps base.

Les dumps ne doivent jamais etre commits dans le repo.
