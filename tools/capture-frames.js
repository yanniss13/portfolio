// Capture une boucle complete de la demo Jeu de la vie via CDP.
// Une seule navigation : la simulation continue de tourner entre les prises,
// contrairement a --screenshot qui recharge la page a chaque appel.
//
// La grille n'est PAS tiree au hasard. « Aleatoire » produit ~850 cellules
// reparties uniformement : une puree verte ou l'oeil ne distingue aucune forme,
// et que la video compresse mal faute de larges aplats. On vide donc la grille,
// puis on pose des motifs connus de l'automate.
//
// --- Comment la boucle se referme sans faux raccord ---
// La grille entiere ne repasse JAMAIS par son etat de depart : le canon de
// Gosper cree de la matiere qui s'en va sans revenir. Mais l'oeil ne voit que
// le cadre, et le cadre, lui, est periodique.
//
// Le canon a une periode de 30 et lache un planeur par cycle. Un planeur avance
// d'une case en diagonale toutes les 4 generations. Trente generations plus
// tard, le planeur suivant a exactement l'age qu'avait le precedent, donc
// exactement sa position. Les planeurs se remplacent l'un l'autre : l'image se
// repete a l'identique tous les 30 pas, alors meme que l'etat interne, lui,
// derive indefiniment.
//
// Cela ne vaut qu'une fois le flux etabli — tant que le premier planeur n'est
// pas sorti du cadre, il n'a pas encore de remplacant et l'image change. D'ou
// la phase de chauffe non capturee. Les oscillateurs (periodes 2, 3, 15)
// divisent tous 30 et retombent donc sur leurs pieds au meme moment.
const fs = require("fs");
const path = require("path");

const URL_CIBLE = "https://yanniss13.github.io/JeuDeLaVie/";
const OUT = process.argv[2];
const PORT = Number(process.argv[3] || 9222);
const PERIODE_MAX = Number(process.argv[4] || 60);
const CHAUFFE_MAX = Number(process.argv[5] || 400);
// Les cellules de la demo portent `transition: background 0.1s`. Capturer
// juste apres un pas fige le fondu a mi-course : les cellules qui viennent de
// naitre ou de mourir sortent en vert delave, comme des carres translucides.
// On laisse donc la transition se terminer avant chaque cliche.
const REPOS = Number(process.argv[6] || 180);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- Cadre utile ----------------------------------------------------------
   La grille fait 90 colonnes sur 39 lignes, soit 1618 px de large : elle
   DEBORDE la fenetre de 1280 px et se retrouve centree, donc la colonne 0
   commence a x = -169. Le cadre visible n'est pas 0..70 mais bien
   colonnes 10..79 et lignes 0..29 — tout motif pose plus a gauche est
   ampute au montage, et c'est sur cette zone seule que se mesure la boucle. */
const CADRE = { ligneMin: 0, ligneMax: 29, colMin: 10, colMax: 79 };

const dessin = (lignes) => {
  const out = [];
  lignes.forEach((ligne, r) => {
    [...ligne].forEach((ch, c) => { if (ch === "O") out.push([r, c]); });
  });
  return out;
};

// Canon a planeurs de Gosper, periode 30 : le seul motif qui cree de la
// matiere, et la source du mouvement traversant. Coordonnees explicites
// plutot que dessin ASCII : une seule colonne decalee et il se disloque.
const CANON = [
  [0, 24],
  [1, 22], [1, 24],
  [2, 12], [2, 13], [2, 20], [2, 21], [2, 34], [2, 35],
  [3, 11], [3, 15], [3, 20], [3, 21], [3, 34], [3, 35],
  [4, 0], [4, 1], [4, 10], [4, 16], [4, 20], [4, 21],
  [5, 0], [5, 1], [5, 10], [5, 14], [5, 16], [5, 17], [5, 22], [5, 24],
  [6, 10], [6, 16], [6, 24],
  [7, 11], [7, 15],
  [8, 12], [8, 13],
];

// Periode 3 : la respiration la plus spectaculaire du jeu.
const PULSAR = dessin([
  "..OOO...OOO..",
  ".............",
  "O....O.O....O",
  "O....O.O....O",
  "O....O.O....O",
  "..OOO...OOO..",
  ".............",
  "..OOO...OOO..",
  "O....O.O....O",
  "O....O.O....O",
  "O....O.O....O",
  ".............",
  "..OOO...OOO..",
]);

