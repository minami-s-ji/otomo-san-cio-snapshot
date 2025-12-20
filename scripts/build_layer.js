const fs = require("fs");
const { chromium } = require("playwright");

const layer = process.argv[2]; // L1〜L5
const url = process.argv[3];

if (!layer || !url) {
  console.error("Usage: node scripts/build_layer.js <LAYER> <URL>");
  process.exit(1);
}

const OUT_FILE = `docs/${layer}.html`;
const TEMPLATE_FILE = "docs/_template.html";
const PRE_REGEX = /<pre id="content">[\s\S]*?<\/pre>/;

const MIN_CHARS_BY_LAYER = {
  L1: 500,
  L2: 500,
  L3: 200,
  L4: 200,
  L5: 500,
};

const MIN_CHARS = MIN_CHARS_BY_LAYER[layer] ?? 300;
const IS_OPTIONAL_LAYER = layer === "L5"; // ★ L5だけ特別扱い

(async () => {
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

  if (cleaned.length < MIN_CHARS) {
    const msg = `Content too short (${cleaned.length}). Min required=${MIN_CHARS}.`;

    if (IS_OPTIONAL_LAYER) {
      console.warn(`[SKIP] ${layer}: ${msg} Keep previous version.`);
      process.exit(0); // ★ ここが重要：止めない
    } else {
      throw new Error(msg);
    }
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
  console.error(e.message || e);
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
    if (last.length >= 200) return last;
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
