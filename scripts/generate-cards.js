
const fs = require("node:fs");
const path = require("node:path");

const USER = "asxxb";
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

async function get(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${url}`);
  }
  return response.json();
}

function escapeXml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&apos;",
  })[char]);
}

function createCard(pr, status, summary, index) {
  const repo = pr.repository_url.split("/").slice(-2).join("/");
  const color = status === "Merged" ? "#3fb950"
    : status === "Open" ? "#58a6ff" : "#8b949e";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="180" viewBox="0 0 560 180">
  <rect width="558" height="178" x="1" y="1" rx="14" fill="#0d1117" stroke="#30363d"/>
  <text x="22" y="32" fill="#8b949e" font-size="12">${escapeXml(repo)}</text>
  <text x="22" y="62" fill="#f0f6fc" font-size="17" font-weight="600">${escapeXml(pr.title.slice(0, 55))}</text>
  <text x="22" y="86" fill="#c9d1d9" font-size="12">${escapeXml(summary.slice(0, 65))}</text>
  <rect x="22" y="112" width="95" height="27" rx="13" fill="#21262d"/>
  <text x="69" y="130" text-anchor="middle" fill="${color}" font-size="12">${status}</text>
  <text x="22" y="160" fill="#8b949e" font-size="11">PR #${pr.number} · Updated ${pr.updated_at.slice(0, 10)}</text>
</svg>`;

  fs.writeFileSync(path.join(OUTPUT, `pr-${index}.svg`), svg);
  return `[![${escapeXml(pr.title)}](./${OUTPUT}/pr-${index}.svg)](${pr.html_url})`;
}

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });

  // Discover public pull requests authored by this account.
  const results = await get(
    `${API}/search/issues?q=author:${USER}+type:pr&sort=updated&order=desc&per_page=100`
  );

  const cards = [];
  const prs = results.items.slice(0, 30);

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    const repoUrl = pr.repository_url;
    const details = await get(
      `${repoUrl}/pulls/${pr.number}`
    );

    const status = details.merged_at
      ? "Merged"
      : details.state === "open"
        ? "Open"
        : "Closed";

    const summary = (pr.body || pr.title)
      .replace(/[#*`[\]()>_!]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    cards.push(createCard(pr, status, summary, i + 1));
  }

  // Remove stale generated cards.
  for (const file of fs.readdirSync(OUTPUT)) {
    if (/^pr-\d+\.svg$/.test(file) &&
        !cards.some((_, i) => file === `pr-${i + 1}.svg`)) {
      fs.unlinkSync(path.join(OUTPUT, file));
    }
  }

  const section = [
    START,
    "## Open-source contributions",
    "",
    ...cards,
    "",
    cards.length
      ? `*Showing up to ${cards.length} recently updated public pull requests.*`
      : "No public pull requests were found for this account yet.",
    END,
  ].join("\n");

  const readme = fs.readFileSync(README, "utf8");

  if (!readme.includes(START) || !readme.includes(END)) {
    throw new Error(`Add ${START} and ${END} to README.md first.`);
  }

  const updated = readme.replace(
    new RegExp(`${START}[\\s\\S]*?${END}`),
    section
  );

  fs.writeFileSync(README, updated);
  console.log(`Generated ${cards.length} contribution cards.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
