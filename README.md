# AnimeClub

AnimeClub is a community web app for building and sharing personal anime and manga libraries.

It lets users create an account, track watch/read progress, manage favorites, browse anime and manga catalog entries, customize public profiles, exchange messages, and discover activity from other members. The repository contains the production website only: a Spring backend and an Angular frontend.

The Aniko Discord bot is intentionally kept in a separate repository.

## Repository Structure

```text
apps/backend   Java/Spring backend
apps/frontend  Angular frontend
docs           Project documentation
deploy         Local release packages, not versioned
```

## Local Commands

Backend:

```powershell
cd C:\Codex\AnimeClub\apps\backend
.\mvnw.cmd clean package
```

Frontend:

```powershell
cd C:\Codex\AnimeClub\apps\frontend
npm install
npm run build
```

Full local build without deploying:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Dono\Documents\Scripts\deploy-prod.ps1" -Target Site -NoRemote
```

Production deployment:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Dono\Documents\Scripts\deploy-prod.ps1" -Target Site
```

## Secrets

Production secrets must never be committed. On Atlas, they remain in:

```text
/etc/animeclub/backend.env
```
