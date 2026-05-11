// One-time extraction: pulls the RECIPES array out of recipes.html, slugifies,
// adds publishedAt, writes website/data/recipes.json.
// Run once: node website/scripts/extract-recipes.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBSITE = join(__dirname, '..');
const HTML = join(WEBSITE, 'recipes.html');
const OUT = join(WEBSITE, 'data', 'recipes.json');

const html = readFileSync(HTML, 'utf8');
const startMarker = 'const RECIPES = [';
const startIdx = html.indexOf(startMarker);
if (startIdx === -1) throw new Error('RECIPES array not found');
const after = html.slice(startIdx + startMarker.length);
const endIdx = after.indexOf('\n];');
if (endIdx === -1) throw new Error('end of RECIPES not found');
const body = after.slice(0, endIdx);

const arrSrc = '[' + body + ']';
const recipes = new Function('return ' + arrSrc)();

const slugify = (s) =>
  s.toLowerCase()
    .replace(/[''']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const today = new Date().toISOString().slice(0, 10);
const existingByName = new Map();
if (existsSync(OUT)) {
  for (const r of JSON.parse(readFileSync(OUT, 'utf8'))) existingByName.set(r.name, r);
}

const slugSeen = new Set();
const enriched = recipes.map((r) => {
  let slug = slugify(r.name);
  let n = 2;
  while (slugSeen.has(slug)) slug = `${slugify(r.name)}-${n++}`;
  slugSeen.add(slug);
  const prior = existingByName.get(r.name);
  return {
    slug,
    cat: r.cat,
    catLabel: r.catLabel,
    name: r.name,
    tagline: r.tagline,
    desc: r.desc,
    ingredients: r.ingredients,
    steps: r.steps,
    difficulty: r.difficulty,
    serves: r.serves,
    time: r.time,
    note: r.note || '',
    publishedAt: prior?.publishedAt || today,
    image: prior?.image || '/images/og-default.jpg',
  };
});

writeFileSync(OUT, JSON.stringify(enriched, null, 2) + '\n');
console.log(`Wrote ${enriched.length} recipes to ${OUT}`);
