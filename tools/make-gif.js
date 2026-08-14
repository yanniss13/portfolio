// Assemble des PNG en GIF89a animé, sans dépendance externe.
// zlib de Node fournit l'inflate nécessaire au décodage PNG ; le reste
// (défiltrage, quantification médiane, LZW) est écrit ici.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ---------------- Décodage PNG ---------------- */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("signature PNG invalide");
  let pos = 8, width = 0, height = 0, depth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      if (depth !== 8) throw new Error("profondeur " + depth + " non gérée");
      if (colorType !== 6 && colorType !== 2) throw new Error("colorType " + colorType + " non géré");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 3);

  let prev = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = Buffer.from(raw.subarray(rp, rp + stride));
    rp += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 3] = line[x * channels];
      out[(y * width + x) * 3 + 1] = line[x * channels + 1];
      out[(y * width + x) * 3 + 2] = line[x * channels + 2];
    }
    prev = line;
  }
  return { width, height, rgb: out };
}

/* ---------------- Réduction par moyenne de blocs ---------------- */
function downscale(img, factor) {
  const w = Math.floor(img.width / factor), h = Math.floor(img.height / factor);
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * img.width + (x * factor + dx)) * 3;
          r += img.rgb[i]; g += img.rgb[i + 1]; b += img.rgb[i + 2];
        }
      }
      const n = factor * factor, o = (y * w + x) * 3;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n);
    }
  }
  return { width: w, height: h, rgb: out };
}

