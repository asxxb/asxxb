const fs = require("node:fs");
const path = require("node:path");

// ───────────── Config ─────────────
const USER = "asxxb";

// Repos to hide completely ("owner/repo").
const EXCLUDED_REPOS = new Set([
  "Thegiantsaint/hackrealm",
  "asxxb/pysong",
].map(r => r.toLowerCase()));

// PRs into your own repos/forks (e.g. asxxb/leveldb) are usually duplicates
// of the upstream PR. Set to true if you want them shown anyway.
const INCLUDE_OWN_REPOS = false;

// Max cards shown (keep it even for the 2-column layout).
const MAX_CARDS = 12;
const COLUMNS = 2;

const API = "https://api.github.com";
const OUTPUT = "assets/contributions";
const README = "README.md";
const START = "<!-- CONTRIBUTIONS:START -->";
const END = "<!-- CONTRIBUTIONS:END -->";

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28",
};

// GitHub's own state colors.
const STATUS = {
  Merged: { color: "#a371f7", order: 0 },
  Open: { color: "#3fb950", order: 1 },
  Closed: { color: "#f85149", order: 2 },
};

// ───────────── Helpers ─────────────
async function get(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}: ${url}`);
  }
  return response.json();
}

function escapeXml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[char]);
}

function cleanText(value = "") {
  return String(value)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`*_>#~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Word-wrap into at most `maxLines` lines, adding "…" if text is cut.
function wrap(text, maxChars, maxLines) {
  const words = text.split(" ");
  const lines = [];
  let line = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = line ? `${line} ${word}` : word;

    if (next.length <= maxChars) {
      line = next;
      continue;
    }

    if (line) lines.push(line);
    line = word.length > maxChars ? word.slice(0, maxChars - 1) + "…" : word;

    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && line) lines.push(line);

  const consumed = lines.join(" ").replace(/…$/, "").length;
  if (lines.length === maxLines && consumed < text.length - 1) {
    const last = lines[maxLines - 1].replace(/…$/, "");
    lines[maxLines - 1] =
      (last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last).trimEnd() + "…";
  }

  return lines.slice(0, maxLines);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const avatarCache = new Map();

function getAvatarDataUri(owner) {
  if (!avatarCache.has(owner)) {
    avatarCache.set(owner, (async () => {
      try {
        const response = await fetch(
          `https://github.com/${encodeURIComponent(owner)}.png?size=80`
        );
        if (!response.ok) return null;

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) return null;

        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 200_000) return null;

        return `data:${contentType};base64,${bytes.toString("base64")}`;
      } catch {
        return null;
      }
    })());
  }
  return avatarCache.get(owner);
}

