# tools/

Génération de l'animation de la vignette « Game of Life » du portfolio,
sans dépendance npm ni ffmpeg — seulement Node et Edge.

## Pourquoi ces deux scripts

`--screenshot` d'Edge recharge la page à chaque appel : impossible de capturer
une animation qui progresse. `capture-frames.js` pilote donc Edge par le
protocole CDP (WebSocket natif de Node 22+) et prend N clichés successifs
**sur une seule et même page**, pendant que la simulation tourne.

`make-gif.js` assemble ces PNG en GIF89a animé : décodage PNG via `zlib`,
réduction par moyenne de blocs, quantification par coupe médiane, puis
encodage LZW. Le GIF bat largement JPEG et vidéo sur ce contenu, fait
d'aplats de couleur.

## Régénérer l'animation

```powershell
# 1. Lancer Edge avec le port de debug ouvert
$prof = Join-Path $env:TEMP ("gol-" + [guid]::NewGuid().ToString("N").Substring(0,8))
Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  -ArgumentList "--headless=new","--disable-gpu","--hide-scrollbars",
                "--user-data-dir=`"$prof`"","--no-first-run",
                "--remote-debugging-port=9222","--window-size=1280,720","about:blank"

# 2. Capturer 24 images espacées de 220 ms
node tools/capture-frames.js .\frames 9222 24 220

# 3. Encoder : dossier, sortie, facteur de réduction, couleurs, délai (centisecondes)
node tools/make-gif.js .\frames assets\img\projects\game-of-life.gif 2 8 22
```

## Réglages

- **Espacement régulier obligatoire.** Ne pas jeter des images au hasard pour
  alléger le fichier : les intervalles deviennent inégaux et l'animation
  saccade. Réduire plutôt le nombre d'images *à la capture*.
- **La palette pèse peu.** Passer de 48 à 8 couleurs n'a fait gagner que
  50 Ko sur 246, pour un rendu identique. Les vrais leviers sont le nombre
  d'images et la résolution.
- **Garder le PNG fixe** (`game-of-life.png`) : `index.html` s'en sert comme
  repli pour les visiteurs ayant demandé la réduction des animations, un GIF
  ne pouvant pas être arrêté par CSS.

## URL capturée

`capture-frames.js` cible `https://yanniss13.github.io/JeuDeLaVie/` (constante
`URL_CIBLE` en tête de fichier).
