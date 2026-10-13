
const fs = require("node:fs");
const path = require("node:path");

const USER = "asxxb";

const EXCLUDED_REPOS = new Set([
  "Thegiantsaint/hackrealm",
  "asxxb/pysong",
]);

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

const avatarCache = new Map();

async function get(url) {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `GitHub API error ${response.status}: ${url}`
    );
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

// Embed the repository owner's GitHub avatar inside the SVG.
// This avoids relying on an external image loading inside the card.
async function getAvatarDataUri(owner) {
  if (!avatarCache.has(owner)) {
    avatarCache.set(owner, (async () => {
      try {
        const response = await fetch(
          `https://github.com/${encodeURIComponent(owner)}.png?size=64`
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

async function createCard(pr, status, summary, index) {
  const [owner, repoName] = pr.repository_url
    .split("/")
    .slice(-2);

  const avatar = await getAvatarDataUri(owner);

  const colors = {
    Merged: "#3fb950",
    Open: "#58a6ff",
    Closed: "#8b949e",
  };

  const color = colors[status];

  const avatarMarkup = avatar
    ? `<image href="${avatar}" x="18" y="16"
         width="38" height="38"
         preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="37" cy="35" r="19" fill="#21262d"/>
       <text x="37" y="40" fill="#f0f6fc"
         font-size="15" text-anchor="middle"
         font-weight="600">${escapeXml(owner[0].toUpperCase())}</text>`;

  const title = cleanText(pr.title).slice(0, 43);
  const description = cleanText(summary).slice(0, 66);

  const statusLabel = {
    Merged: "✓ Merged",
    Open: "● Open",
    Closed: "● Closed",
  }[status];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg"
    width="340" height="190" viewBox="0 0 340 190">
    <rect x="1" y="1" width="338" height="188" rx="14"
      fill="#0d1117" stroke="#30363d"/>

    ${avatarMarkup}

    <text x="66" y="29" fill="#f0f6fc"
      font-size="13" font-weight="600">${escapeXml(repoName)}</text>
    <text x="66" y="47" fill="#8b949e"
      font-size="10">${escapeXml(owner)}</text>

    <line x1="17" y1="66" x2="323" y2="66"
      stroke="#30363d"/>

    <text x="18" y="89" fill="#f0f6fc"
      font-size="12" font-weight="600">${escapeXml(title)}</text>

    <text x="18" y="111" fill="#c9d1d9"
      font-size="10">${escapeXml(description)}</text>

    <rect x="18" y="130" width="91" height="24"
      rx="12" fill="#21262d"/>

    <text x="63.5" y="145.5" fill="${color}"
      font-size="10" text-anchor="middle">${statusLabel}</text>

    <text x="18" y="174" fill="#8b949e"
      font-size="10">PR #${pr.number}</text>

    <text x="322" y="174" fill="#58a6ff"
      font-size="10" text-anchor="end">View PR ↗</text>
  </svg>`;

  const filename = `pr-${index}.svg`;

  fs.writeFileSync(
    path.join(OUTPUT, filename),
    svg,
    "utf8"
  );

  return {
    image: `./${OUTPUT}/${filename}`,
    url: pr.html_url,
    title: pr.title,
  };
}

async function main() {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is missing.");
  }

  fs.mkdirSync(OUTPUT, { recursive: true });

  // Search for public pull requests authored by this account.
  const searchUrl = new URL(`${API}/search/issues`);

  searchUrl.searchParams.set(
    "q",
    `author:${USER} type:pr`
  );
  searchUrl.searchParams.set("sort", "updated");
  searchUrl.searchParams.set("order", "desc");
  searchUrl.searchParams.set("per_page", "100");

  const results = await get(searchUrl.toString());

  // Exclude entire repositories before limiting the results.
  const prs = results.items
    .filter(pr => {
      const repo = pr.repository_url
        .split("/")
        .slice(-2)
        .join("/");

      return !EXCLUDED_REPOS.has(repo);
    })
    .slice(0, 30);

  const cards = [];

  for (const pr of prs) {
    const details = await get(
      `${pr.repository_url}/pulls/${pr.number}`
    );

    const status = details.merged_at
      ? "Merged"
      : details.state === "open"
        ? "Open"
        : "Closed";

    const summary = cleanText(pr.body || pr.title);

    cards.push(
      await createCard(
        pr,
        status,
        summary,
        cards.length + 1
      )
    );
  }

  // Delete old generated cards that are no longer needed.
  for (const file of fs.readdirSync(OUTPUT)) {
    if (
      /^pr-\d+\.svg$/.test(file) &&
      !cards.some((_, index) => file === `pr-${index + 1}.svg`)
    ) {
      fs.unlinkSync(path.join(OUTPUT, file));
    }
  }

  // Build a responsive-looking three-column HTML table.
  const rows = [];

  for (let i = 0; i < cards.length; i += 3) {
    const cells = cards.slice(i, i + 3).map(card => `
      <td width="33.33%" valign="top" align="center">
        <a href="${escapeXml(card.url)}">
          <img
            src="${escapeXml(card.image)}"
            width="100%"
            alt="${escapeXml(card.title)}"
          />
        </a>
      </td>
    `);

    while (cells.length < 3) {
      cells.push('<td width="33.33%"></td>');
    }

    rows.push(`<tr>${cells.join("")}</tr>`);
  }

  // const section = [
  //   START,
  //   "## Open-source contributions",
  //   "",
  //   "<table>",
  //   "<tbody>",
  //   ...rows,
  //   "</tbody>",
  //   "</table>",
  //   "",
  //   cards.length
  //     ? `*Showing ${cards.length} public pull requests. Updated automatically.*`
  //     : "No eligible public pull requests were found.",
  //   END,
  // ].join("\n");

  
const rows = [];

for (let i = 0; i < cards.length; i += 3) {
  const row = cards.slice(i, i + 3).map(card =>
    `<a href="${card.url}"><img src="${card.image}" width="260" alt="${escapeXml(card.title)}" /></a>`
  );

  while (row.length < 3) {
    row.push("");
  }

  rows.push(`| ${row.join(" | ")} |`);
}

const section = [
  START,
  "## Open-source contributions",
  "",
  "| Contribution | Contribution | Contribution |",
  "|---|---|---|",
  ...rows,
  "",
  cards.length
    ? `*Showing ${cards.length} public pull requests. Updated automatically.*`
    : "No eligible public pull requests were found.",
  END,
].join("\n");


  const readme = fs.readFileSync(README, "utf8");

  const startIndex = readme.indexOf(START);
  const endIndex = readme.indexOf(END);

  if (
    startIndex === -1 ||
    endIndex === -1 ||
    endIndex < startIndex
  ) {
    throw new Error(
      "README.md must contain both contribution markers."
    );
  }

  const updated =
    readme.slice(0, startIndex) +
    section +
    readme.slice(endIndex + END.length);

  fs.writeFileSync(README, updated, "utf8");

  console.log(
    `Generated ${cards.length} contribution cards.`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
