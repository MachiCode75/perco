# Refaire ce reel « à l'identique » (sauf l'histoire) : analyse et boîte à outils

*Recherche du 21 novembre 2026. Reel de référence : `instagram.com/reel/Df8G4u5K67b`, analysé à partir du fichier vidéo envoyé.*

- **Partie A** : ce que montre vraiment la vidéo, et la recette exacte pour refaire pareil.
- **Partie B** : la voie « IA générative » (recherche faite avant d'avoir la vidéo), utile comme alternative ou en complément.

---

# Partie A : analyse du reel et recette exacte

## A1. Verdict : ce n'est pas de l'IA générative, c'est de l'animation 3D « Roblox »

Les personnages sont des **avatars Roblox R6**, en blocs, avec les visages Roblox classiques. Le décor est une petite ville au bord d'un lac, avec des maisons victoriennes colorées, un ponton et une église blanche. Plusieurs indices excluent un modèle vidéo IA :

- **Accessoires identiques d'un plan à l'autre** : la pancarte « HI ME! » puis « BYE ME », le chronomètre de Grandpa, les mêmes maisons. Une IA les déformerait au fil des 128 plans.
- **Les visages changent d'expression d'un coup** (sourire, inquiet, pleurs, cri) : on change l'autocollant du visage (*decal*), sans transition progressive.
- **Membres rigides**, cycle de marche Roblox standard, eau transparente type « Terrain » Roblox où l'on voit les personnages sous l'eau.

**Fabrication la plus probable** : décor et avatars dans **Roblox Studio**, animation avec le plugin **Moon Animator 2**. Le rendu est fait soit directement dans Studio (éclairage « Future »), soit après export vers **Blender**. Je ne peux pas trancher entre ces deux rendus, car les deux donnent ce look.

Donc les « modèles » à reproduire sont **des avatars Roblox**, pas un modèle d'IA.

## A2. Fiche technique mesurée sur la vidéo

| Élément | Mesure |
|---|---|
| Durée | **2 min 50** (170 s) |
| Format | 720×1280 (vertical 9:16), 30 images/s |
| Nombre de plans | **128 plans**, soit **1,3 s par plan** en moyenne (de 0,6 s à environ 5 s) |
| Transitions | presque uniquement des **coupes sèches** : nouvelle image à chaque morceau de phrase |
| Plans « jumelles » | environ **1 plan sur 5** : vue subjective à travers des jumelles (cache noir à deux cercles aux bords flous) |
| Narration | une seule voix, à la 1re personne (le garçon blond), **≈ 450–500 mots**, soit **≈ 165 mots/min** : débit soutenu, ton posé |
| Voix (estimation automatique) | voix plutôt claire / jeune (hauteur moyenne estimée vers 190 Hz). Je n'ai pas d'écoute ici, donc **je ne peux pas dire si c'est une voix humaine ou de synthèse** |
| Musique | **nappe continue** sous la voix (jamais de vrai silence), à volume bas |
| Sous-titres | **un mot à la fois**, centré à ~70 % de la hauteur, gras blanc avec contour noir et ombre. Quelques mots en couleur (jaune, bleu, rose) |

## A3. La grammaire des plans

- **Ouverture** : le narrateur de dos face au lac (plan par-dessus l'épaule). Le monde est posé en une image.
- **Plans d'ensemble** : vue aérienne du lac, rangées de maisons, ponton, église. Ils servent à rappeler le lieu.
- **Plans moyens face caméra** : les personnages regardent l'objectif, avec une petite action (salut, marche vers la caméra, pancarte brandie).
- **Gros plans sur les visages** pour les émotions. Le visage change au moment où la voix le dit.
- **Vue à travers les jumelles** : c'est le point de vue central de l'histoire. Souvent précédée d'un plan où quelqu'un lève les jumelles.
- **L'image illustre le mot prononcé** : « trébuche » montre quelqu'un qui trébuche, « chronomètre » un gros plan sur le chrono, « Noël » des guirlandes.
- **Le temps passe par la lumière et les saisons** : jour, crépuscule, nuit, neige.
- **Intérieurs chaleureux** (cuisine, salon avec cheminée) pour les scènes de famille.
- **Caméra simple** : fixe, ou léger travelling avant / dérive lente. Pas de mouvements compliqués.
- **Fin** : plans sous l'eau, pancarte qui flotte, jumelles abandonnées sur le ponton.

## A4. La structure du récit (à garder avec ta nouvelle histoire)

| Temps | Rôle dans l'histoire |
|---|---|
| 0–9 s | **Accroche** : la règle étrange du monde, en une phrase |
| 9–23 s | Trois exemples rapides et drôles de la règle |
| 23–33 s | Exemple personnel + **objet récurrent** introduit (la pancarte « HI ME! ») |
| 33–38 s | Premier détail qui cloche |
| 38–55 s | Le vieux qui sait (Grandpa) + **objet compteur** (chronomètre) : l'écart se réduit (un an → une semaine → un jour) |
| 55–75 s | **Escalade** : heures → minutes → secondes |
| 75–90 s | La ville réagit (le maire, rideaux fermés, Grandpa ne dort plus, phrase énigmatique) |
| 90–104 s | **Climax** : le chrono s'arrête, effet miroir à la même seconde |
| 104–117 s | **Retournement** qui change le sens de toute l'histoire |
| 117–135 s | Moment d'émotion en famille. L'objet récurrent revient, transformé (« BYE ME ») |
| 135–167 s | Fin sombre qui s'accélère |
| 167–170 s | **Image finale sans personnage** : l'objet récurrent seul (la pancarte qui flotte) |

**La formule** : une règle simple, un compteur qui descend, un objet qui ouvre et ferme l'histoire, un retournement, une image finale muette.

## A5. La recette exacte pour refaire pareil

### Étape 1 : script et découpage (Claude)
- Script d'environ **450 mots**, à la 1re personne, phrases courtes, sur la structure A4.
- **Shot list d'environ 125 plans** : un plan pour 2 à 4 mots, avec décor, personnages, expression du visage, cadrage, et les plans à faire « en jumelles ».

### Étape 2 : personnages et décor
- **Roblox Studio** (gratuit, PC/Mac).
- **Avatars R6** : un avatar par personnage (vêtements du catalogue ou de la Toolbox). Prévoir **plusieurs visages par personnage** (content, inquiet, pleure, crie) pour les changer pendant l'animation.
- **Décor** : une map de ville ou de quartier dans la Creator Store / Toolbox (recherches : « lake town », « suburban town », « victorian houses »), à adapter à ton histoire.
- **Accessoires** : jumelles, pancarte avec texte (SurfaceGui ou decal), chronomètre, selon ton histoire.
- **Lumière** : `Lighting.Technology = Future`, ombres douces. Change `ClockTime` pour le crépuscule et la nuit.

### Étape 3 : animation et caméra
- **Option courante** : **Moon Animator 2**, plugin Roblox Studio (environ 30 $ en achat unique selon des sources secondaires, à vérifier). Une timeline pour animer personnages, accessoires, caméra et changements de visage.
- **Option rendu plus beau** : export des avatars vers **Blender** (rigs R6 communautaires) et rendu Eevee/Cycles. Plus long à faire.
- **Caméra** : fixe ou lent travelling avant, champ de vision moyen (50–70°).
- **Capture** : fenêtre Studio en vertical + OBS, ou rendu image par image dans Blender.

### Étape 4 : voix
- Une seule voix de narrateur, calme et claire, à environ 165 mots/min. Ta propre voix ou une voix de synthèse.
- **ElevenLabs** : chercher dans la bibliothèque « young male narrator calm storytelling », ou créer une voix avec Voice Design à partir d'une description.
- **Astuce** : la synthèse ElevenLabs « avec horodatage » donne le temps de chaque mot. On en tire des sous-titres mot à mot parfaits et un découpage calé automatiquement sur la voix.

### Étape 5 : montage (CapCut, ou automatisé par Claude)
- **Coupe sèche** à chaque morceau de phrase (~1,3 s par plan).
- **Effet jumelles** : poser le cache fourni dans `recherche/assets/` (`jumelles_720x1280.png` ou `jumelles_1080x1920.png`, mesuré sur le reel) par-dessus le plan. Dans CapCut : superposition. Avec ffmpeg :
  ```
  ffmpeg -i plan.mp4 -i jumelles_1080x1920.png -filter_complex "[0:v]scale=1080:1920,setsar=1[v];[v][1:v]overlay=0:0" -c:a copy plan_jumelles.mp4
  ```
- **Sous-titres mot à mot** : CapCut → Sous-titres automatiques → style « un mot à la fois ». Police grasse blanche, contour noir, placée vers 70 % de la hauteur. Colore quelques mots-clés.
- **Musique** : nappe d'ambiance douce (piano, pads) qui devient inquiétante, nettement plus basse que la voix.
- **Export** : 1080×1920, 30 images/s.

### Étape 6 : ce que Claude peut piloter directement
Ces outils tournent sur **ton ordinateur** (Claude Code ou Claude Desktop), pas dans cette session cloud.

| Outil | Ce que Claude peut faire |
|---|---|
| **Roblox Studio : serveur MCP officiel intégré** (Assistant → menu « … » → Manage MCP Servers → « Enable Studio as MCP server ». Connexion rapide prévue pour Claude Code et Claude Desktop) | Construire et placer décor, personnages, accessoires et lumière. Écrire les scripts Luau (caméra de cinématique, changements de visage) |
| **Blender MCP** (communautaire `ahujasid/blender-mcp`. Un serveur officiel « Blender Lab » est annoncé pour Blender 5.1+, à vérifier) | Monter la scène, la caméra et lancer les rendus |
| **ElevenLabs** (MCP hébergé, voir Partie B) | Voix off + horodatage des mots |
| **Remotion** (plugin) ou **ffmpeg** | Montage automatique : coupes, cache jumelles, sous-titres mot à mot calés sur la voix |

> ⚠️ **Règles Roblox** : vérifie les conditions de Roblox si tu veux monétiser des vidéos faites avec ses avatars et ses assets.

## A6. Et la voie IA ?

C'est possible, mais déconseillé pour ce style : 128 plans avec les mêmes personnages, les mêmes accessoires lisibles et le même décor, c'est exactement là où l'IA dérive. La 3D Roblox est plus fiable, quasi gratuite, et c'est ce qu'utilise l'original. L'IA reste utile **en complément** : la voix, ou quelques plans difficiles à animer (une foule, par exemple). La Partie B détaille les outils.

---

# Partie B : la voie IA générative (recherche initiale)

*Cette partie a été écrite avant d'avoir la vidéo. Elle reste valable si tu veux un rendu IA plutôt que Roblox, ou pour la voix.*

## 1. La méthode en 6 étapes

Tous les reels IA de ce type suivent le même pipeline. Pour « refaire pareil », on copie chaque couche sauf le scénario :

| # | Étape | Ce qu'on copie du reel d'origine | Outils principaux |
|---|---|---|---|
| 1 | **Décortiquer** | Durée de chaque plan, type de plan, mouvement de caméra, transitions, rythme, voix | Gemini (analyse vidéo), Claude Code + ffmpeg (détection des coupes) |
| 2 | **Bible de style + personnages** | Style visuel (3D Pixar, réaliste, anime…), palette, lumière, design des persos | Nano Banana Pro, Seedream 4.5, Midjourney |
| 3 | **Images clés** (1 par plan) | Cadrage de chaque plan | Nano Banana Pro (fiches personnage + planche storyboard) |
| 4 | **Animation** (image → vidéo) | Mouvements, caméra, durée des plans | Kling 3.0, Veo 3.1, Seedance 2.5, Wan 3.0, Runway |
| 5 | **Voix + son** | Timbre, rythme, émotion de la voix off, musique, bruitages | ElevenLabs v3, MiniMax Speech, audio natif des modèles vidéo |
| 6 | **Montage** | Transitions, sous-titres animés, calage sur le beat | CapCut, Remotion (via Claude), ffmpeg, Descript |

---

## 2. Étape 1 : décortiquer le reel (reverse engineering)

C'est l'étape qui fait la différence entre « dans le même style » et « vraiment pareil ».

- **Gemini (app ou AI Studio)** : on uploade la vidéo et on demande une liste de plans horodatée (type de plan, mouvement de caméra, action, transition, ambiance). Fiable sur les clips courts. Sur les vidéos longues, mieux vaut découper en segments.
- **Claude Code + ffmpeg (ce que je peux faire ici dès que j'ai le fichier)** :
  - détection automatique des coupes → durée exacte de chaque plan et rythme de montage ;
  - extraction d'images clés → j'analyse style, cadrage, lumière et transitions plan par plan ;
  - extraction de la piste audio → séparation voix/musique, débit de parole, pauses.
- **Format de sortie conseillé** : une liste de plans (shot list) où chaque ligne = un prompt prêt à l'emploi :
  `[durée] [type de plan] [mouvement caméra] [sujet + action] [lumière/ambiance] [transition vers le plan suivant] [texte de voix off]`
- **Skills/plugins dédiés** : `viral-reverse-engineering` (plugin *Social Media Skills*), `viral-clone` et `clone-hook` (plugin *Arcads AI*), outil `detect_scenes` (connecteur *Cardboard*).

---

## 3. Les modèles vidéo (novembre 2026)

| Modèle | Points forts | Durée / qualité | Audio natif | Persos cohérents | Où l'utiliser |
|---|---|---|---|---|---|
| **Kling 3.0 / Omni** (Kuaishou) | Meilleur rapport qualité/prix, **multi-plans** dans un seul clip, en tête de plusieurs classements | Jusqu'à 15 s par génération | Oui : dialogues, **lip-sync** par personnage | **Elements** : un perso créé à partir d'images ou d'un clip, voix attachée (≥ 3 s d'audio) | App Kling, Higgsfield, fal, Freepik, Pollo… |
| **Veo 3.1** (Google) | Rendu le plus « cinéma », dialogues propres | Clips de 8 s, extensibles (Extend) jusqu'à 1 min et plus | Oui | **Ingredients** (plusieurs images de référence), **Frames to Video** (première + dernière image) | Google Flow, Gemini API, Vertex, Higgsfield, fal |
| **Gemini Omni Flash** (Google, sorti en mai 2026) | Toute entrée (texte, image, audio, vidéo) → vidéo, **retouche en conversation** | 10 s | Oui | Via images de référence | App Gemini, Flow, YouTube Shorts |
| **Seedance 2.5** (ByteDance) | **30 s multi-plans en une passe**, énormément de références | 30 s, extensible | Oui, toujours. Peut **se caler sur un audio fourni** (voix off, beat) | Jusqu'à 30 images + 10 vidéos + 10 audios de référence (`[Image1]`, `[Audio1]` dans le prompt) | Replicate, Together, Jimeng/Dreamina, plugin Creative Claw |
| **Wan 3.0** (Alibaba) | 30 s, très bien classé avec audio | 30 s en 1080p | Oui, lip-sync multilingue | Références image | fal, Alibaba Model Studio. Fermé (Wan 2.2 reste open-source pour du local) |
| **Runway Gen-4.5 + Aleph 2.0 + Act-Two** | **Aleph** = retoucher une vidéo existante. **Act-Two** = tu joues la scène, le perso IA copie tes gestes et expressions | Variable | Partiel | Références | Runway, API Runway Dev |
| **MiniMax Hailuo** | Bon marché, mouvements dynamiques | 6–10 s, 768p/1080p | Non (voix via MiniMax Speech) | Référence sujet | MiniMax MCP, Higgsfield |
| ~~Sora~~ | **OpenAI a annoncé l'arrêt de Sora le 24 mars 2026**, à éviter | — | — | — | — |

**Images (étapes 2–3)** :
- **Nano Banana Pro** (Google) : fiches personnage, vues multi-angles, planches storyboard. Plusieurs images de référence par génération (le nombre maximum varie selon les sources).
- **Seedream 4.5** (ByteDance) : réputé plus constant que Nano Banana Pro pour garder un perso et un style anime d'une image à l'autre.
- **Midjourney** : pour un look artistique très marqué.
- **Flux** : polyvalent, disponible partout (fal, Replicate).

**Règle d'or pour la cohérence** : chaque plan part d'une **image clé générée à partir de la même fiche personnage**, en haute résolution. Une image basse résolution pousse les modèles vidéo à inventer, d'où des visages qui se déforment.

---

## 4. Recettes selon le type de reel

Choisis la ligne qui correspond au reel (ou envoie-le-moi et je tranche) :

| Type de reel | Images | Animation | Voix | Montage |
|---|---|---|---|---|
| **A. Conte narré en 3D façon Pixar** (voix off, persos mignons) | Nano Banana Pro (fiche perso 3D) | Kling 3.0 ou Seedance 2.5 (image → vidéo) | ElevenLabs v3, voix de narrateur | CapCut + sous-titres animés |
| **B. Personnages qui parlent à l'écran** (lip-sync, dialogue) | Nano Banana Pro | Veo 3.1 ou Kling 3.0 (dialogue natif). Ou Seedance 2.5 avec la voix fournie en audio de référence | Audio natif, ou ElevenLabs puis lip-sync | CapCut |
| **C. Cinématique réaliste** (historique, POV, documentaire) | Nano Banana Pro / Midjourney | Veo 3.1 (qualité) ou Kling 3.0 (prix). Vocabulaire de caméra précis | ElevenLabs, voix grave de documentaire | Coupes sur le beat, musique épique |
| **D. Anime / 2D** | Seedream 4.5, Midjourney | Kling 3.0, Wan 3.0 | ElevenLabs / MiniMax | CapCut |
| **E. Plein de transitions** (morphing, raccords fluides) | Images clés pensées par paires | **Première + dernière image** (Kling, Veo Frames to Video), presets de transition Higgsfield | — | Enchaînement sans coupe visible |
| **F. Texte animé / motion design** | — | Remotion, HyperFrames (HeyGen), Stewdio | ElevenLabs | Généré par code |

---

## 5. Plans et mouvements de caméra : le vocabulaire des prompts

Pour reproduire les mêmes plans, il faut les nommer dans le prompt (en anglais, les modèles comprennent mieux) :

- **Cadrage** : extreme close-up, close-up, medium shot, wide shot, establishing shot, over-the-shoulder, low angle, high angle, bird's-eye, POV.
- **Mouvements** : dolly in/out, push-in, pull-back, orbit/arc shot, crane up/down, tracking shot, handheld, FPV drone, crash zoom, dolly zoom (effet Vertigo), whip pan, rack focus, static locked-off.
- **Optique / lumière** : 35mm/85mm lens, shallow depth of field, golden hour, rim light, backlit, volumetric light, soft diffused light.

**Modèle de prompt par plan** :
```
[Shot 3 – 2.5s] Close-up, slow push-in. The small fox looks up at the falling snow,
eyes widening. Soft blue twilight, rim light, shallow depth of field.
Pixar-style 3D animation. Ends on her face (match cut to Shot 4).
```
Le plugin *Cinematic AI Video Maker* (ManyMotions) propose 61 mouvements de caméra nommés, à choisir dans une liste (Veo, Kling, Seedance ou Wan).

---

## 6. Transitions : comment on les obtient

1. **Coupe franche sur le beat** : la plus courante. On cale les coupes sur la musique au montage.
2. **Pont première/dernière image** : on donne au modèle la dernière image du plan A et la première du plan B, il génère le passage. Disponible dans Kling (start/end frame), Veo 3.1 (Frames to Video) et Higgsfield. Conseils : 5 s maximum, même lumière sur les deux images, images assez proches visuellement.
3. **Raccord (match cut)** : même composition d'un plan à l'autre (un œil → la lune, par exemple). On génère les deux images clés avec la même composition.
4. **Morphing** : presets de transition Higgsfield, ou start/end frame avec un prompt de transformation.
5. **Whip pan / zoom à travers un objet** : on le décrit dans le prompt (« whip pan to… », « camera flies through the keyhole into… »).
6. **Coupes générées par le modèle** : Kling 3.0 et Seedance 2.5 acceptent un prompt plan par plan (« Shot 1: … Shot 2: cut to close-up… ») et font les coupes eux-mêmes.
7. **Au montage** : CapCut (transitions et sous-titres animés), Remotion via Claude (montage par code, reproductible), ffmpeg `xfade` (fondus, glissements, zooms).

---

## 7. Voix, musique et bruitages

**Voix off**
- **ElevenLabs** : la référence pour les reels.
  - Modèle **Eleven v3** : balises d'émotion dans le texte (`[whispering]`, `[excited]`, `[sad]`…), idéal pour une narration vivante.
  - **Voice Library** : des milliers de voix. La plupart des voix de narrateurs viraux en viennent, on cherche par description.
  - **Voice Design** : on crée une voix à partir d'une description (« voix masculine grave, rauque, rythme lent, ton mystérieux »).
  - **MCP hébergé** : `https://api.elevenlabs.io/v1/mcp` (parole, voice design, et aussi image/vidéo selon la doc). L'ancien serveur local GitHub est déprécié.
- **MiniMax Speech** (via MiniMax MCP) : synthèse, clonage, `voice_design`.
- **Audio natif** : Veo 3.1, Kling 3.0, Seedance 2.5 et Wan 3.0 génèrent dialogues et ambiance avec l'image.

> ⚠️ **Droit à la voix** : reproduire *le type* de voix (timbre, rythme, émotion) est OK. **Cloner la voix réelle du créateur** sans son accord ne l'est pas. On passe par Voice Library ou Voice Design pour obtenir une voix très proche.

**Musique / bruitages** : Suno, Mureka (dans Creative Claw), ElevenLabs Music et SFX, MiniMax Music, catalogue Splice (connecteur).

---

## 8. Ce qui existe dans Claude

### 8a. Plugins (répertoire Anthropic, installables sur ton compte)

| Plugin | Ce qu'il apporte | Pertinence |
|---|---|---|
| **Creative Claw** | Tout-en-un : Nano Banana, Seedance, Gemini Omni, voix off et clonage ElevenLabs, musique Mureka, bruitages, **persos cohérents**, **films multi-plans**, création de reels. Skills : `plan-video`, `create-character`, `build-film`, `generate-voiceover`, `create-reels`… Nécessite un compte Creative Claw | ★★★ Le plus complet pour ton besoin |
| **Social Media Skills** | 106 skills, dont `viral-reverse-engineering`, `kling`, `veo-3`, `runway`, `luma`, `nano-banana`, `flux`, `suno`, `heygen`, `capcut`, `ai-voiceover`, `reels-script`, `storytelling-and-narrative`, `scripting-and-storyboarding` | ★★★ Le « savoir-faire » pour bien prompter chaque outil |
| **Cinematic AI Video Maker** (ManyMotions) | 61 mouvements de caméra nommés + plan, lumière, look. Rendu Veo, Kling, Seedance ou Wan | ★★ Pour coller aux plans d'origine |
| **Arcads AI** | Skills `viral-clone`, `clone-hook`, `pixar-ad`, `image-to-motion`, `cinematic-ads`, `fpv-drone-path`, `media-router` | ★★ Orienté pub, mais `viral-clone` sert directement |
| **CellCog** | Génération image, vidéo, musique, audio, 3D depuis Claude | ★ Alternative généraliste |
| **Remotion** | Montage vidéo par code (React) : animations, sous-titres, audio, rendu | ★★ Montage final reproductible |
| **video-shotcraft** | Recettes de plans cinématiques avec Remotion | ★ |
| **ffmpeg-llm** | Commandes ffmpeg précises (découpe, transitions, analyse) | ★ |
| **image-generation** | Guide de prompting pour Imagen, Gemini Image, Flux, Midjourney… | ★ |

### 8b. Connecteurs du répertoire claude.ai

| Connecteur | Usage |
|---|---|
| **Descript** | Importer, monter, créer une vidéo par prompt |
| **Canva** | Designs, miniatures, montages simples |
| **Adobe** | Outils pro Adobe, dont `animate_design` |
| **HyperFrames by HeyGen** | Motion graphics et slides animées en HTML → rendu vidéo |
| **Picsart Media Studio** | Presets de mouvement, animations de texte, templates de scène, looks, effets |
| **Cardboard** | Montage dans le chat : découpe, titres, sous-titres, **détection de scènes** |
| **AI Producer by OpusClip** | Sous-titres, B-roll, amélioration de la voix |
| **Stewdio** | Motion graphics et animations décrites à Claude |
| **Splice** | Catalogue de sons et musique |

*(Le connecteur « ElevenLabs » du répertoire ne gère que les agents vocaux. Pour la synthèse vocale, utilise le MCP hébergé de la section 8c.)*

### 8c. Connecteurs personnalisés (ajout par URL : Paramètres → Connecteurs → Ajouter un connecteur personnalisé)

| Service | URL / commande | Ce que ça donne |
|---|---|---|
| **fal** (officiel) | `https://mcp.fal.ai/mcp-relay` (connexion dans le navigateur) | Plus de 1 000 modèles : Kling 3, Veo, Wan 3, Flux… à la consommation |
| **Replicate** (officiel) | `https://mcp.replicate.com/sse` (avec un token API) | Seedance 2.5, Veo 3.1, Wan, Flux… à la consommation |
| **Higgsfield** (officiel) | `https://mcp.higgsfield.ai/mcp` (abonnement Higgsfield payant) | Soul, Cinema Studio, Kling, Veo, Hailuo, Seedream, Flux + presets de transition |
| **ElevenLabs** (officiel, hébergé) | `https://api.elevenlabs.io/v1/mcp` | Voix off, voice design, bibliothèque de voix |
| **MiniMax** (officiel, local) | `uvx minimax-mcp` (Claude Desktop) | Hailuo vidéo, voix, clonage, musique |
| Kling (**non officiel**) | ex. AceDataCloud `https://kling.mcp.acedata.cloud/mcp` | Kling sans passer par l'app. Pas de MCP officiel Kling trouvé |

En Claude Code : `claude mcp add --transport http --scope user fal https://mcp.fal.ai/mcp-relay` (même logique pour les autres).

---

## 9. Mes recommandations : 3 configurations

| | Config 1 : « tout dans Claude » | Config 2 : « qualité créateur » | Config 3 : « API, flexible, au plus bas coût » |
|---|---|---|---|
| **Pour qui** | Aller vite, peu de réglages | Le rendu le plus proche des reels viraux | Contrôle total, payer à l'usage |
| **Analyse** | Skill `viral-reverse-engineering` | Gemini + Claude (shot list) | Claude Code + ffmpeg + Gemini |
| **Images** | Creative Claw (Nano Banana) | Higgsfield (Soul / Nano Banana) | fal ou Replicate (Nano Banana, Flux, Seedream) |
| **Vidéo** | Creative Claw (Seedance / Omni) | Higgsfield (Kling 3.0, Veo 3.1) + presets de transition | fal (Kling 3, Wan 3) + Replicate (Seedance 2.5) |
| **Voix** | Creative Claw (ElevenLabs) | ElevenLabs (v3 + Voice Library) | MCP ElevenLabs |
| **Montage** | Creative Claw / CapCut | CapCut | Remotion ou ffmpeg via Claude Code |
| **Coût** | Abonnement Creative Claw | Abonnements Higgsfield + ElevenLabs | Au clip (Kling ≈ 0,11 $/s, Veo 3.1 0,05–0,40 $/s selon la version : prix indicatifs) |

**Mon choix par défaut** : **config 2** pour le rendu, avec les skills *Social Media Skills* pour les prompts. **Kling 3.0** donne le meilleur rapport qualité/prix. **Seedance 2.5** est le meilleur choix si la vidéo est longue et pilotée par la voix off (on lui donne la narration en audio de référence et il cale l'image dessus).

---

## 10. Prochaines étapes

1. **Donne-moi l'idée de ta nouvelle histoire**, même en deux lignes. J'écris le script d'environ 450 mots sur la structure A4 et la shot list d'environ 125 plans au même rythme, avec les plans « jumelles », les visages et les décors.
2. **Si tu as Roblox Studio sur ton ordinateur** : active son serveur MCP et connecte Claude Code ou Claude Desktop. Claude peut alors construire la scène et les plans avec toi.
3. **Montage** : avec la voix et les plans enregistrés, je peux automatiser les coupes, le cache jumelles et les sous-titres mot à mot (Remotion ou ffmpeg).

---

## Sources

- Roblox / animation 3D : [Roblox Studio MCP (doc officielle)](https://create.roblox.com/docs/studio/mcp) · [annonce DevForum](https://devforum.roblox.com/t/studio-mcp-server-updates-and-external-llm-support-for-assistant/4415631) · [Moon Animator : prix](https://thetoolstrunk.com/how-much-is-moon-animator/) · [rig R6 IK/FK pour Blender](https://devforum.roblox.com/t/r6-ik-fk-blender-rig-v222/3586405) · [importer un avatar Roblox dans Blender](https://www.katsbits.com/codex/?p=10600) · [Blender MCP](https://github.com/ahujasid/blender-mcp) · [guide Blender MCP (Meshy)](https://www.meshy.ai/tutorials/blender-mcp-guide)
- Modèles et classements : [MarkTechPost, nov. 2026](https://www.marktechpost.com/2026/11/13/best-ai-video-generation-models-2026/) · [teamday.ai](https://www.teamday.ai/blog/best-ai-video-models-2026) · [llm-stats](https://llm-stats.com/leaderboards/best-ai-for-video-creation) · [videogen.io](https://videogen.io/best-ai-video-models)
- Kling 3.0 : [guide officiel Kling](https://kling.ai/blog/kling-video-3-0-ai-director-features-guide) · [Kling 3.0 Omni user guide](https://kling.ai/quickstart/klingai-video-3-omni-model-user-guide) · [CineD](https://www.cined.com/kling-3-0-ai-video-model-introduced-native-4k-)
- Seedance 2.5 : [blog ByteDance Seed](https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5) · [Replicate](https://replicate.com/bytedance/seedance-2.5) · [Together AI](https://docs.together.ai/docs/seedance2.5-quickstart)
- Veo 3.1 / Flow : [Google blog](https://blog.google/technology/ai/veo-updates-flow/) · [Google Developers](https://developers.googleblog.com/en/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/) · [aide Flow](https://support.google.com/flow/answer/16352836)
- Gemini Omni : [Google blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni/) · [TechCrunch](https://techcrunch.com/2026/05/19/googles-gemini-omni-turns-images-audio-and-text-into-video-and-thats-just-the-start/)
- Wan 3.0 : [The Decoder](https://the-decoder.com/alibabas-wan3-0-generates-ai-videos-up-to-30-seconds-long-from-text-images-and-documents/) · [fal](https://fal.ai/wan-3) · [Alibaba Cloud](https://alibabacloud.com/blog/alibaba-unveils-wan3-0-with-twice-as-long-video-outputs-from-a-richer-variety-of-inputs_603439)
- Runway : [docs Runway](https://docs.dev.runwayml.com/guides/models/) · [Runway Dev](https://runwayml.com/news/introducing-runway-dev)
- Arrêt de Sora : [Axios](https://www.axios.com/2026/03/24/openai-discontinue-sora-video-app) · [Engadget](https://engadget.com/ai/openai-is-shutting-down-its-sora-video-generation-app-211023358.html)
- MCP : [fal + Claude](https://fal.ai/docs/documentation/setting-up/mcp/claude) · [Replicate MCP](https://replicate.com/docs/reference/mcp) · [Higgsfield MCP](https://higgsfield.ai/mcp) · [ElevenLabs MCP](https://elevenlabs.io/docs/eleven-api/resources/mcp-server) · [MiniMax MCP](https://pypi.org/project/minimax-mcp/) · [Kling MCP non officiels](https://glama.ai/mcp/servers/AceDataCloud/KlingMCP)
- Cohérence des personnages : [Artlist, Nano Banana Pro](https://artlist.io/blog/nano-banana-prompts/) · [WaveSpeed](https://wavespeed.ai/blog/posts/from-storyboard-to-screen--nano-banana-pro-in-ai-filmmaking-and-animation-production) · [Coverr](https://coverr.co/blog/nano-banana-pro-ai-image-character-consistency-2026)
- Transitions : [Higgsfield start/end frames](https://higgsfield.ai/blog/FepbaEyNStzJLJivRIOFg) · [Artlist, transitions IA](https://www.artlist.io/blog/ai-video-transitions) · [Kapwing](https://www.kapwing.com/resources/how-to-use-higgsfield-ai-video-generator/)
- Reverse engineering : [invideo, Gemini pour l'analyse](https://invideo.io/faq/how-do-you-use-gemini-for-video-analysis-and-scene/) · [Runway, shot list](https://runway.com/resources/ai-shot-list) · [n8n, cloner des reels](https://n8n.io/workflows/6104-clone-viral-tiktok-and-instagram-reels-with-apify-and-gemini-25-pro/)

*Les prix et certaines specs viennent de blogs de vendeurs et changent vite : vérifie sur la page officielle avant de payer.*