// Periode 15. C'est une PHASE de l'oscillateur, pas sa graine : une ligne de
// dix cellules y converge, mais en passant par un transitoire — et un
// transitoire ne boucle pas.
const PENTADECATHLON = dessin([
  "..O....O..",
  "OO.OOOO.OO",
  "..O....O..",
]);

const CRAPAUD = dessin([".OOO", "OOO."]);                 // periode 2
const BALISE  = dessin(["OO..", "OO..", "..OO", "..OO"]); // periode 2
const CLIGNO  = dessin(["OOO"]);                          // periode 2

/* Emprise du canon, relevee en le faisant tourner seul 400 generations et en
   accumulant toutes les cases jamais allumees (voir README) :
     - son corps occupe les lignes 1 a 9, colonnes 11 a 46 ;
     - les planeurs suivent ensuite la diagonale colonne = ligne + 22 a 25.
   Un oscillateur pose trop pres n'a pas besoin d'etre percute pour tout
   casser : il suffit qu'une case naisse entre les deux figures pour que les
   deux derivent. D'ou la marge de 2 cases ajoutee ici. */
const interdit = (l, c) => {
  if (l <= 11 && c >= 9 && c <= 48) return true;      // corps du canon + marge
  if (l >= 8 && c - l >= 18 && c - l <= 29) return true; // couloir de tir + marge
  return false;
};

// Placement : ligne, colonne, motif. Les oscillateurs occupent les deux zones
// que le canon ne touche jamais : le triangle en bas a gauche du couloir, et
// la bande a droite.
//
// Les ecarts sont larges a dessein. Un pulsar et un pentadecathlon debordent
// de leur boite au repos pendant leur cycle : deux figures separees par deux
// cases seulement finissent par faire naitre une cellule entre elles, et les
// deux se disloquent — sans qu'aucune n'ait ete percutee. Une premiere version
// serrait le groupe de droite, qui s'est effondre en debris avant la
// generation 300. Compter au moins 3 cases vides entre deux boites.
// Debordement mesure de chaque motif au-dela de sa boite au repos, sur un
// cycle complet. Le pentadecathlon est le piege : 3 cases dans les quatre
// directions, soit une emprise reelle de 9x16 pour une figure qui n'en occupe
// que 3x10 a l'arret.
// [haut, bas, gauche, droite]
const DEBORD = new Map([
  [PULSAR,         [1, 1, 1, 1]],
  [PENTADECATHLON, [3, 3, 3, 3]],
  [CRAPAUD,        [1, 1, 0, 0]],
  [BALISE,         [0, 0, 0, 0]],
  [CLIGNO,         [1, 1, 0, 0]],
]);

const COMPOSITION = [
  [1, 11, CANON],              // lignes 1-9, col. 11-46

  [14, 11, PULSAR],            // gauche
  [16, 29, CRAPAUD],
  [23, 30, BALISE],
  [28, 40, CLIGNO],

  [1, 57, PULSAR],             // droite
  [22, 60, PENTADECATHLON],
  [24, 76, BALISE],
  [17, 76, CLIGNO],
];

/* Garde-fous. Aucun des deux ne fait echouer la simulation : un motif hors
   cadre ou percute produit une video muette sur le probleme, qu'on ne
   verrait qu'a l'oeil. On prefere echouer bruyamment ici.
   La marge d'une case autour de chaque motif couvre les phases : un pulsar
   deborde d'une case de sa boite au repos pendant son cycle. */
const boites = COMPOSITION.filter(([, , m]) => m !== CANON).map(([dr, dc, m]) => {
  const [haut, bas, gauche, droite] = DEBORD.get(m);
  return {
    lMin: dr - haut, lMax: dr + Math.max(...m.map(([r]) => r)) + bas,
    cMin: dc - gauche, cMax: dc + Math.max(...m.map(([, c]) => c)) + droite,
  };
});

