const fs = require("fs");
const cheerio = require("cheerio");

// Notion の L1 公開URL（あなたのURLのままでOK）
const L1_URL =
  "https://relieved-animantarx-a06.notion.site/L1-CIO-2cd840b3d8eb80cbb93deffcb4d825e1";

const OUT_FILE = "docs/L1.html";
const TEMPLATE_FILE = "docs/L1.html"; // 同じファイルをテンプレとして差し替える運用
const PRE_REGEX = /<pre id="content">[\s\S]*?<\/pre>/;

async function run() {
  const res = await fetch(L1_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (GitHubActions) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) throw new Error(`Failed to fetch L1: ${res.status}`);

  const notionHtml = await res.text();

  const $ = cheerio.load(notionHtml);
  $("script, style, noscript, svg, iframe, canvas").remove();

  const candidates = [
    "main",
    "article",
    '[role="main"]',
    ".notion-page-content",
    ".notion-scroller",
    "body",
  ];

  let text = "";
  for (const sel of candidates) {
    const t = $(sel).text();
    if (t && t.trim().length > 200) {
      text = t;
      break;
    }
  }
  if (!text) text = $("body").text() || "";

  const cleaned = normalizeText(text);

  // ★事故防止：短すぎる場合は失敗扱いにして「空で上書き」を止める
  const MIN_CHARS = 500;
  if (cleaned.length < MIN_CHARS) {
    throw new Error(
      `Content too short (${cleaned.length}). Abort to prevent empty overwrite.`
    );
  }

  const template = fs.readFileSync(TEMPLATE_FILE, "utf-8");
  if (!PRE_REGEX.test(template)) {
    throw new Error(
      `Template does not contain <pre id="content">...</pre>: ${TEMPLATE_FILE}`
    );
  }

  const updated = template.replace(
    PRE_REGEX,
    `<pre id="content">${escapeHtml(cleaned)}</pre>`
  );

  fs.writeFileSync(OUT_FILE, updated, "utf-8");
  console.log(`Updated: ${OUT_FILE} (chars=${cleaned.length})`);
}

function normalizeText(input) {
  return (input || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
