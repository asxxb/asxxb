// Generates pixel-art skill cards (one SVG per category) and writes the
// <img> block into README.md between the SKILLS markers.
//
// Usage (from repo root):  node scripts/generate-skills.js
// Edit the CATEGORIES list below to add/remove skills, then run it again.

const fs = require("node:fs");
const path = require("node:path");

const OUTPUT = "assets/skills";
const README = "README.md";
const START = "<!-- SKILLS:START -->";
const END = "<!-- SKILLS:END -->";

// name: shown on the card (A-Z, 0-9, space, + # . - only)
// abbr: 1-3 characters shown in the icon tile
// color: brand color of the tile
const CATEGORIES = [
  {
    file: "languages",
    title: "LANGUAGES",
    skills: [
      { name: "C", abbr: "C", color: "#00599C" },
      { name: "C++", abbr: "C++", color: "#00599C" },
      { name: "C#", abbr: "C#", color: "#239120" },
      { name: "Dart", abbr: "DRT", color: "#0175C2" },
      { name: "Python", abbr: "PY", color: "#3670A0" },
      { name: "Java", abbr: "JV", color: "#ED8B00" },
      { name: "JavaScript", abbr: "JS", color: "#F7DF1E" },
      { name: "PHP", abbr: "PHP", color: "#777BB4" },
    ],
  },
];

// ───────────── Layout ─────────────
const COLS = 8;          // cards per row
const CARD_W = 64;
const CARD_H = 48;
const TILE = 26;
const GAP_X = 6;
const GAP_Y = 8;
const PAD = 10;
const PANEL_W = PAD * 2 + COLS * CARD_W + (COLS - 1) * GAP_X;
const DISPLAY_WIDTH = PANEL_W; // width of the image in the README (px)

// ───────────── 5x7 pixel font ─────────────
const GLYPH_DATA = `
A 01110 10001 10001 11111 10001 10001 10001
B 11110 10001 10001 11110 10001 10001 11110
C 01110 10001 10000 10000 10000 10001 01110
D 11110 10001 10001 10001 10001 10001 11110
E 11111 10000 10000 11110 10000 10000 11111
F 11111 10000 10000 11110 10000 10000 10000
G 01110 10001 10000 10111 10001 10001 01111
H 10001 10001 10001 11111 10001 10001 10001
I 01110 00100 00100 00100 00100 00100 01110
J 00111 00010 00010 00010 00010 10010 01100
K 10001 10010 10100 11000 10100 10010 10001
L 10000 10000 10000 10000 10000 10000 11111
M 10001 11011 10101 10101 10001 10001 10001
N 10001 11001 10101 10011 10001 10001 10001
O 01110 10001 10001 10001 10001 10001 01110
P 11110 10001 10001 11110 10000 10000 10000
Q 01110 10001 10001 10001 10101 10010 01101
R 11110 10001 10001 11110 10100 10010 10001
S 01111 10000 10000 01110 00001 00001 11110
T 11111 00100 00100 00100 00100 00100 00100
U 10001 10001 10001 10001 10001 10001 01110
V 10001 10001 10001 10001 10001 01010 00100
W 10001 10001 10001 10101 10101 11011 10001
X 10001 10001 01010 00100 01010 10001 10001
Y 10001 10001 01010 00100 00100 00100 00100
Z 11111 00001 00010 00100 01000 10000 11111
0 01110 10001 10011 10101 11001 10001 01110
1 00100 01100 00100 00100 00100 00100 01110
2 01110 10001 00001 00010 00100 01000 11111
3 11110 00001 00001 01110 00001 00001 11110
4 00010 00110 01010 10010 11111 00010 00010
5 11111 10000 11110 00001 00001 10001 01110
6 00110 01000 10000 11110 10001 10001 01110
7 11111 00001 00010 00100 01000 01000 01000
8 01110 10001 10001 01110 10001 10001 01110
9 01110 10001 10001 01111 00001 00010 01100
+ 00000 00100 00100 11111 00100 00100 00000
# 01010 01010 11111 01010 11111 01010 01010
. 00000 00000 00000 00000 00000 01100 01100
- 00000 00000 00000 11111 00000 00000 00000
`;

const GLYPHS = {};
for (const line of GLYPH_DATA.trim().split("\n")) {
  const [ch, ...rows] = line.trim().split(/\s+/);
  GLYPHS[ch] = rows;
}

function advance(ch) {
  return ch === " " ? 3 : 6; // columns, including the 1-column gap
}

function textWidth(text, scale) {
  let cols = 0;
  for (const ch of text) cols += advance(ch);
  if (text.endsWith(" ") === false) cols -= 1;
  return cols * scale;
}

function pixelText(text, x, y, scale, fill, opacity = 1) {
  let d = "";
  let cx = x;

  for (const ch of text) {
    if (ch === " ") {
      cx += advance(ch) * scale;
      continue;
    }
    const glyph = GLYPHS[ch];
    if (!glyph) throw new Error(`No pixel glyph for "${ch}"`);

    glyph.forEach((row, r) => {
      let c = 0;
      while (c < 5) {
        if (row[c] !== "1") { c++; continue; }
        let start = c;
        while (c < 5 && row[c] === "1") c++;
        const len = c - start;
        d += `M${cx + start * scale} ${y + r * scale}h${len * scale}v${scale}h${-len * scale}z`;
      }
    });
    cx += advance(ch) * scale;
  }

  return `<path d="${d}" fill="${fill}" fill-opacity="${opacity}"/>`;
}

