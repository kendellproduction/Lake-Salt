# Scheduled Task: lake-salt-recipes-publish
**Cron:** `0 7 * * 1,3,5` (Mon / Wed / Fri at 7:00 AM, local Mountain time)

---

## Prompt (for autonomous runs)

Publish **three** new cocktail or mocktail recipes to the Lake Salt website. Each recipe becomes its own SEO-optimized detail page at `/recipes/{slug}`.

### Objective
Append **exactly 3 new recipe objects** to `website/data/recipes.json`, then run the build script so the per-recipe HTML pages and sitemap regenerate.

### Files

- **Source of truth:** `website/data/recipes.json` (the only data file — never edit `recipes.html` directly anymore)
- **Build script:** `website/scripts/build-recipes.mjs` (regenerates `/recipes/*.html` + `sitemap.xml` and re-injects data into the hub)

### Steps

1. Read `website/data/recipes.json` and collect all existing `name` and `slug` values into sets.
2. Generate **3 new recipe objects** using the schema below. Vary categories across the batch (one wedding, one mocktail or batch, one signature/corporate is a good mix). No duplicate names or slugs vs. existing entries.
3. For each new recipe, set:
   - `slug`: lowercase, hyphenated, alphanumeric only (e.g. `"smoked-old-fashioned"`). Must not collide with existing slugs.
   - `publishedAt`: today's date as `"YYYY-MM-DD"`.
   - `image`: `"/images/og-default.jpg"` (placeholder — Kendell swaps real photos in later).
4. Append the 3 new objects to the array in `recipes.json`. Save valid JSON.
5. Run: `node website/scripts/build-recipes.mjs` from the project root. It should print `✓ Built N recipe pages...` where N = (previous count + 3).
6. Sanity-check: confirm three new files exist under `website/recipes/` matching the new slugs, and `website/sitemap.xml` lists them.

### Recipe Object Schema (JSON)

```json
{
  "slug": "example-cocktail",
  "cat": "wedding",
  "catLabel": "Wedding Cocktail",
  "name": "The Example",
  "tagline": "A short, enticing one-liner",
  "desc": "Two to three sentences describing the drink and the occasion it suits. Naturally include phrases like \"wedding cocktail\", \"mocktail\", or \"corporate bar\" where they fit.",
  "ingredients": [
    "2 oz spirit",
    "1 oz modifier",
    "¾ oz fresh citrus juice",
    "Garnish: description"
  ],
  "steps": [
    "Combine ingredients in a shaker with ice.",
    "Shake vigorously for 15 seconds.",
    "Double-strain into a chilled coupe.",
    "Garnish and serve immediately."
  ],
  "difficulty": "Easy",
  "serves": "1",
  "time": "5 min",
  "note": "Optional pro tip or make-ahead note.",
  "publishedAt": "2026-05-10",
  "image": "/images/og-default.jpg"
}
```

`cat` must be one of: `wedding | corporate | mocktail | batch | signature`.
`difficulty` must be one of: `Easy | Medium | Advanced`.
`serves` is a string (use `"40"` for batch recipes that yield 40 drinks).

### Business Context
- Lake Salt LLC — premium mobile bartending service in Salt Lake City / Utah
- Serves weddings, corporate events, and private parties in SLC, Park City, Provo, Ogden
- Brand voice: elevated, warm, Utah-inspired. Local landmarks and seasons welcome.

### SEO Notes
- Use evocative names that double as searchable phrases ("Smoked Old Fashioned", not "Drink #47")
- Make `tagline` punchy and keyword-rich
- `desc` should read naturally but include phrases like "wedding cocktail", "corporate bar", "mocktail" where they fit
- Each recipe automatically gets `Recipe` JSON-LD structured data via the build script — this is what unlocks Google's recipe rich results

### Success Criteria
- Exactly 3 new recipe objects added to `recipes.json`
- All slugs unique vs. existing entries
- Build script runs cleanly with no errors
- 3 new HTML files exist in `website/recipes/`
- `sitemap.xml` includes the 3 new URLs with today's `<lastmod>`
