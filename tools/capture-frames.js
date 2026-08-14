// Capture N images successives d'une page vivante via CDP.
// Une seule navigation : la simulation continue de tourner entre les prises,
// contrairement à --screenshot qui recharge la page à chaque appel.
const fs = require("fs");
const path = require("path");

const URL_CIBLE = "https://yanniss13.github.io/JeuDeLaVie/";
const OUT = process.argv[2];
const PORT = Number(process.argv[3] || 9222);
const FRAMES = Number(process.argv[4] || 24);
const INTERVAL = Number(process.argv[5] || 220);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  await new Promise((r) => ws.addEventListener("open", r, { once: true }));

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
  });
  await send("Page.navigate", { url: URL_CIBLE });
  await sleep(3500);

  // Lance la simulation : on cherche le bouton "Démarrer" par son libellé
  const started = await send("Runtime.evaluate", {
    expression: `(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => /démarrer|demarrer|start/i.test(x.textContent || ''));
      if (b) { b.click(); return 'clic sur: ' + b.textContent.trim(); }
      return 'BOUTON INTROUVABLE';
    })()`,
    returnByValue: true,
  });
  console.log("  " + started.result.value);
  await sleep(600);

  fs.mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < FRAMES; i++) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, `f${String(i).padStart(3, "0")}.png`), Buffer.from(shot.data, "base64"));
    await sleep(INTERVAL);
  }
  console.log(`  ${FRAMES} images capturées dans ${OUT}`);

  await send("Browser.close").catch(() => {});
  ws.close();
}

main().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
