# tools/

Génération de l'animation de la vignette « Game of Life » du portfolio.

## Pourquoi ces scripts

`--screenshot` d'Edge recharge la page à chaque appel : impossible de capturer
une animation qui progresse. `capture-frames.js` pilote donc Edge par le
protocole CDP (WebSocket natif de Node 22+) et prend N clichés successifs
**sur une seule et même page**.

`make-gif.js` reste là pour mémoire — il assemble des PNG en GIF89a animé sans
aucune dépendance : décodage PNG via `zlib`, quantification par coupe médiane,
delta inter-images, encodage LZW. **La vignette n'est plus un GIF.** À palette
de 8 couleurs, le GIF détruisait le texte antialiasé du compteur pour 98 Ko en
640×360, là où la vidéo tient le 1280×720 en 97 Ko. Le vert clair sur bleu
sombre est surtout un écart de *luminance*, que le sous-échantillonnage 4:2:0
laisse intact.

## Dépendances

- **Node 22+** (pour `WebSocket` en global)
- **Microsoft Edge**
- **ffmpeg** — `winget install Gyan.FFmpeg`

## Régénérer l'animation

```powershell
# 1. Lancer Edge avec le port de debug ouvert
$prof = Join-Path $env:TEMP ("gol-" + [guid]::NewGuid().ToString("N").Substring(0,8))
Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  -ArgumentList "--headless=new","--disable-gpu","--hide-scrollbars",
                "--user-data-dir=`"$prof`"","--no-first-run",
                "--remote-debugging-port=9222","--window-size=1280,720","about:blank"

# 2. Capturer une boucle complète
#    args : dossier, port, période max, chauffe max, repos avant cliché (ms)
node tools/capture-frames.js .\frames 9222 60 400 180

# 3. Encoder (30 images à 25/3 i/s, relues à 25 i/s)
ffmpeg -y -start_number 0 -framerate 25/3 -i .\frames\f%03d.png `
  -vf "fps=25,format=yuv420p" -c:v libx264 -preset veryslow -tune animation `
  -crf 26 -profile:v high -movflags +faststart -an assets\video\game-of-life.mp4

# 4. L'affiche doit être la PREMIÈRE image, sinon la vidéo saute au démarrage
copy .\frames\f000.png assets\img\projects\game-of-life.png
```

`-tune animation` compte : ce préréglage de libx264 est fait pour les aplats et
les bords francs.

## Comment la boucle se referme

La grille entière ne repasse **jamais** par son état de départ : le canon de
Gosper crée de la matière qui s'en va sans revenir. Mais l'œil ne voit que le
cadre, et le cadre, lui, est périodique.

Le canon a une période de 30 et lâche un planeur par cycle. Un planeur avance
d'une case en diagonale toutes les 4 générations : trente générations plus tard,
le planeur suivant a exactement l'âge qu'avait le précédent, donc exactement sa
position. Les planeurs se remplacent l'un l'autre. Cela ne vaut qu'une fois le
premier planeur sorti du cadre — d'où la phase de chauffe non capturée, qui dure
ici 137 générations. Les oscillateurs (périodes 2, 3, 15) divisent tous 30 et
retombent sur leurs pieds au même moment.

Le script ne suppose rien de tout ça : il mesure la période réelle du cadre, et
échoue si elle n'apparaît pas.

## Pièges rencontrés

- **Ne pas se servir du bouton « Aléatoire ».** Il allume ~850 cellules
  uniformément : l'œil n'y distingue aucune forme. La grille est composée à la
  main, motif par motif.
- **Attendre le fondu avant chaque cliché.** Les cellules portent
  `transition: background 0.1s`. Capturer juste après un pas fige le fondu à
  mi-course : les cellules qui viennent de naître sortent en vert délavé, comme
  des carrés translucides. C'est aussi 25 % de poids en plus, les demi-teintes
  se compressant mal. D'où le paramètre de repos (180 ms).
- **Le cadre utile n'est pas la grille.** Elle fait 1618 px de large pour une
  fenêtre de 1280 : elle est centrée, donc la colonne 0 démarre à x = −169.
  Seules les **colonnes 10 à 79** et les **lignes 0 à 29** sont visibles.
- **Avancer par « Étape », pas par « Démarrer ».** La simulation tourne à
  ~10 générations/seconde : en capturant toutes les 220 ms il s'écoulait
  2,2 générations par image, et les oscillateurs de période 2 paraissaient
  figés. Un clic sur « Étape » par image donne exactement une génération par
  image.
- **Laisser de la place entre les motifs.** Un pentadécathlon déborde de
  **3 cases dans les quatre directions** pendant son cycle (emprise réelle
  9×16 pour une figure de 3×10 à l'arrêt), un pulsar d'une case. Deux figures
  séparées par deux cases seulement font naître une cellule entre elles et se
  disloquent toutes les deux, sans qu'aucune n'ait été percutée. Compter au
  moins 3 cases vides entre deux emprises.
- **La périodicité ne prouve pas que l'image est bonne.** Un oscillateur
  disloqué laisse des débris *figés*, parfaitement périodiques : une
  composition entièrement détruite passe le test sans broncher. D'où le
  contrôle de survie, qui compare les oscillateurs à leur phase de départ à
  une génération multiple de 30.
- **Garder l'affiche synchronisée.** `index.html` utilise
  `game-of-life.png` comme `poster` ; ce doit être l'image `f000`, sinon
  l'image saute au premier survol.
