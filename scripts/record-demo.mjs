// Records a short demo of the cowork-qa flow into a .webm video.
// Run: node scripts/record-demo.mjs
// Then convert to gif with: scripts/convert-gif.sh
import { chromium } from "playwright";
import { mkdir, rename, readdir } from "node:fs/promises";
import { join } from "node:path";

const VIDEO_DIR = "scripts/.demo-video";
const VIEWPORT = { width: 1100, height: 680 };

const overlayCSS = `
  #cqa-overlay {
    position: fixed; top: 16px; right: 16px; z-index: 999999;
    background: rgba(15,15,18,0.92); color: #fff;
    font: 14px/1.4 -apple-system, ui-sans-serif, system-ui, sans-serif;
    padding: 14px 18px; border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.08);
    width: 360px; backdrop-filter: blur(8px);
    transition: opacity 0.25s ease;
  }
  #cqa-overlay .cqa-label {
    font-size: 10px; letter-spacing: 1.2px; color: #8aa;
    text-transform: uppercase; margin-bottom: 4px;
  }
  #cqa-overlay .cqa-value { font-size: 14px; color: #eef; }
  #cqa-overlay .cqa-step {
    margin-top: 8px; padding-top: 8px;
    border-top: 1px solid rgba(255,255,255,0.06);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px; color: #9ce; word-break: break-all;
  }
`;

async function setOverlay(page, html) {
  await page.evaluate(({ html, css }) => {
    let el = document.querySelector("#cqa-overlay");
    if (!el) {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
      el = document.createElement("div");
      el.id = "cqa-overlay";
      document.body.appendChild(el);
    }
    el.innerHTML = html;
  }, { html, css: overlayCSS });
}

async function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await mkdir(VIDEO_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: VIDEO_DIR, size: VIEWPORT },
  });
  const page = await context.newPage();

  // Step 1 — goal
  await page.goto("https://www.apple.com/shop/buy-mac/macbook-pro", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector('h1:has-text("Buy MacBook Pro")', { timeout: 15000 });
  await pause(400);
  await setOverlay(page, `
    <div class="cqa-label">cowork-qa · session_start</div>
    <div class="cqa-value">Goal: Find the 14" MacBook Pro starting price</div>
  `);
  await pause(2000);

  // Step 2 — observe
  await setOverlay(page, `
    <div class="cqa-label">cowork-qa · session_observe</div>
    <div class="cqa-value">Reading aria-snapshot…</div>
    <div class="cqa-step">heading "Buy MacBook Pro"<br/>text: "From $1699 …"</div>
  `);
  await pause(2200);

  // Step 3 — verdict
  await setOverlay(page, `
    <div class="cqa-label">cowork-qa · qa_get_trace</div>
    <div class="cqa-value">Goal achieved · Starting price: <b>$1,699</b></div>
    <div class="cqa-step">14-inch MacBook Pro · M5/M5 Pro/M5 Max</div>
  `);
  await pause(2400);

  await context.close();
  await browser.close();

  // Find the video file (Playwright names it with a random suffix)
  const files = await readdir(VIDEO_DIR);
  const webm = files.find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("no video produced");
  const final = join(VIDEO_DIR, "demo.webm");
  await rename(join(VIDEO_DIR, webm), final);
  console.log(`Wrote ${final}`);
}

await main();
