# Copy landing / accueil

Route dediee: `/landing`
Fallback possible: reprendre ces blocs sur l'accueil sans changer la route `/`.

## Structure retenue

La page `/landing` utilise trois panneaux plein écran en navigation horizontale:

1. Hero Animethèque.
2. Communauté.
3. Profil et listes.

La molette fait passer d'une section à l'autre vers la droite avec `scroll-snap` horizontal. Une navigation discrète à droite permet aussi de changer de section. Chaque panneau anime son contenu pendant la transition.

## Section 1 - Hero Animethèque

Promesse principale:

> Crée ton Animethèque et ne perds plus jamais le fil de tes animes.

Sous-titre:

> AnimeClub t'aide à organiser ta collection, suivre ta progression, découvrir de nouveaux animes et partager avec une communauté de passionnés.

CTA principal:

> Créer mon compte

CTA secondaire:

> Explorer le catalogue

Blocs visibles:

- Suivi des épisodes: mets à jour ta progression épisode par épisode, saison par saison.
- Animethèque personnelle: centralise tes séries, films, OVA, favoris, notes et statuts.
- Catalogue: nombre d'animes référencés.
- Communauté: preuve sociale et invitation à rejoindre les premiers membres.

## Section 2 - Communauté

Promesse:

> Découvre ce que ta communauté ajoute.

Sous-titre:

> Partage ta passion, suis tes amis, échange des avis et enrichis ton expérience chaque jour.

Blocs visibles:

- Profils publics: partage tes listes et découvre les collections des autres membres.
- Feed social: vois les ajouts et mises à jour des profils que tu suis.
- Favoris et notes: garde tes coups de coeur et tes avis au même endroit.

## Section 3 - Profil

Promesse:

> Ton profil, tes listes, ta communauté.

Sous-titre:

> AnimeClub, c'est ton espace personnel pour suivre tes aventures, partager tes passions et échanger avec des fans comme toi.

Blocs visibles:

- Profil public.
- Badges récents.
- Favoris.
- Mangathèque: organise aussi tes mangas, volumes, lectures et favoris.

## Visuels

- Capture Animethèque.
- Capture fiche anime.
- Capture profil public.
- Capture catalogue anime.
- Capture feed suivis.
- Capture mobile.
- Fond landing anime/sakura existant: `assets/auth/signup-background.png`.

## Preuve sociale

- `Rejoins des milliers de passionnés.`
- `Rejoins les premiers membres AnimeClub dès maintenant.`

## Formulations interdites

Ne pas utiliser comme CTA ou promesse:

- Regarder
- Play
- Streaming
- Lancer l'épisode
- Reprendre la lecture

Formulations preferees:

- Voir la fiche
- Ajouter à mon Animethèque
- Mettre à jour ma progression
- Marquer comme vu
- Voir les épisodes
- Voir ma liste
- Ajouter aussi
- Découvrir
