#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";

const [htmlArg, pdfArg] = process.argv.slice(2);
if (!htmlArg || !pdfArg) {
  console.error("Usage: node templates/validate-and-render-quote.mjs <quote.html> <output.pdf>");
  process.exit(2);
}

const htmlPath = resolve(htmlArg);
const pdfPath = resolve(pdfArg);
const html = readFileSync(htmlPath, "utf8");
const errors = [];
const bundledPoppler = resolve(process.env.HOME || "/nonexistent", ".cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin");
const pdfFontsBin = existsSync(resolve(bundledPoppler, "pdffonts")) ? resolve(bundledPoppler, "pdffonts") : "pdffonts";
const tokenMatches = [...html.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((match) => match[1]);
if (tokenMatches.length) errors.push(`Unresolved template tokens: ${[...new Set(tokenMatches)].sort().join(", ")}`);

const legal = html.match(/<meta\s+name=["']lake-salt-legal-status["']\s+content=["']([^"']+)["']/i)?.[1] ?? "";
if (!/^APPROVED-FOR-PRODUCTION:\d{4}-\d{2}-\d{2}:[A-Za-z0-9._-]+$/.test(legal)) {
  errors.push("Legal version is not approved for production. Expected APPROVED-FOR-PRODUCTION:YYYY-MM-DD:REVISION-ID.");
}

const text = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ");
const status = text.match(/Price status\s*(?::)?\s*(Preliminary estimate|Final quote)/i)?.[1];
if (!status) errors.push("PRICE_STATUS must resolve to exactly Preliminary estimate or Final quote.");

const overtime = text.match(/billed at\s+(\$[\d,.]+\s+per\s+[^.]+)/i)?.[1];
if (!overtime) errors.push("Missing explicit overtime dollar rate and billing unit.");

const paymentBlock = text.match(/Deposit payment:\s*(\S+)/i)?.[1] ?? "";
if (status?.toLowerCase() === "final quote") {
  try {
    const paymentUrl = new URL(paymentBlock);
    if (paymentUrl.protocol !== "https:" || /example\.invalid|replace|placeholder/i.test(paymentUrl.href)) throw new Error();
  } catch {
    errors.push("Final quote requires an actual HTTPS PAYMENT_LINK; placeholders and example.invalid are rejected.");
  }

  const prices = [...html.matchAll(/class=["']price["'][^>]*>\s*\$([\d,]+(?:\.\d{2})?)/gi)].map((match) => Number(match[1].replaceAll(",", "")));
  const deposits = new Map([...text.matchAll(/Option\s+(\d+)\s*:\s*\$([\d,]+(?:\.\d{2})?)/gi)].map((match) => [Number(match[1]), Number(match[2].replaceAll(",", ""))]));
  if (!prices.length) errors.push("Final quote has no option prices to validate.");
  prices.forEach((price, index) => {
    const option = index + 1;
    const expected = Math.round(price * 10) / 100;
    const actual = deposits.get(option);
    if (actual === undefined) errors.push(`Missing exact deposit amount for Option ${option}.`);
    else if (Math.abs(actual - expected) > 0.001) errors.push(`Option ${option} deposit must be exactly 10%: expected $${expected.toFixed(2)}, found $${actual.toFixed(2)}.`);
  });
  if (!/paying\s+the\s+exact\s+10%\s+deposit[\s\S]*confirms\s+acceptance/i.test(text)) {
    errors.push("Final quote must state that paying the exact 10% deposit confirms acceptance.");
  }
} else if (status?.toLowerCase() === "preliminary estimate") {
  if (/Deposit payment:|Ready to reserve|pay(?:ing)?[^.]{0,100}(?:deposit|accept)|deposit[^.]{0,100}(?:accept|reserve)/i.test(text)) {
    errors.push("Preliminary estimate contains payment/deposit acceptance or reservation language.");
  }
  if (!/(?:cannot|can't)\s+be\s+accepted/i.test(text) || !/request\s+(?:a\s+)?Final quote/i.test(text)) {
    errors.push("Preliminary estimate requires a non-acceptance CTA inviting the client to request a Final quote.");
  }
  if (/https:\/\//i.test(paymentBlock)) errors.push("Preliminary estimate must not contain a payment link.");
}

const requiredFonts = ["DejaVuSerif.ttf", "DejaVuSerif-Bold.ttf", "DejaVuSans.ttf", "DejaVuSans-Bold.ttf"];
for (const font of requiredFonts) {
  if (!html.includes(`fonts/${font}`)) errors.push(`Missing deterministic bundled-font CSS reference: fonts/${font}`);
  const fontPath = resolve(dirname(htmlPath), "fonts", font);
  if (!existsSync(fontPath) || statSync(fontPath).size < 10_000) errors.push(`Missing or invalid bundled font asset: fonts/${font}`);
}

for (const match of html.matchAll(/<(?:img|link|script)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)) {
  const asset = match[1];
  if (/^(?:https?:|data:|#|mailto:|tel:)/i.test(asset)) continue;
  if (asset.startsWith("file:") || isAbsolute(asset)) {
    errors.push(`Non-portable absolute asset reference: ${asset}`);
    continue;
  }
  const assetPath = resolve(dirname(htmlPath), asset.split(/[?#]/)[0]);
  if (!existsSync(assetPath) || !statSync(assetPath).isFile()) errors.push(`Missing local asset: ${asset}`);
}

if (extname(htmlPath).toLowerCase() !== ".html") errors.push("Input must be an HTML file.");
if (extname(pdfPath).toLowerCase() !== ".pdf") errors.push("Output must be a PDF file.");
if (errors.length) {
  console.error(`QUOTE VALIDATION FAILED\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

const chromeCandidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "google-chrome",
  "chromium",
].filter(Boolean);
let chrome = chromeCandidates.find((candidate) => candidate.includes("/") ? existsSync(candidate) : true);
if (!chrome) throw new Error("Chrome/Chromium not found; set CHROME_BIN.");

mkdirSync(dirname(pdfPath), { recursive: true });
execFileSync(chrome, ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { stdio: "inherit" });
if (!existsSync(pdfPath) || statSync(pdfPath).size < 10_000) throw new Error("Rendered PDF is missing or unexpectedly small.");

const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
if (!/Page size:\s+612\s+x\s+792\s+pts\s+\(letter\)/i.test(info)) throw new Error("Rendered PDF is not US Letter 612 x 792 pt.");
const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
if (!pages) throw new Error("Rendered PDF has no pages.");

const fonts = execFileSync(pdfFontsBin, [pdfPath], { encoding: "utf8" });
for (const family of ["DejaVuSerif", "DejaVuSans"]) {
  const rows = fonts.split("\n").filter((row) => row.includes(family));
  if (!rows.length || rows.some((row) => !/\byes\s+yes\s+yes\b/i.test(row))) {
    throw new Error(`Rendered PDF does not deterministically embed ${family}.`);
  }
}

const renderPrefix = pdfPath.replace(/\.pdf$/i, "-visual-qa-page");
execFileSync("pdftoppm", ["-png", "-r", "110", pdfPath, renderPrefix], { stdio: "inherit" });
for (let page = 1; page <= pages; page += 1) {
  const png = `${renderPrefix}-${page}.png`;
  if (!existsSync(png) || statSync(png).size < 5_000) throw new Error(`Visual-QA image missing or unexpectedly small: ${png}`);
}
console.log(`QUOTE VALIDATION PASSED: ${pages} letter-size pages rendered to ${pdfPath}`);
console.log(`VISUAL INSPECTION STILL REQUIRED: inspect all ${pages} PNG visual-QA images at ${renderPrefix}-*.png before sending.`);
