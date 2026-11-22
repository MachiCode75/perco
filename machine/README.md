# Machine à vidéos : histoire → vidéo « style Roblox »

Tu m'envoies une histoire, la machine sort une vidéo verticale fabriquée comme le reel de référence :

- personnages en blocs façon Roblox et petite ville au bord d'un lac ;
- un plan toutes les 1,2 s environ (140 plans en 2 min 50), coupes sèches, léger zoom continu sur chaque plan ;
- plans « vue à travers des jumelles » ;
- un seul narrateur calme, à la première personne ;
- sous-titres mot par mot et musique d'ambiance.

## Comment l'utiliser (toi)

1. Envoie-moi ton histoire (quelques lignes ou plusieurs paragraphes) dans une session Claude Code sur ce dépôt.
2. Précise si tu veux : la **langue** (anglais par défaut comme l'original, ou français), la **durée** (≈ 3 min par défaut), le type de voix.
3. Je fais le reste :
   - j'adapte l'histoire en narration (≈ 700 mots pour 2 min 50 : le narrateur du reel parle très vite) ;
   - je fais le découpage en plans (≈ 140 plans) ;
   - je vérifie un storyboard, je lance le rendu ;
   - je contrôle le résultat et je t'envoie le MP4.

Temps de fabrication : environ 30 à 45 min pour 3 minutes de vidéo (rendu 3D sur processeur).

## Ce que fait la machine (étapes)

| Étape | Outil | Résultat |
|---|---|---|
| 1. Script + découpage | Claude (skill `video-machine`) | `episodes/<id>/script.md`, `episodes/<id>/episode.json` |
| 2. Voix | `audio/tts.py` (Kokoro local gratuit, ou ElevenLabs) | narration + minutage de chaque mot |
| 3. Minutage des plans | `pipeline/timing.py` | chaque plan change au bon mot |
| 4. Musique | `audio/music.py` (générée, ou ton fichier) | nappe d'ambiance |
| 5. Rendu 3D | `engine/render.js` (three.js dans Chromium) | un clip par plan |
| 6. Montage | `post/assemble.py` | jumelles, sous-titres mot par mot, mixage, export 1080×1920 |
| 7. Contrôle | `post/qa.py` + planche contact | vérification durée, synchro, volume |

Commande unique : `python3 pipeline/make_video.py episodes/<id>/episode.json`

## Documentation

- `ARCHITECTURE.md` : contrats entre les modules (technique).
- `docs/01-reference-analysis.md` : analyse chiffrée du reel de référence.
- `docs/02-style-bible.md` : règles visuelles.
- `docs/03-writing-rules.md` : comment réécrire une histoire dans ce style.
- `docs/04-shotlist-rules.md` : comment découper en plans.
- `engine/`, `audio/`, `post/` : chaque module a son README.

## Limites connues

- Le rendu imite le look Roblox avec un moteur 3D maison. Ce ne sont pas les vrais assets Roblox, et c'est le style qui est reproduit, pas la copie exacte des décors.
- La voix locale gratuite (Kokoro) est correcte. Pour une voix plus naturelle, en français notamment, ElevenLabs est meilleur (clé API nécessaire).
- Les décors disponibles sont ceux de la bibliothèque (`data/vocab.json`). Un nouveau type de lieu demande d'ajouter un décor au moteur.