/* ---------------- Palette globale (coupe médiane) ---------------- */
function buildPalette(frames, maxColors) {
  const hist = new Map();
  for (const f of frames) {
    for (let i = 0; i < f.rgb.length; i += 3) {
      // Léger regroupement pour limiter le nombre de teintes distinctes
      const r = f.rgb[i] & 0xf8, g = f.rgb[i + 1] & 0xf8, b = f.rgb[i + 2] & 0xf8;
      const k = (r << 16) | (g << 8) | b;
      hist.set(k, (hist.get(k) || 0) + 1);
    }
  }
  let boxes = [[...hist.entries()].map(([k, n]) => ({
    r: (k >> 16) & 0xff, g: (k >> 8) & 0xff, b: k & 0xff, n,
  }))];
  while (boxes.length < maxColors) {
    // Coupe la boîte au plus grand étalement de canal
    let bi = -1, bestRange = -1, bestCh = "r";
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (const ch of ["r", "g", "b"]) {
        let lo = 255, hi = 0;
        for (const c of box) { if (c[ch] < lo) lo = c[ch]; if (c[ch] > hi) hi = c[ch]; }
        if (hi - lo > bestRange) { bestRange = hi - lo; bi = i; bestCh = ch; }
      }
    });
    if (bi < 0 || bestRange <= 0) break;
    const box = boxes[bi].sort((a, b) => a[bestCh] - b[bestCh]);
    const total = box.reduce((s, c) => s + c.n, 0);
    let acc = 0, cut = 1;
    for (let i = 0; i < box.length; i++) { acc += box[i].n; if (acc >= total / 2) { cut = Math.max(1, i); break; } }
    boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut));
  }
  return boxes.filter(b => b.length).map(box => {
    let r = 0, g = 0, b = 0, n = 0;
    for (const c of box) { r += c.r * c.n; g += c.g * c.n; b += c.b * c.n; n += c.n; }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

function mapToPalette(frame, palette) {
  const idx = Buffer.alloc(frame.width * frame.height);
  const cache = new Map();
  for (let i = 0, p = 0; i < frame.rgb.length; i += 3, p++) {
    const key = (frame.rgb[i] << 16) | (frame.rgb[i + 1] << 8) | frame.rgb[i + 2];
    let best = cache.get(key);
    if (best === undefined) {
      let bd = Infinity;
      for (let c = 0; c < palette.length; c++) {
        const dr = frame.rgb[i] - palette[c][0], dg = frame.rgb[i + 1] - palette[c][1], db = frame.rgb[i + 2] - palette[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = c; }
      }
      cache.set(key, best);
    }
    idx[p] = best;
  }
  return idx;
}

/* ---------------- Delta entre images ----------------
   Le quadrillage occupe tout le cadre et ne bouge jamais : d'une generation a
   l'autre, seules les cellules qui naissent ou meurent changent, soit environ
   5 % des pixels. Reecrire les 95 % restants a chaque image est du pur
   gaspillage. Le GIF sait l'eviter nativement : un index declare transparent
   signifie « ne touche pas a ce pixel », et la disposition 1 (laisser en
   place) conserve l'image precedente dessous.

   La comparaison se fait contre l'image precedente COMPLETE, pas contre sa
   version trouee : avec la disposition 1, l'etat du canevas apres l'image i-1
   est exactement le contenu plein de i-1. */
function appliquerDelta(frames, indexTransparent) {
  let inchanges = 0, total = 0;
  const pleines = frames.map(f => Buffer.from(f.indices));
  for (let i = 1; i < frames.length; i++) {
    const avant = pleines[i - 1], maintenant = frames[i].indices;
    for (let p = 0; p < maintenant.length; p++) {
      total++;
      if (pleines[i][p] === avant[p]) { maintenant[p] = indexTransparent; inchanges++; }
    }
  }
  return total ? inchanges / total : 0;
}

/* ---------------- LZW (variante GIF) ---------------- */
function lzwEncode(indices, minCodeSize) {
  const clear = 1 << minCodeSize, eoi = clear + 1;
  let dict = new Map(), next = eoi + 1, codeSize = minCodeSize + 1;
  const bits = [];
  let cur = 0, curBits = 0;
  const emit = (code) => {
    cur |= code << curBits; curBits += codeSize;
    while (curBits >= 8) { bits.push(cur & 0xff); cur >>= 8; curBits -= 8; }
  };
  const reset = () => { dict = new Map(); next = eoi + 1; codeSize = minCodeSize + 1; };

  emit(clear); reset();
  let prefix = String(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], combined = prefix + "," + k;
    if (dict.has(combined)) { prefix = combined; continue; }
    emit(prefix.includes(",") ? dict.get(prefix) : Number(prefix));
    dict.set(combined, next++);
    if (next > (1 << codeSize)) {
      if (codeSize < 12) codeSize++;
      else { emit(clear); reset(); }
    }
    prefix = String(k);
  }
  emit(prefix.includes(",") ? dict.get(prefix) : Number(prefix));
  emit(eoi);
  if (curBits > 0) bits.push(cur & 0xff);

  // Découpage en sous-blocs de 255 octets maximum
  const out = [];
  for (let i = 0; i < bits.length; i += 255) {
    const chunk = bits.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return Buffer.from(out);
}

/* ---------------- Assemblage GIF89a ---------------- */
function buildGif(frames, palette, delayCs, indexTransparent) {
  const w = frames[0].width, h = frames[0].height;
  // L'index transparent occupe une entree de la table : c'est lui, et non le
  // nombre de couleurs demande, qui fixe la largeur des codes.
  const entrees = indexTransparent === null ? palette.length : indexTransparent + 1;
  let bits = 1; while ((1 << bits) < entrees) bits++;
  const gctSize = 1 << bits;
  const parts = [];
  const header = Buffer.alloc(13);
  header.write("GIF89a", 0, "ascii");
  header.writeUInt16LE(w, 6); header.writeUInt16LE(h, 8);
  header[10] = 0x80 | ((bits - 1) & 7);
  header[11] = 0; header[12] = 0;
  parts.push(header);

  const gct = Buffer.alloc(gctSize * 3);
  palette.forEach((c, i) => { gct[i * 3] = c[0]; gct[i * 3 + 1] = c[1]; gct[i * 3 + 2] = c[2]; });
  parts.push(gct);

  // Extension NETSCAPE2.0 : boucle infinie
  parts.push(Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0", "ascii"), 0x03, 0x01, 0x00, 0x00, 0x00]));

  for (const f of frames) {
    const gce = Buffer.alloc(8);
    // gce[3] : bits 4-2 = disposition (1 = laisser en place, indispensable
    // pour que les pixels transparents laissent voir l'image precedente),
    // bit 0 = drapeau de transparence.
    gce[0] = 0x21; gce[1] = 0xf9; gce[2] = 0x04;
    gce[3] = indexTransparent === null ? 0x04 : 0x05;
    gce.writeUInt16LE(delayCs, 4);
    gce[6] = indexTransparent === null ? 0 : indexTransparent;
    gce[7] = 0;
    parts.push(gce);

    const desc = Buffer.alloc(10);
    desc[0] = 0x2c;
    desc.writeUInt16LE(0, 1); desc.writeUInt16LE(0, 3);
    desc.writeUInt16LE(w, 5); desc.writeUInt16LE(h, 7);
    desc[9] = 0;
    parts.push(desc);

    const minCodeSize = Math.max(2, bits);
    parts.push(Buffer.from([minCodeSize]));
    parts.push(lzwEncode(f.indices, minCodeSize));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

/* ---------------- Programme ---------------- */
const dir = process.argv[2];
const outPath = process.argv[3];
const factor = Number(process.argv[4] || 2);
const colors = Number(process.argv[5] || 64);
const delayCs = Number(process.argv[6] || 20);
const cropTop = Number(process.argv[7] || 0);

const files = fs.readdirSync(dir).filter(f => f.endsWith(".png")).sort();
console.log(`Décodage de ${files.length} images...`);
let frames = files.map(f => {
  let img = decodePng(fs.readFileSync(path.join(dir, f)));
  if (cropTop > 0) {
    const nh = img.height - cropTop;
    img = { width: img.width, height: nh, rgb: img.rgb.subarray(cropTop * img.width * 3) };
  }
  return downscale(img, factor);
});
console.log(`  taille finale : ${frames[0].width}x${frames[0].height}`);

console.log(`Construction de la palette (${colors} couleurs)...`);
const palette = buildPalette(frames, colors);
console.log(`  ${palette.length} couleurs retenues`);

console.log("Indexation...");
frames = frames.map(f => ({ width: f.width, height: f.height, indices: mapToPalette(f, palette) }));

// L'index transparent se place juste apres les couleurs reelles : aucune
// teinte n'est sacrifiee, la table s'agrandit seulement d'une entree.
const indexTransparent = frames.length > 1 ? palette.length : null;
if (indexTransparent !== null) {
  const part = appliquerDelta(frames, indexTransparent);
  console.log(`Delta inter-images : ${(part * 100).toFixed(1)} % de pixels inchanges rendus transparents`);
}

console.log("Encodage LZW...");
const gif = buildGif(frames, palette, delayCs, indexTransparent);
fs.writeFileSync(outPath, gif);
console.log(`GIF écrit : ${(gif.length / 1024).toFixed(0)} Ko`);
