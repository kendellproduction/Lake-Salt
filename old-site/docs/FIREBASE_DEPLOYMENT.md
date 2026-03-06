# 🚀 Firebase Deployment Guide for Lake Salt Bartending

## ✅ Pre-Deployment Checklist Complete

All items have been configured and are ready for deployment:

- ✅ Reviews API updated to use static `/reviews.json` file
- ✅ DailyRecipe component removed (not needed)
- ✅ EmailJS credentials configured in `.env.local`
- ✅ SEO metadata updated with correct domain (www.lakesalt.us)
- ✅ OpenGraph image created (`og-image.jpg`)
- ✅ Firebase configuration files created
- ✅ ESLint issues resolved
- ✅ Security vulnerability fixed (js-yaml)
- ✅ Production build tested successfully

---

## 🔥 Firebase Deployment Steps

### Step 1: Install Firebase CLI (if not already installed)

```bash
npm install -g firebase-tools
```

### Step 2: Login to Firebase

```bash
firebase login
```

This will open your browser to authenticate with your Google account.

### Step 3: Verify Firebase Project

Your project is already configured to use the Firebase project ID: **`lake-salt`**

You can verify this by checking the `.firebaserc` file:

```json
{
  "projects": {
    "default": "lake-salt"
  }
}
```

### Step 4: Build the Production Version

```bash
cd "/Users/kendellandrews/New Lake Salt/lake-salt-bartending"
npm run build
```

This creates an optimized production build in the `dist/` folder.

### Step 5: Deploy to Firebase Hosting

```bash
firebase deploy --only hosting
```

Or use the convenient npm script:

```bash
npm run deploy
```

This will:
1. Build the production version
2. Upload to Firebase Hosting
3. Provide you with deployment URLs

### Step 6: Connect Your Custom Domain

After deployment, connect your domain `www.lakesalt.us`:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: **lake-salt**
3. Go to **Hosting** → **Add custom domain**
4. Enter: `www.lakesalt.us`
5. Follow the DNS configuration instructions
6. Add the provided DNS records to your domain registrar:
   - **A record** pointing to Firebase IPs
   - **TXT record** for domain verification

**DNS Records (typical setup):**
```
Type: A
Name: www
Value: [Firebase will provide IPs]

Type: TXT
Name: www
Value: [Firebase verification code]
```

7. Wait for DNS propagation (can take up to 24 hours, usually much faster)
8. Firebase will automatically provision SSL certificate

---

## 📊 What Gets Deployed

Your `dist/` folder contains:

- **index.html** (5.25 KB) - Main HTML with SEO metadata
- **assets/index-*.css** (65.35 KB) - Compiled Tailwind CSS
- **assets/index-*.js** (470.67 KB) - React app bundle
- **og-image.jpg** - Social sharing image
- **hero-background.jpeg** - Hero section background
- **reviews.json** - Static reviews data
- **photos/** - All gallery images
- **vite.svg** - Vite logo

---

## 🔍 Post-Deployment Verification

After deployment, test these items:

### 1. Basic Functionality
- [ ] Visit `https://www.lakesalt.us`
- [ ] All sections load correctly
- [ ] Navigation links work
- [ ] Mobile responsive on phone
- [ ] Images load properly

### 2. Contact Form
- [ ] Fill out contact form
- [ ] Submit and verify email arrives at `contact@lakesalt.us`
- [ ] Check EmailJS dashboard for successful send

### 3. Reviews Section
- [ ] Reviews carousel displays all 16 reviews
- [ ] Reviews load from `/reviews.json`
- [ ] No console errors

### 4. SEO & Social Sharing
- [ ] Share on Facebook - verify OG image appears
- [ ] Share on Twitter - verify card displays correctly
- [ ] Google "site:www.lakesalt.us" to verify indexing
- [ ] Check [Google Rich Results Test](https://search.google.com/test/rich-results)

### 5. Performance
- [ ] Run [PageSpeed Insights](https://pagespeed.web.dev/)
- [ ] Target: 90+ score on all metrics
- [ ] Check mobile performance

---

## 🔐 Environment Variables

Your `.env.local` file contains:

```
VITE_EMAILJS_PUBLIC_KEY=S5_thaUg6waOnC7bZ
VITE_EMAILJS_SERVICE_ID=[your service id]
VITE_EMAILJS_TEMPLATE_ID=[your template id]
```

**Important:** These are embedded in the client-side JavaScript bundle during build. They are visible to users but that's expected for EmailJS public keys.

---

## 🎯 Firebase Hosting Features Configured

### Cache Control Headers
- **Images** (jpg, png, svg, etc.): 1 year cache
- **JS/CSS**: 1 year cache (with content hashing for updates)

### SPA Routing
All routes redirect to `/index.html` for client-side routing.

### Automatic HTTPS
Firebase automatically provisions and renews SSL certificates.

---

## 📝 Updating Your Site

To deploy updates:

1. Make changes to your code
2. Test locally: `npm start`
3. Build: `npm run build`
4. Deploy: `firebase deploy --only hosting`

Or use the shortcut:

```bash
npm run deploy
```

---

## 🚨 Troubleshooting

### Contact Form Not Sending
- Verify EmailJS credentials in `.env.local`
- Check browser console for errors
- Verify template exists in EmailJS dashboard

### Reviews Not Loading
- Check browser console for 404 errors
- Verify `reviews.json` exists in `dist/` folder after build
- Test: `curl https://www.lakesalt.us/reviews.json`

### Domain Not Working
- Wait for DNS propagation (up to 24 hours)
- Verify DNS records at your registrar
- Check Firebase Hosting dashboard for domain status

### Images Not Loading
- Verify images exist in `public/` folder before build
- Check browser console for 404 errors
- Ensure image paths start with `/` (e.g., `/photos/IMG_1234.jpeg`)

---

## 📈 Analytics & Monitoring

### Firebase Hosting Analytics
View in Firebase Console:
- Page views
- Bandwidth usage
- Geographic distribution
- Performance metrics

### Google Analytics (Optional)
To add Google Analytics:

1. Get your GA4 Measurement ID
2. Add to `index.html` in `<head>`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

---

## 🎉 You're Ready to Launch!

Your site is fully configured and ready for production. Simply run:

```bash
firebase deploy --only hosting
```

Or:

```bash
npm run deploy
```

Then configure your custom domain in the Firebase Console.

**Good luck with your launch! 🍸**

---

## 📞 Support Resources

- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
- [Custom Domain Setup](https://firebase.google.com/docs/hosting/custom-domain)
- [EmailJS Documentation](https://www.emailjs.com/docs/)
- Lake Salt Contact: contact@lakesalt.us

