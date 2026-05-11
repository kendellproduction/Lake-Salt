// Reads website/data/recipes.json and:
//   1. Writes a static HTML page per recipe to website/recipes/<slug>.html
//   2. Regenerates website/sitemap.xml
//   3. Injects RECIPES (as JSON) into the hub recipes.html so the hub renders
//      cards that LINK to the detail pages.
//
// Run: node website/scripts/build-recipes.mjs
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderRecipe } from './recipe-template.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBSITE = join(__dirname, '..');
const DATA = join(WEBSITE, 'data', 'recipes.json');
const RECIPES_DIR = join(WEBSITE, 'recipes');
const SITEMAP = join(WEBSITE, 'sitemap.xml');
const HUB = join(WEBSITE, 'recipes.html');

const HUB_START = '/*__RECIPES_JSON_START__*/';
const HUB_END = '/*__RECIPES_JSON_END__*/';

const recipes = JSON.parse(readFileSync(DATA, 'utf8'));

// 1. Per-recipe pages — wipe existing .html in /recipes first to drop stale slugs.
for (const f of readdirSync(RECIPES_DIR)) {
  if (f.endsWith('.html')) unlinkSync(join(RECIPES_DIR, f));
}
for (const r of recipes) {
  writeFileSync(join(RECIPES_DIR, `${r.slug}.html`), renderRecipe(r));
}

// 2. Sitemap. Static entries first, then one per recipe.
const today = new Date().toISOString().slice(0, 10);
const staticUrls = [
  { loc: 'https://lakesalt.us/', changefreq: 'weekly', priority: '1.0' },
  { loc: 'https://lakesalt.us/rentals.html', changefreq: 'weekly', priority: '0.9' },
  { loc: 'https://lakesalt.us/sales.html', changefreq: 'weekly', priority: '0.8' },
  { loc: 'https://lakesalt.us/recipes.html', changefreq: 'weekly', priority: '0.8' },
  { loc: 'https://lakesalt.us/llms.txt', changefreq: 'monthly', priority: '0.6' },
  { loc: 'https://lakesalt.us/llms-full.txt', changefreq: 'monthly', priority: '0.6' },
];
const recipeUrls = recipes.map((r) => ({
  loc: `https://lakesalt.us/recipes/${r.slug}`,
  lastmod: r.publishedAt || today,
  changefreq: 'monthly',
  priority: '0.7',
}));

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...staticUrls.map(
    (u) =>
      `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
  ),
  ...recipeUrls.map(
    (u) =>
      `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
  ),
  '</urlset>',
  '',
].join('\n');
writeFileSync(SITEMAP, xml);

// 3. Inject JSON into hub recipes.html between sentinel markers.
let hub = readFileSync(HUB, 'utf8');
const startIdx = hub.indexOf(HUB_START);
const endIdx = hub.indexOf(HUB_END);
if (startIdx === -1 || endIdx === -1) {
  throw new Error(
    `Hub markers not found in recipes.html. Expected ${HUB_START} and ${HUB_END} around the RECIPES assignment.`,
  );
}
const before = hub.slice(0, startIdx + HUB_START.length);
const after = hub.slice(endIdx);
const inject = '\n' + JSON.stringify(recipes, null, 2) + '\n';
hub = before + inject + after;
writeFileSync(HUB, hub);

console.log(
  `✓ Built ${recipes.length} recipe pages, sitemap with ${staticUrls.length + recipeUrls.length} urls, and injected hub data.`,
);