boites.forEach((b, i) => {
  if (b.lMin < CADRE.ligneMin || b.lMax > CADRE.ligneMax ||
      b.cMin < CADRE.colMin || b.cMax > CADRE.colMax) {
    throw new Error(`Motif ${i} deborde du cadre : lignes ${b.lMin}..${b.lMax}, ` +
      `colonnes ${b.cMin}..${b.cMax} (cadre ${CADRE.ligneMin}..${CADRE.ligneMax} x ` +
      `${CADRE.colMin}..${CADRE.colMax})`);
  }
  for (let l = b.lMin; l <= b.lMax; l++) {
    for (let c = b.cMin; c <= b.cMax; c++) {
      if (interdit(l, c)) {
        throw new Error(`Motif ${i} (lignes ${b.lMin}..${b.lMax}, colonnes ${b.cMin}..${b.cMax}) ` +
          `mord sur l'emprise du canon en ${l}:${c} : il sera percute ou perturbe.`);
      }
    }
  }
  // Deux boites doivent etre separees d'au moins 3 cases vides sur un axe.
  boites.slice(i + 1).forEach((a, j) => {
    const ecart = Math.max(
      Math.max(a.lMin - b.lMax, b.lMin - a.lMax) - 1,
      Math.max(a.cMin - b.cMax, b.cMin - a.cMax) - 1
    );
    if (ecart < 3) {
      throw new Error(`Motifs ${i} et ${i + 1 + j} separes par ${ecart} case(s) vide(s) ` +
        `seulement : ils vont se contaminer et se disloquer.`);
    }
  });
});

const cellules = () => {
  const vues = new Set();
  const liste = [];
  for (const [dr, dc, motif] of COMPOSITION) {
    for (const [r, c] of motif) {
      const cle = (r + dr) + ":" + (c + dc);
      if (!vues.has(cle)) { vues.add(cle); liste.push([r + dr, c + dc]); }
    }
  }
  return liste;
};

