const fs = require("fs");
const { chromium } = require("playwright");

const URL =
  "PUT_L2_NOTION_PUBLIC_URL_HERE";

const OUT_FILE = "docs/L2.html";
const TEMPLATE_FILE = "docs/L2.html";
const PRE_REGEX = /<pre id="content">[\s\S]*?<\/pre>/;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);

  const text = await page.evaluate(() => {
    const el =
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.body;
    return el ? el.innerText : "";
  });

  await browser.close();

  const cleaned = normalizeText(text);
  const MIN_CHARS = 500;
  if (cleaned.length < MIN_CHARS) {
    throw new Error(`Content too short (${cleaned.length}). Abort.`);
  }

  const template = fs.readFileSync(TEMPLATE_FILE, "utf-8");
  if (!PRE_REGEX.test(template)) throw new Error("Template missing <pre id=\"content\">");

  const updated = template.replace(
    PRE_REGEX,
    `<pre id="content">${escapeHtml(cleaned)}</pre>`
  );

  fs.writeFileSync(OUT_FILE, updated, "utf-8");
  console.log(`Updated L2.html (chars=${cleaned.length})`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

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
