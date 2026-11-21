# Refaire un reel IA « à l'identique » (sauf l'histoire) : boîte à outils complète

*Recherche du 21 novembre 2026. Reel de référence : `instagram.com/reel/Df8G4u5K67b`*

> **Limite importante.** L'environnement cloud de cette session bloque instagram.com (et la plupart des sites).
> Je n'ai donc **pas pu voir la vidéo**. Ce document couvre toutes les options pour les styles de reels IA
> narratifs les plus courants. Pour passer au **clone exact** (même découpage, mêmes plans, même voix),
> voir la section 10 : il me faut le fichier vidéo ou une description.

---

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

## 10. Prochaine étape : passer au clone exact

Pour reproduire **exactement** les plans, transitions et voix de ce reel, j'ai besoin de la vidéo :

1. **Le plus simple** : télécharge le reel sur ton téléphone et envoie-le-moi dans le chat. J'en tire :
   - le découpage exact (durée de chaque plan, coupes, transitions) ;
   - une analyse image par image (style, cadrage, mouvements, lumière) ;
   - le profil de la voix (timbre, débit, émotion) et une recherche de voix équivalente ;
   - **une shot list complète avec les prompts prêts à coller**, pour l'outil que tu choisis, avec ta nouvelle histoire.
2. **Sinon** : décris-moi la vidéo (sujet, style visuel, voix, durée), ou donne-moi le compte qui l'a publiée.
3. **Option technique** : autoriser instagram.com dans le réseau de cet environnement. C'est peu fiable : Instagram exige souvent une connexion pour télécharger.

---

## Sources

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
