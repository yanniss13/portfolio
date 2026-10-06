# tools/

Génération des visuels du portfolio : l'animation de la vignette « Game of Life »
(`capture-frames.js`) et les captures des autres projets (`capture-projets.js`).

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

## Captures des projets (`capture-projets.js`)

Les vignettes de NOVA, MoniteurConnect, du Réseau social, de RecetteBook et du
Morpion sont de vraies captures, affichées en permanence dans un cadre de
navigateur (`.browser` dans `style.css`). Avant, elles n'apparaissaient qu'au
survol : sur téléphone, un recruteur ne voyait jamais les applications.

Chaque capture montre de **vraies données**, jamais un écran vide ou une
erreur. Trois projets ont donc besoin d'un serveur local avant la capture :

| Projet | À lancer | Écran capturé |
|---|---|---|
| NOVA | rien (site en ligne) | Wiki, grille des héros, en visiteur |
| MoniteurConnect | `npm run seed:demo` puis `PORT=3100 node src/server.js` | tableau de bord de l'école de démonstration |
| RecetteBook | `mongod` (Laragon), `node server.js`, puis le front sur `127.0.0.1:8082` | liste de recettes saisies par l'API |
| Réseau social | MySQL (Laragon), base `minisocial_capture`, `php -S 127.0.0.1:8081 -t public` | fil du compte `yanniss@demo.local` |
| Morpion | rien (site en ligne) | partie de Puissance 4 en cours |

La base `minisocial_capture` est **distincte** de `minisocial` : comptes et
publications fictifs, pour ne montrer aucun vrai utilisateur. La copie du
projet qui sert à la capture pointe sur elle (`root`, sans mot de passe) ;
le projet d'origine n'est pas modifié.

```powershell
# Edge en mode headless, port de debug ouvert (comme pour le Jeu de la vie)
$prof = Join-Path $env:TEMP ("capt-" + [guid]::NewGuid().ToString("N").Substring(0,8))
Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  -ArgumentList "--headless=new","--disable-gpu","--hide-scrollbars",
                "--user-data-dir=`"$prof`"","--no-first-run",
                "--remote-debugging-port=9333","--window-size=1280,720","about:blank"

node tools/capture-projets.js 9333             # tout
node tools/capture-projets.js 9333 nova morpion  # seulement certains projets
```

Les images sortent en WebP 1600 × 900 (viewport 1280 × 720, densité 1,25),
de 35 à 110 Ko : assez net pour une vignette affichée sur ~540 px, même sur
écran haute densité. Garder `width="1600" height="900"` dans `index.html`.

### Pièges rencontrés

- **NOVA ouvre la fenêtre de connexion** pour un profil neuf : le script clique
  sur « Continuer hors connexion » (`#authOffline`) avant de cadrer.
- **L'en-tête de NOVA est fixe** : il recouvre ce qui est juste au-dessus de la
  grille. Le décalage de défilement (−195 px) le fait tomber sur les onglets de
  catégories plutôt que sur le titre.
- **RecetteBook n'a pas de photos** dans les recettes de démonstration : la page
  est réduite à 85 % pour qu'une rangée entière de cartes, texte compris, tienne
  dans le cadre. Ne pas mettre de photos dont la licence n'est pas claire.
- **La grille du Puissance 4 dépasse 720 px** : la page est réduite à 78 %.
- **Encodage MySQL** : charger un script SQL avec
  `--default-character-set=utf8mb4`, sinon les accents sortent en « ├® ».
- **La démo publiée de RecetteBook interroge `localhost:3000`** : elle échoue chez
  tout visiteur. La carte n'a donc plus de lien de démo, seulement GitHub.
