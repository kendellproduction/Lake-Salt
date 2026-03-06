# Lake Salt LLC — Website

## Files

| File | Description |
|------|-------------|
| `index.html` | Main website — the full redesign (hero, services, pricing, reviews, contact) |
| `recipes.html` | SEO content page — 30+ recipes, Recipe of the Day, tips & tricks |
| `images/` | Drop your real photos here (JPG/PNG). See notes below. |
| `lake-salt-daily-recipe.task.md` | Blueprint for the daily recipe automation (for use with Cowork scheduling) |

## Opening the Site

Just double-click `index.html` to open it in your browser. No server needed — it's all self-contained.

## Adding Your Real Photos

The site currently uses Unsplash placeholder photos. To swap in your own:
1. Drop your photo into the `images/` folder
2. Open `index.html` and search for the Unsplash URL you want to replace
3. Replace the URL with `images/your-photo-filename.jpg`

Key photo spots to replace:
- **Wedding hero** — search for `photo-1511795409834`
- **Corporate hero** — search for `photo-1527529482837`
- **Gallery/other sections** — search for `unsplash.com/photo-` to find all placeholders

## Google Reviews Setup

To show your real Google reviews, open `index.html` and find these two lines near the top of the `<script>` block:

```js
const GOOGLE_API_KEY  = 'YOUR_API_KEY_HERE';
const GOOGLE_PLACE_ID = 'YOUR_PLACE_ID_HERE';
```

1. Get a free Maps JavaScript API key at: https://console.cloud.google.com
2. Find your Place ID at: https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder
3. Paste both values in and save — reviews will load automatically from Google.

## Going Live

When you're ready to publish, this whole folder can be uploaded to any static web host:
- **Firebase Hosting** (free, fast, custom domain)
- **Netlify** (free tier, drag-and-drop deploy)
- **Squarespace/Wix** → Note: these work differently; Firebase or Netlify are easier for custom HTML
