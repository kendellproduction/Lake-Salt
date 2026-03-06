# Lake Salt Bartending — Website

## Folder structure

```
Lake-Salt/
├── website/          ← ACTIVE SITE (edit files here)
│   ├── index.html    ← main page
│   ├── recipes.html  ← cocktail recipes page
│   └── images/       ← all photos
│
├── old-site/         ← old React app (archived, do not edit)
│
├── firebase.json     ← Firebase Hosting config (serves website/)
└── .firebaserc       ← Firebase project: lake-salt
```

## Deploy to production

```bash
firebase deploy --only hosting
```

Live URL: https://lake-salt.web.app

## Edit & preview locally

Open `website/index.html` in any browser — no build step needed.
To edit, open the `Lake-Salt` folder in Cursor and work in `website/index.html`.

## Push changes to GitHub

```bash
git add .
git commit -m "describe your changes"
git push origin main
firebase deploy --only hosting
```
