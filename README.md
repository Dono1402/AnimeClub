# AnimeClub Site

Monorepo du site AnimeClub.

## Structure

```text
apps/backend   Backend Java/Spring
apps/frontend  Frontend Angular
docs           Documentation projet
deploy         Releases locales generees, non versionnees
```

Le bot Discord Aniko est volontairement separe et doit avoir son propre depot.

## Commandes locales

Backend :

```powershell
cd C:\Codex\AnimeClub\apps\backend
.\mvnw.cmd clean package
```

Frontend :

```powershell
cd C:\Codex\AnimeClub\apps\frontend
npm install
npm run build
```

Build complet sans deployer :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Dono\Documents\Scripts\deploy-prod.ps1" -Target Site -NoRemote
```

Deploiement production :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Dono\Documents\Scripts\deploy-prod.ps1" -Target Site
```

## Secrets

Les secrets de production ne doivent jamais etre versionnes. Sur Atlas, ils restent dans :

```text
/etc/animeclub/backend.env
```