async function main() {
  // Cible de debug exposée par Edge
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("Aucune cible de type page");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  const evalJs = async (expr) =>
    (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.value;

  await new Promise((r) => ws.addEventListener("open", r, { once: true }));

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
  });
  await send("Page.navigate", { url: URL_CIBLE });
  await sleep(4000);

  // Table rase : sans ca, les motifs poses se melangent au tirage aleatoire
  // initial et l'ensemble redevient du bruit en deux generations.
  const vide = await evalJs(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /vider/i.test(x.textContent || ''));
    if (!b) return 'BOUTON VIDER INTROUVABLE';
    b.click();
    return document.querySelectorAll('.vivante').length + ' cellules restantes';
  })()`);
  console.log("  vider -> " + vide);
  await sleep(400);

  // On clique les cellules comme le ferait un visiteur : c'est le chemin de
  // code reel de l'appli, pas une ecriture directe dans son etat interne.
  const pose = await evalJs(`(() => {
    const cibles = ${JSON.stringify(cellules())};
    let ok = 0, absentes = 0;
    for (const [r, c] of cibles) {
      const el = document.querySelector('[data-ligne="' + r + '"][data-colonne="' + c + '"]');
      if (!el) { absentes++; continue; }
      el.click();
      ok++;
    }
    return JSON.stringify({
      demandees: cibles.length,
      cliquees: ok,
      horsGrille: absentes,
      vivantes: document.querySelectorAll('.vivante').length
    });
  })()`);
  console.log("  motifs -> " + pose);

  const { vivantes, demandees } = JSON.parse(pose);
  if (vivantes !== demandees) {
    throw new Error(
      `Grille incoherente : ${demandees} cellules demandees, ${vivantes} vivantes. ` +
      `Un doublon dans la composition les aurait re-basculees a mort.`
    );
  }
  await sleep(400);

  // Signature de la ZONE VISIBLE uniquement. Comparer la grille entiere serait
  // sans espoir : les planeurs sortis du cadre continuent d'exister et de
  // deriver, donc l'etat global ne se repete jamais.
  const liste = `[...document.querySelectorAll('.vivante')]
    .map(e => [+e.dataset.ligne, +e.dataset.colonne])
    .filter(([l, c]) => l >= ${CADRE.ligneMin} && l <= ${CADRE.ligneMax}
                     && c >= ${CADRE.colMin} && c <= ${CADRE.colMax})
    .map(([l, c]) => l + ':' + c).sort()`;
  const signature = `(() => ${liste}.join(' '))()`;

  // Cellules hors emprise du canon : ce sont les oscillateurs, et eux seuls.
  // Sert au controle de survie plus bas.
  const zoneCanon = (l, c) =>
    (l >= 1 && l <= 9 && c >= 11 && c <= 46) ||
    (l >= 10 && c - l >= 22 && c - l <= 25);
  const oscillateursSeuls = (cells) =>
    cells.filter((k) => { const [l, c] = k.split(":").map(Number); return !zoneCanon(l, c); });

  const etape = `(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^\\s*[ÉE]tape/i.test(x.textContent || ''));
    if (!b) return false;
    b.click();
    return true;
  })()`;
  const avancer = async () => {
    if (!(await evalJs(etape))) throw new Error("BOUTON ETAPE INTROUVABLE");
  };

  /* --- Phase 1 : chauffe -------------------------------------------------
     On avance sans capturer jusqu'a ce que le cadre devienne periodique.
     Un candidat P n'est retenu qu'apres P concordances consecutives : une
     seule egalite fortuite entre deux images ne prouve rien, un cycle entier
     qui se rejoue, si. */
  const oscillateurs0 = oscillateursSeuls(await evalJs(`(() => ${liste})()`));

  const hist = [];
  const consec = new Array(PERIODE_MAX + 1).fill(0);
  let periode = 0, gen = 0;

  for (let t = 0; t <= CHAUFFE_MAX && !periode; t++) {
    hist.push(await evalJs(signature));
    for (let P = 1; P <= PERIODE_MAX; P++) {
      if (t >= P && hist[t] === hist[t - P]) consec[P]++; else consec[P] = 0;
      if (consec[P] >= P) { periode = P; break; }
    }
    if (!periode) { await avancer(); gen++; }
  }

  if (!periode) {
    throw new Error(
      `Le cadre n'est toujours pas periodique apres ${CHAUFFE_MAX} generations. ` +
      `Un planeur a probablement percute un oscillateur : verifier que le couloir ` +
      `de tir (colonne = ligne + 22 a 25) reste vide.`
    );
  }
  console.log(`  cadre periodique a la generation ${gen}, periode ${periode}`);

  /* Controle de survie. La periodicite seule ne prouve rien sur la qualite de
     l'image : un oscillateur disloque laisse des debris FIGES, qui sont
     parfaitement periodiques. Une composition entierement detruite passerait
     donc le test precedent sans broncher.
     Toutes les periodes en presence (2, 3, 15) divisent 30 : a toute
     generation multiple de 30, les oscillateurs doivent etre exactement dans
     leur phase de depart. On avance jusqu'au prochain multiple et on compare. */
  while (gen % 30 !== 0) { await avancer(); gen++; }
  const survivants = new Set(oscillateursSeuls(await evalJs(`(() => ${liste})()`)));
  const perdus = oscillateurs0.filter((k) => !survivants.has(k));
  if (perdus.length) {
    throw new Error(
      `${perdus.length} cellules d'oscillateur sur ${oscillateurs0.length} ont disparu ` +
      `a la generation ${gen} (ex. ${perdus.slice(0, 6).join(", ")}). Deux motifs se ` +
      `contaminent : elargir les ecarts de la composition.`
    );
  }
  console.log(`  oscillateurs intacts a la generation ${gen} (${oscillateurs0.length} cellules)`);

  /* --- Phase 2 : capture d'un cycle exactement --------------------------
     On capture P images puis on s'arrete : la (P+1)e serait le doublon de la
     premiere et creerait un temps mort au bouclage. */
  fs.mkdirSync(OUT, { recursive: true });
  const depart = await evalJs(signature);

  for (let i = 0; i < periode; i++) {
    await sleep(REPOS);   // fondu des cellules termine
    const shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, `f${String(i).padStart(3, "0")}.png`), Buffer.from(shot.data, "base64"));
    await avancer();
  }

  // Verification finale : apres P pas, le cadre doit etre revenu a l'identique.
  const arrivee = await evalJs(signature);
  if (arrivee !== depart) {
    throw new Error("Le cadre n'est pas revenu a son etat de depart apres un cycle complet.");
  }
  console.log(`  ${periode} images capturées, retour a l'identique vérifié`);

  // Les images d'un tirage precedent, plus long, fausseraient l'encodage :
  // ffmpeg avale tout le dossier.
  for (const f of fs.readdirSync(OUT)) {
    const n = Number((f.match(/^f(\d+)\.png$/) || [])[1]);
    if (Number.isInteger(n) && n >= periode) fs.unlinkSync(path.join(OUT, f));
  }

  await send("Browser.close").catch(() => {});
  ws.close();
}

main().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
