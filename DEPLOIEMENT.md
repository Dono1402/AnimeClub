# AnimeClub - Deploiement

Point d'entree principal :

```powershell
C:\Users\Dono\Documents\Scripts\AnimeClub.cmd
```

Structure locale du site :

```text
C:\Codex\AnimeClub
├── apps\backend
├── apps\frontend
├── docs
└── deploy
```

Commande directe du site, si besoin :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Dono\Documents\Scripts\deploy-prod.ps1" -Target Site
```

Build local sans upload serveur :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Dono\Documents\Scripts\deploy-prod.ps1" -Target Site -NoRemote
```

Le deploiement AnimeClub concerne uniquement le site :

```text
apps\backend   -> backend Java/Spring
apps\frontend  -> frontend Angular
```

Le bot Discord Aniko doit rester separe et aura son propre depot Git.

Sur le VPS, les secrets restent hors repo :

```text
/etc/animeclub/backend.env
```

Variables utiles pour Discord OAuth cote site :

```env
DISCORD_OAUTH_CLIENT_ID=identifiant_application_discord
DISCORD_OAUTH_CLIENT_SECRET=secret_oauth_discord
APP_FRONTEND_URL=https://animeclub.fr
```

Dans le portail Discord Developer, les URLs de redirection a declarer sont :

```text
https://animeclub.fr/auth/discord/callback
http://127.0.0.1:4200/auth/discord/callback
```

Le script utilise automatiquement la cle :

```powershell
C:\Users\Dono\.ssh\animeclub_deploy_ed25519
```
