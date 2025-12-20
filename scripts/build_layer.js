const fs = require("fs");
const { chromium } = require("playwright");

const layer = process.argv[2]; // "L1" など
const url = process.argv[3]; // Notion公開URL

if (!layer || !url) {
  console.error("Usage: node scripts/build_layer.js <LAYER> <URL>");
  process.exit(1);
}

// ★ ここが今回のエラー原因に直結：テンプレは必ず docs/_template.html
const OUT_FILE = `docs/${layer}.html`;
const TEMPLATE_FILE = "docs/_template.html";
const PRE_REGEX = /<pre id="content">[\s\S]*?<\/pre>/;

(async () => {
  // 念のため：テンプレがあるか最初にチェックして、分かりやすく落とす
  if (!fs.existsSync(TEMPLATE_FILE)) {
    throw new Error(`Template not found: ${TEMPLATE_FILE}`);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  const cleaned = await waitAndExtract(page);

  await browser.close();

  const MIN_CHARS = 500;
  if (cleaned.length < MIN_CHARS) {
    throw new Error(
      `Content too short (${cleaned.length}). Abort to prevent overwrite.`
    );
  }

  const template = fs.readFileSync(TEMPLATE_FILE, "utf-8");
  if (!PRE_REGEX.test(template)) {
    throw new Error('Template missing <pre id="content">');
  }

  const updated = template.replace(
    PRE_REGEX,
    `<pre id="content">${escapeHtml(cleaned)}</pre>`
  );

  fs.writeFileSync(OUT_FILE, updated, "utf-8");
  console.log(`Updated ${layer}.html (chars=${cleaned.length})`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

async function waitAndExtract(page) {
  const waits = [3000, 6000, 10000];
  let last = "";

  for (const w of waits) {
    await page.waitForTimeout(w);
    const text = await page.evaluate(() => {
      const el =
        document.querySelector("main") ||
        document.querySelector('[role="main"]') ||
        document.body;
      return el ? el.innerText : "";
    });
    last = normalizeText(text);
    if (last.length >= 500) return last;
  }
  return last;
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