// ───────────── Shapes ─────────────
// Rectangle with stepped (pixel) corners.
function notched(x, y, w, h, n) {
  return `M${x + n} ${y}H${x + w - n}V${y + n}H${x + w}V${y + h - n}H${x + w - n}V${y + h}H${x + n}V${y + h - n}H${x}V${y + n}H${x + n}Z`;
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Very dark brand colors disappear on a dark card, so lighten them for borders.
function accent(hex) {
  if (luminance(hex) >= 0.2) return hex;
  const mix = c => Math.round(c + (255 - c) * 0.55).toString(16).padStart(2, "0");
  const [r, g, b] = rgb(hex);
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function esc(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[c]);
}

// ───────────── Card ─────────────
function card(skill, x, y) {
  const ac = accent(skill.color);
  const name = skill.name.toUpperCase();
  const abbr = skill.abbr.toUpperCase();

  const nameW = textWidth(name, 1);
  if (nameW > CARD_W - 4) {
    throw new Error(`"${skill.name}" is too wide for a card. Use a shorter name.`);
  }

  const tx = x + Math.round((CARD_W - TILE) / 2);
  const ty = y + 5;
  const abbrScale = abbr.length <= 2 ? 2 : 1;
  const aw = textWidth(abbr, abbrScale);
  const ax = Math.round(tx + TILE / 2 - aw / 2);
  const ay = ty + Math.round((TILE - 7 * abbrScale) / 2);
  const abbrColor = luminance(skill.color) > 0.6 ? "#1b1f24" : "#ffffff";
  const nx = Math.round(x + CARD_W / 2 - nameW / 2);

  return `
  <g>
    <title>${esc(skill.name)}</title>
    <path d="${notched(x + 2, y + 2, CARD_W, CARD_H, 2)}" fill="${ac}" fill-opacity="0.28"/>
    <path d="${notched(x, y, CARD_W, CARD_H, 2)}" fill="${ac}"/>
    <path d="${notched(x + 1, y + 1, CARD_W - 2, CARD_H - 2, 1)}" fill="#161b22"/>

    <path d="${notched(tx, ty, TILE, TILE, 2)}" fill="#ffffff" fill-opacity="0.3"/>
    <path d="${notched(tx + 1, ty + 1, TILE - 2, TILE - 2, 1)}" fill="${skill.color}"/>
    <rect x="${tx + 2}" y="${ty + 1}" width="${TILE - 4}" height="2" fill="#ffffff" fill-opacity="0.22"/>
    <rect x="${tx + 2}" y="${ty + TILE - 3}" width="${TILE - 4}" height="2" fill="#000000" fill-opacity="0.22"/>
    ${pixelText(abbr, ax, ay, abbrScale, abbrColor)}

    ${pixelText(name, nx, y + 36, 1, "#f0f6fc")}
  </g>`;
}

function panel(skills) {
  const rows = Math.ceil(skills.length / COLS);
  const height = PAD * 2 + rows * CARD_H + (rows - 1) * GAP_Y + 2;

  const cards = skills
    .map((skill, i) => {
      const row = Math.floor(i / COLS);
      const col = i % COLS;
      // center a partially filled last row
      const inRow = Math.min(COLS, skills.length - row * COLS);
      const offset = ((COLS - inRow) * (CARD_W + GAP_X)) / 2;
      return card(
        skill,
        Math.round(PAD + offset + col * (CARD_W + GAP_X)),
        PAD + row * (CARD_H + GAP_Y)
      );
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_W}" height="${height}" viewBox="0 0 ${PANEL_W} ${height}" shape-rendering="crispEdges" role="img" aria-label="Skills">
  <title>Skills</title>
  <path d="${notched(0, 0, PANEL_W, height, 4)}" fill="#30363d"/>
  <path d="${notched(1, 1, PANEL_W - 2, height - 2, 3)}" fill="#0d1117"/>
  ${cards}
</svg>
`;
}

// ───────────── Main ─────────────
function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });

  const skills = CATEGORIES.flatMap(c => c.skills);
  fs.writeFileSync(path.join(OUTPUT, "skills.svg"), panel(skills), "utf8");

  // Remove older per-category SVGs.
  for (const file of fs.readdirSync(OUTPUT)) {
    if (file.endsWith(".svg") && file !== "skills.svg") {
      fs.unlinkSync(path.join(OUTPUT, file));
    }
  }

  const block = [
    START,
    `<p align="center"><img src="./${OUTPUT}/skills.svg" alt="Skills" width="${DISPLAY_WIDTH}" /></p>`,
    END,
  ].join("\n");

  if (!fs.existsSync(README)) {
    console.log(`Card written. ${README} not found, so paste this where you want it:\n\n${block}`);
    return;
  }

  const readme = fs.readFileSync(README, "utf8");
  const s = readme.indexOf(START);
  const e = readme.indexOf(END);

  if (s === -1 || e === -1 || e < s) {
    console.log(
      `Card written to ${OUTPUT}/skills.svg.\nREADME.md has no ${START} / ${END} markers yet.\n` +
      `Put the block below under your Skills heading (replacing the badges):\n\n${block}`
    );
    return;
  }

  fs.writeFileSync(
    README,
    readme.slice(0, s) + block + readme.slice(e + END.length),
    "utf8"
  );
  console.log(`Generated skills panel (${skills.length} skills) and updated ${README}.`);
}

main();