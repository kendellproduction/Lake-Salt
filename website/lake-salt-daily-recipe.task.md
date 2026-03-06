# Scheduled Task: lake-salt-daily-recipe
**Cron:** `0 7 * * *` (runs daily at 7:00 AM, local time)

---

## Prompt (for autonomous runs)

Add one new cocktail or mocktail recipe to the Lake Salt bartending website's recipe page.

### Objective
Append exactly ONE new recipe object to the RECIPES JavaScript array in the recipes file. The new recipe must be unique — do not duplicate any recipe name already in the file.

### File to Edit
`/recipes.html` in the Lake Salt website folder (wherever the project lives on disk)

### Steps
1. Read the file and locate the `const RECIPES = [` array near the top of the `<script>` block.
2. Scan all existing recipe `name` fields to build a list of names already used.
3. Generate ONE new recipe object following the exact format below. Choose a category that keeps the overall balance (wedding, corporate, mocktail, batch, or signature).
4. Insert the new recipe object just BEFORE the closing `];` of the RECIPES array (add a trailing comma after the previous last entry if needed).
5. Save the file.

### Recipe Object Format
```js
{
  cat: 'wedding',           // one of: wedding | corporate | mocktail | batch | signature
  catLabel: 'Wedding Cocktail',
  name: 'The Example',
  tagline: 'A short enticing one-liner',
  desc: 'Two to three sentences describing the drink and occasion it suits.',
  ingredients: [
    '2 oz spirit',
    '1 oz modifier',
    '¾ oz fresh citrus juice',
    'Garnish: description'
  ],
  steps: [
    'Combine ingredients in a shaker with ice.',
    'Shake vigorously for 15 seconds.',
    'Double-strain into a chilled coupe.',
    'Garnish and serve immediately.'
  ],
  difficulty: 'Easy',       // Easy | Medium | Advanced
  serves: '1',              // or e.g. '40' for batch recipes
  time: '5 min',
  note: 'Optional pro tip or make-ahead note.'
}
```

### Business Context
- Business: Lake Salt LLC — premium mobile bartending service based in Salt Lake City / Utah
- Serves weddings, corporate events, private parties in Utah (SLC, Park City, Provo, Ogden)
- Brand voice: elevated, warm, Utah-inspired. References to local landmarks, seasons, and landscapes are welcome.
- Batch recipes should specify a yield (e.g., serves 40) and scale ingredients accordingly.

### SEO Notes
- Use evocative, Utah/event-inspired names (think: local landmarks, seasons, wedding moments)
- Make the `tagline` punchy and searchable
- `desc` should naturally include phrases like "wedding cocktail", "corporate bar", "mocktail" etc.

### Success Criteria
- Exactly one new recipe added to the array
- No duplicate recipe names
- Valid JavaScript syntax (no trailing comma errors, all strings properly quoted)
- File saved successfully
