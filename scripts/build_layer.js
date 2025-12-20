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

// レイヤ別最低文字数（現実に合わせた下限）
const MIN_CHARS_BY_LAYER = {
  L1: 500,
  L2: 500,
  L3: 200,
  L4: 200,
  L5: 500,
};
const MIN_CHARS = MIN_CHARS_BY_LAYER[layer] ?? 300;

// Notion対策：ページ取得自体をリトライする回数
const NAV_RETRIES = 3;

(async () => {
  if (!fs.existsSync(TEMPLATE_FILE)) {
    throw new Error(`Template not found: ${TEMPLATE_FILE}`);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({
    // NotionはUAや表示幅で挙動が変わることがあるので固定
    viewport: { width: 1280, height: 720 },
  });

  let cleaned = "";
  let lastErr = null;

  for (let i = 1; i <= NAV_RETRIES; i++) {
    try {
      cleaned = await fetchNotionText(page, url, MIN_CHARS);
      if (cleaned.length >= MIN_CHARS) break;
    } catch (e) {
      lastErr = e;
      // 次のトライへ
    }
  }

  await browser.close();

  if (cleaned.length < MIN_CHARS) {
    const msg = `Content too short (${cleaned.length}). Min required=${MIN_CHARS}.`;
    // “存在する”前提なので、ここは止める（取りこぼしを見逃さない）
    throw new Error(
      `${layer}: ${msg} (after ${NAV_RETRIES} retries) ${lastErr ? " lastErr=" + (lastErr.message || lastErr) : ""}`
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

async function fetchNotionText(page, url, minChars) {
  // 1回目で変な状態を掴んだ時に備えて、毎回新規ロード扱いに寄せる
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  // mainが出るまで待つ（出ないページもあるのでタイムアウトあり）
  await page.waitForTimeout(1500);

  // 「本文がある程度の長さになるまで」待つ（ここが最重要）
  // Notionは描画が遅い時があるので最大45秒まで待つ
  try {
    await page.waitForFunction(
      (n) => {
        const el =
          document.querySelector("main") ||
          document.querySelector('[role="main"]') ||
          document.body;
        const t = el ? el.innerText : "";
        // “Loading”っぽい状態や極端に短い状態を弾く
        return t && t.replace(/\s+/g, " ").trim().length >= n;
      },
      minChars,
      { timeout: 45000 }
    );
  } catch {
    // waitForFunctionが落ちても一応取得はして判定に回す（リトライさせるため）
  }

  // 念のためちょい待ち（Notion対策）
  await page.waitForTimeout(1000);

  const text = await page.evaluate(() => {
    const el =
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.body;
    return el ? el.innerText : "";
  });

  const cleaned = normalizeText(text);

  // Notionが何らかの理由で「変なページ」を返した時の簡易検知（軽め）
  if (/you do not have access|access denied|not found/i.test(cleaned)) {
    throw new Error("Looks like an error page (access/not found).");
  }

  return cleaned;
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
