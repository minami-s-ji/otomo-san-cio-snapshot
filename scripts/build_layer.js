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

// レイヤ別最低文字数
const MIN_CHARS_BY_LAYER = {
  L1: 500,
  L2: 500,
  L3: 200,
  L4: 1,    // ← ★重要：L4は「存在すればOK」
  L5: 500,
};
const MIN_CHARS = MIN_CHARS_BY_LAYER[layer] ?? 300;

const NAV_RETRIES = 3;

(async () => {
  if (!fs.existsSync(TEMPLATE_FILE)) {
    throw new Error(`Template not found: ${TEMPLATE_FILE}`);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });

  let cleaned = "";
  let lastErr = null;

  for (let i = 1; i <= NAV_RETRIES; i++) {
    try {
      cleaned = await fetchNotionText(page, url);
      if (cleaned.length >= MIN_CHARS) break;
    } catch (e) {
      lastErr = e;
    }
  }

  await browser.close();

  if (cleaned.length < MIN_CHARS) {
    throw new Error(
      `${layer}: Content too short (${cleaned.length}). Min required=${MIN_CHARS}.`
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
  console.error(e.message || e);
  process.exit(1);
});

async function fetchNotionText(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  await autoScroll(page);
  await page.waitForTimeout(1000);

  const text = await page.evaluate(() => {
    const candidates = [
      document.querySelector(".notion-page-content"),
      document.querySelector("main"),
      document.querySelector('[role="main"]'),
      document.body,
    ];
    for (const el of candidates) {
      const t = el ? el.innerText : "";
      if (t && t.trim().length > 0) return t;
    }
    return "";
  });

  return normalizeText(text);
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const distance = 800;
      let count = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        count++;
        if (
          window.innerHeight + window.scrollY >= document.body.scrollHeight - 200 ||
          count > 30
        ) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 200);
    });
  });
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