// ───────────── Card ─────────────
const W = 440;
const H = 170;
const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`;

async function createCard(pr) {
  const { owner, repo, status, color } = pr;
  const avatar = await getAvatarDataUri(owner);

  const avatarMarkup = avatar
    ? `<clipPath id="av"><rect x="20" y="18" width="40" height="40" rx="9"/></clipPath>
  <image href="${avatar}" x="20" y="18" width="40" height="40"
    clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="20" y="18" width="40" height="40" rx="9" class="avfallback"/>
  <text x="40" y="44" text-anchor="middle" class="initial">${escapeXml(owner[0].toUpperCase())}</text>`;

  const titleLines = wrap(cleanText(pr.title), 46, 2);
  const titleMarkup = titleLines
    .map((line, i) =>
      `<text x="20" y="${92 + i * 20}" class="title">${escapeXml(line)}</text>`)
    .join("\n  ");

  const pillW = 86;
  const pillX = W - 20 - pillW;

  const files = pr.changedFiles === 1 ? "1 file" : `${pr.changedFiles} files`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(`${repo} PR #${pr.number}: ${pr.title}`)}">
  <style>
    text { font-family: ${FONT}; }
    .card { fill: #0d1117; stroke: #30363d; }
    .divider { stroke: #21262d; }
    .repo { fill: #f0f6fc; font-size: 16px; font-weight: 600; }
    .owner, .meta { fill: #8b949e; font-size: 12px; }
    .title { fill: #e6edf3; font-size: 14px; font-weight: 600; }
    .add { fill: #3fb950; font-size: 12px; font-weight: 600; }
    .del { fill: #f85149; font-size: 12px; font-weight: 600; }
    .avfallback { fill: #21262d; }
    .initial { fill: #f0f6fc; font-size: 18px; font-weight: 600; }
    @media (prefers-color-scheme: light) {
      .card { fill: #ffffff; stroke: #d0d7de; }
      .divider { stroke: #eaeef2; }
      .repo, .initial { fill: #1f2328; }
      .owner, .meta { fill: #59636e; }
      .title { fill: #1f2328; }
      .avfallback { fill: #eaeef2; }
      .add { fill: #1a7f37; }
      .del { fill: #cf222e; }
    }
  </style>

  <rect class="card" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14"/>

  ${avatarMarkup}

  <text x="72" y="35" class="repo">${escapeXml(repo.length > 24 ? repo.slice(0, 23) + "…" : repo)}</text>
  <text x="72" y="52" class="owner">${escapeXml(owner)}</text>

  <rect x="${pillX}" y="20" width="${pillW}" height="26" rx="13"
    fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-opacity="0.5"/>
  <circle cx="${pillX + 18}" cy="33" r="4" fill="${color}"/>
  <text x="${pillX + 30}" y="37.5" fill="${color}" font-size="12" font-weight="600">${status}</text>

  <line class="divider" x1="20" y1="68" x2="${W - 20}" y2="68"/>

  ${titleMarkup}

  <text x="20" y="152">
    <tspan class="add">+${pr.additions}</tspan>
    <tspan class="del" dx="8">−${pr.deletions}</tspan>
    <tspan class="meta" dx="10">· ${files}</tspan>
  </text>
  <text x="${W - 20}" y="152" text-anchor="end" class="meta">#${pr.number} · ${formatDate(pr.date)}</text>
</svg>`;

  // Stable filename → no pointless diffs when the order changes.
  const safe = s => s.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const filename = `${safe(owner)}__${safe(repo)}__${pr.number}.svg`;
  fs.writeFileSync(path.join(OUTPUT, filename), svg, "utf8");

  return {
    filename,
    image: `./${OUTPUT}/${filename}`,
    url: pr.url,
    alt: `${owner}/${repo} PR #${pr.number}: ${pr.title}`,
  };
}

// ───────────── Main ─────────────
async function main() {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is missing.");
  }

  fs.mkdirSync(OUTPUT, { recursive: true });

  const searchUrl = new URL(`${API}/search/issues`);
  searchUrl.searchParams.set("q", `author:${USER} type:pr is:public`);
  searchUrl.searchParams.set("sort", "updated");
  searchUrl.searchParams.set("order", "desc");
  searchUrl.searchParams.set("per_page", "100");

  const results = await get(searchUrl.toString());

  const candidates = results.items.filter(item => {
    const [owner, repo] = item.repository_url.split("/").slice(-2);
    const full = `${owner}/${repo}`.toLowerCase();

    if (EXCLUDED_REPOS.has(full)) return false;
    if (!INCLUDE_OWN_REPOS && owner.toLowerCase() === USER.toLowerCase()) {
      return false;
    }
    return true;
  });

  // Fetch details (state, additions, deletions, files) in parallel.
  const prs = await Promise.all(
    candidates.map(async item => {
      const [owner, repo] = item.repository_url.split("/").slice(-2);
      const d = await get(`${item.repository_url}/pulls/${item.number}`);

      const status = d.merged_at ? "Merged" : d.state === "open" ? "Open" : "Closed";
      const date = d.merged_at || d.closed_at || d.created_at;

      return {
        owner,
        repo,
        number: item.number,
        title: item.title,
        url: item.html_url,
        status,
        color: STATUS[status].color,
        date,
        updated: d.updated_at,
        additions: d.additions ?? 0,
        deletions: d.deletions ?? 0,
        changedFiles: d.changed_files ?? 0,
      };
    })
  );

  // Merged first, then open, then closed; newest first within each group.
  prs.sort((a, b) =>
    STATUS[a.status].order - STATUS[b.status].order ||
    new Date(b.updated) - new Date(a.updated)
  );

  const counts = { Merged: 0, Open: 0, Closed: 0 };
  for (const pr of prs) counts[pr.status]++;

  const shown = prs.slice(0, MAX_CARDS);
  const cards = [];
  for (const pr of shown) cards.push(await createCard(pr));

  // Remove SVGs that are no longer used.
  const keep = new Set(cards.map(c => c.filename));
  for (const file of fs.readdirSync(OUTPUT)) {
    if (file.endsWith(".svg") && !keep.has(file)) {
      fs.unlinkSync(path.join(OUTPUT, file));
    }
  }

  // HTML table with no header row (Markdown tables force a header).
  const cellWidth = Math.floor(100 / COLUMNS);
  const rows = [];
  for (let i = 0; i < cards.length; i += COLUMNS) {
    const cells = cards.slice(i, i + COLUMNS).map(card =>
      `<td width="${cellWidth}%" align="center"><a href="${escapeXml(card.url)}"><img src="${escapeXml(card.image)}" alt="${escapeXml(card.alt)}" width="100%" /></a></td>`
    );
    while (cells.length < COLUMNS) cells.push(`<td width="${cellWidth}%"></td>`);
    rows.push(`<tr>${cells.join("")}</tr>`);
  }

  const summaryLine = [
    counts.Merged && `${counts.Merged} merged`,
    counts.Open && `${counts.Open} open`,
    counts.Closed && `${counts.Closed} closed`,
  ].filter(Boolean).join(" · ");

  const allLink = `https://github.com/search?q=${encodeURIComponent(`author:${USER} type:pr is:public`)}&type=pullrequests`;

  const footer = prs.length > shown.length
    ? `<sub>Showing ${shown.length} of ${prs.length} public pull requests · <a href="${allLink}">see all</a> · updated automatically</sub>`
    : `<sub>Showing ${shown.length} public pull requests · updated automatically</sub>`;

  const section = cards.length
    ? [
        START,
        "## Open-source contributions",
        "",
        `**${summaryLine}**`,
        "",
        "<table>",
        ...rows,
        "</table>",
        "",
        footer,
        END,
      ].join("\n")
    : [START, "## Open-source contributions", "", "No eligible public pull requests were found.", END].join("\n");

  // Replace only the generated section of README.md.
  const readme = fs.readFileSync(README, "utf8");
  const startIndex = readme.indexOf(START);
  const endIndex = readme.indexOf(END);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error("README.md must contain both contribution markers.");
  }

  const updated =
    readme.slice(0, startIndex) + section + readme.slice(endIndex + END.length);

  fs.writeFileSync(README, updated, "utf8");
  console.log(`Generated ${cards.length} contribution cards (${prs.length} eligible PRs).`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
