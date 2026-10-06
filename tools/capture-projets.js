// Captures des vignettes de projets, pilotées par CDP (comme capture-frames.js).
//
// Chaque projet est montré avec de VRAIES données : une capture d'écran vide
// ou d'une page d'erreur dit au recruteur exactement l'inverse de ce qu'on veut.
// Les projets qui ont besoin d'un serveur local (MoniteurConnect, RecetteBook,
// Réseau social) doivent être lancés avant : voir tools/README.md.
//
// Usage : node tools/capture-projets.js <port-debug> [projet…]
//   Sans nom de projet, tout est capturé. Les images partent dans
//   assets/img/projects/<projet>.webp.
const fs = require("fs");
const path = require("path");

const PORT = Number(process.argv[2] || 9222);
const SEULS = process.argv.slice(3);
const SORTIE = path.join(__dirname, "..", "assets", "img", "projects");

// 1280×720 : le format 16/9 des vignettes. Le facteur 1,25 donne 1600×900 px,
// assez pour une vignette affichée sur ~540 px même en haute densité.
const LARGEUR = 1280, HAUTEUR = 720, DENSITE = 1.25, QUALITE = 82;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROJETS = {
  // Le site public, vue d'un visiteur : la grille des héros du Wiki.
  nova: {
    url: "https://yanniss13.github.io/NOVA/",
    attente: 6000,
    async preparer({ evalJs }) {
      // Un profil neuf ouvre la fenêtre de connexion : on la ferme en visiteur.
      await evalJs(`document.getElementById('authOffline')?.click(); true`);
      await sleep(1500);
      await evalJs(`document.getElementById('wikiGrid').scrollIntoView({block:'start'}); window.scrollBy(0,-195); true`);
    },
  },
  // Le tableau de bord de l'auto-école de démonstration (npm run seed:demo).
  "moniteur-connect": {
    url: "http://localhost:3100/connexion",
    attente: 2000,
    async preparer({ evalJs, send, attendreNavigation }) {
      await evalJs(`(() => {
        document.querySelector('input[name=email]').value = 'ecole.vitrine@demo.moniteur-connect.example';
        document.querySelector('input[name=password]').value = 'demo1234';
        document.querySelector('form').submit(); return true; })()`);
      await attendreNavigation(1500);
      await send("Page.navigate", { url: "http://localhost:3100/tableau-de-bord" });
      await sleep(2500);
    },
  },
  // Le front publié, branché sur l'API locale (localhost:3000) et ses recettes.
  "api-recettes": {
    url: "http://127.0.0.1:8082/index.html",
    attente: 3000,
    async preparer({ evalJs }) {
      // Les recettes de démonstration n'ont pas de photo : la page réduite à 85 %
      // montre la recherche et une rangée entière de cartes, texte compris.
      await evalJs(`document.body.style.zoom = 0.85; document.querySelector('.recipe-card').scrollIntoView({block:'start'}); window.scrollBy(0, -150); true`);
    },
  },
  // Connexion au compte de démonstration, puis le fil.
  "reseau-social": {
    url: "http://127.0.0.1:8081/index.php?action=login",
    attente: 2000,
    async preparer({ evalJs, attendreNavigation }) {
      await evalJs(`(() => {
        document.querySelector('input[name=email]').value = 'yanniss@demo.local';
        document.querySelector('input[name=password]').value = 'demo-capture-2026';
        document.querySelector('form').submit(); return true; })()`);
      await attendreNavigation(3000);
    },
  },
  // Une partie de Puissance 4 en cours : une grille vide ne montre rien.
  morpion: {
    url: "https://yanniss13.github.io/Projet-Morpion/",
    attente: 3000,
    async preparer({ evalJs }) {
      const r = await evalJs(`(async () => {
        const pause = (ms) => new Promise(r => setTimeout(r, ms));
        // La grille (6 rangées) dépasse 720 px : on réduit la page pour la voir en entier.
        document.body.style.zoom = 0.78;
        const cases = [...document.querySelectorAll('#grille .case')];
        if (!cases.length) return 'GRILLE INTROUVABLE';
        const colonnes = Number(document.querySelector('input[type=number]')?.value) || 7;
        // Une partie plausible, sans vainqueur : colonnes jouées tour à tour.
        for (const c of [3, 3, 2, 4, 4, 2, 5, 1, 2, 3, 6, 4]) {
          (cases[c] || cases[c % cases.length]).click(); await pause(120);
        }
        return 'ok ' + cases.length + ' cases, ' + colonnes + ' colonnes';
      })()`);
      console.log("  morpion :", r);
    },
  },
};

async function main() {
  const cibles = Object.keys(PROJETS).filter((n) => !SEULS.length || SEULS.includes(n));
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const page = (await res.json()).find((t) => t.type === "page");
  if (!page) throw new Error("Aucune cible de type page : Edge est-il lancé avec --remote-debugging-port ?");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const ecouteurs = new Set();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      for (const f of ecouteurs) f(msg);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const evalJs = async (expr) =>
    (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const attendreNavigation = (delai) =>
    new Promise((resolve) => {
      const f = (m) => { if (m.method === "Page.loadEventFired") { ecouteurs.delete(f); resolve(); } };
      ecouteurs.add(f);
      setTimeout(() => { ecouteurs.delete(f); resolve(); }, delai + 8000);
    }).then(() => sleep(delai));

  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: LARGEUR, height: HAUTEUR, deviceScaleFactor: DENSITE, mobile: false,
  });

  for (const nom of cibles) {
    const p = PROJETS[nom];
    console.log(nom, "←", p.url);
    await send("Page.navigate", { url: p.url });
    await sleep(p.attente);
    if (p.preparer) await p.preparer({ evalJs, send, attendreNavigation });
    // Laisse retomber les transitions et charger les images paresseuses.
    await sleep(900);
    const shot = await send("Page.captureScreenshot", { format: "webp", quality: QUALITE, captureBeyondViewport: false });
    const fichier = path.join(SORTIE, nom + ".webp");
    fs.writeFileSync(fichier, Buffer.from(shot.data, "base64"));
    console.log("  →", path.relative(process.cwd(), fichier), Math.round(fs.statSync(fichier).size / 1024), "Ko");
  }
  ws.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
