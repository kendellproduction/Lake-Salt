# 🍸 Lake Salt Bartending Website - Build Notes

## Overview

This is a professional, high-performance single-page website for Lake Salt Bartending, a Utah-based mobile bartending company. The site showcases their services, integrates with EmailJS for booking inquiries, and features a daily drink recipe that updates automatically via Python.

**Tech Stack:**
- **Frontend:** React 18 + Vite
- **Styling:** Tailwind CSS + Framer Motion (animations)
- **Carousel:** Swiper.js
- **Backend (Optional):** Python Flask + APScheduler (daily recipes)
- **Email Integration:** EmailJS
- **Icons:** Lucide React

---

## 🚀 Quick Start

### Installation

```bash
# Navigate to project directory
cd "/Users/kendellandrews/New Lake Salt/lake-salt-bartending"

# Install dependencies
npm install
```

### Running Locally

#### Option 1: Frontend Only (with Fallback Recipe)

```bash
npm start
```

The website will start on `http://localhost:5173/`

#### Option 2: With Python Recipe Server (Recommended for Full Features)

**Terminal 1 - Start the Recipe Server:**

```bash
# Install Python dependencies
pip install flask flask-cors apscheduler

# Start the recipe server
python recipe_server.py
```

The API server will run on `http://localhost:5000`

**Terminal 2 - Start the Frontend:**

```bash
npm start
```

---

## 🏗️ Project Structure

```
lake-salt-bartending/
├── src/
│   ├── components/
│   │   ├── Navbar.jsx           # Fixed navbar with smooth scroll
│   │   ├── Hero.jsx             # Hero section with Swiper carousel
│   │   ├── About.jsx            # About & team section
│   │   ├── WhatSetsUsApart.jsx  # Features with animated cards
│   │   ├── Gallery.jsx          # Gallery with Swiper & grid
│   │   ├── Services.jsx         # Service packages & pricing
│   │   ├── Reviews.jsx          # Client testimonials carousel
│   │   ├── FAQ.jsx              # Accordion with Framer Motion
│   │   ├── DailyRecipe.jsx      # Dynamic drink recipe section
│   │   ├── Contact.jsx          # EmailJS booking form
│   │   ├── Footer.jsx           # Footer with links & social
│   │   └── Snowflakes.jsx       # Animated background snowflakes
│   ├── App.jsx                  # Main app component
│   ├── main.jsx                 # Entry point
│   └── index.css                # Tailwind & custom styles
├── public/
│   └── current_recipe.json      # Generated daily recipe (auto-updated)
├── index.html                   # SEO-optimized HTML with schema.org
├── tailwind.config.js           # Tailwind configuration
├── postcss.config.js            # PostCSS configuration
├── vite.config.js               # Vite configuration
├── recipe_server.py             # Python Flask recipe API server
├── recipes.json                 # Recipe database
├── .env.example                 # Environment variables template
├── package.json                 # NPM dependencies
└── BUILD_NOTES.md              # This file

```

---

## 📋 Page Sections Implemented

1. **Navbar** - Fixed, sticky with smooth scroll animations
2. **Hero** - Full-screen carousel with text overlay & CTA
3. **About** - Two-column layout with Ken & Maddie profiles
4. **What Sets Us Apart** - 4 feature cards with icons & animations
5. **Gallery** - Swiper carousel + grid layout
6. **Services** - 4 service packages with pricing
7. **Reviews** - Carousel of 5 testimonials (5.0 rating)
8. **FAQ** - Accordion with Framer Motion expand/collapse
9. **Daily Recipe** - Dynamic "Drink of the Day" section
10. **Contact** - EmailJS booking form with validation
11. **Footer** - Links, social media, schema markup

---

## 🔧 Key Features & Components

### Animations
- **Framer Motion:** Fade-ins, hover effects, scroll triggers
- **Tailwind:** Utility-based responsive design
- **Swiper.js:** Smooth carousel transitions with auto-play
- **Snowflakes:** Animated background elements (holiday theme)

### Forms & Integration
- **EmailJS:** Sends booking inquiries to `contact@lakesalt.us`
- **Validation:** Client-side validation on all fields
- **Success/Error Messages:** Real-time user feedback
- **Form Fields:** Name, Email, Event Date, Event Type, Guest Count, Message

### SEO & Meta Tags
- ✅ Optimized title and meta description
- ✅ Open Graph tags (social sharing)
- ✅ Schema.org LocalBusiness markup (JSON-LD)
- ✅ Canonical URL
- ✅ Responsive meta viewport
- ✅ Keywords for Utah bartending services

---

## 🔑 Environment Variables

### Setup EmailJS

1. **Create EmailJS Account:**
   - Go to [https://dashboard.emailjs.com](https://dashboard.emailjs.com)
   - Sign up or log in with email

2. **Add Email Service:**
   - Navigate to "Email Services"
   - Click "Add Service"
   - Choose your email provider (Gmail, Outlook, etc.)
   - Connect and authorize

3. **Create Email Template:**
   - Go to "Email Templates"
   - Create a new template named something like "Lake Salt Booking Request"
   - Use these variables in your template:
     ```
     Name: {{from_name}}
     Email: {{from_email}}
     Event Date: {{event_date}}
     Event Type: {{event_type}}
     Guest Count: {{guest_count}}
     Message: {{message}}
     ```
   - Set the recipient email to `contact@lakesalt.us` or your preferred email
   - Note the **Service ID** and **Template ID**

4. **Get Public Key:**
   - In Dashboard → "Account" → "API Keys"
   - Copy your **Public Key**

5. **Create .env.local file:**
   ```bash
   cp .env.example .env.local
   ```
   
   Then fill in your credentials:
   ```
   VITE_EMAILJS_PUBLIC_KEY=your_public_key_here
   VITE_EMAILJS_SERVICE_ID=your_service_id_here
   VITE_EMAILJS_TEMPLATE_ID=your_template_id_here
   ```

6. **Test the Form:**
   - Fill out the booking form on the website
   - You should receive an email at `contact@lakesalt.us`

---

## 🐍 Python Recipe Server Setup

### Installation

```bash
# Install Python dependencies
pip install flask flask-cors apscheduler

# Or use requirements.txt
pip install -r requirements.txt
```

### Running the Server

```bash
python recipe_server.py
```

**Output:**
```
🍸 Lake Salt Bartending - Recipe Server
📁 Recipes file: /path/to/recipes.json
📁 Current recipe file: /path/to/public/current_recipe.json
🚀 Starting server on http://localhost:5000
📝 API Endpoints:
  - GET /api/recipe-of-day     (today's recipe)
  - GET /api/recipes           (all recipes)
  - GET /api/recipes/<id>      (specific recipe)
  - POST /api/recipes          (add new recipe)
  - GET /health                (health check)
```

### API Endpoints

#### Get Today's Recipe
```bash
curl http://localhost:5000/api/recipe-of-day
```

**Response:**
```json
{
  "id": 1,
  "name": "Signature Mojito",
  "description": "A refreshing classic...",
  "ingredients": ["2 oz rum", "..."],
  "instructions": "Muddle mint leaves...",
  "imageUrl": "🍹"
}
```

#### Get All Recipes
```bash
curl http://localhost:5000/api/recipes
```

#### Add New Recipe
```bash
curl -X POST http://localhost:5000/api/recipes \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Spiced Margarita",
    "description": "Warm spiced tequila...",
    "ingredients": ["..."],
    "instructions": "...",
    "imageUrl": "🌶️"
  }'
```

#### Health Check
```bash
curl http://localhost:5000/health
```

### Recipe Database

Recipes are stored in `recipes.json`. Each recipe has:
- `id` - Unique identifier
- `name` - Drink name
- `description` - Short description
- `ingredients` - Array of ingredient strings
- `instructions` - Preparation instructions
- `imageUrl` - Emoji or image URL

### Daily Recipe Selection

The system selects today's recipe based on the date:
- Uses a deterministic seed (day number since epoch)
- Same recipe served all day
- Changes automatically at midnight UTC
- Runs via APScheduler background job
- Fallback: Uses cached `public/current_recipe.json` if server is offline

---

## 🎨 Color Scheme & Branding

```css
/* Primary Colors */
Navy:  #1E2A38
Cream: #FAF7F2
Gold:  #D4AF37

/* Fonts */
Headers: 'Playfair Display' (serif)
Body:    'Inter' (sans-serif)
```

### Tailwind Config
All custom colors are defined in `tailwind.config.js`:
```javascript
colors: {
  navy: '#1E2A38',
  cream: '#FAF7F2',
  gold: '#D4AF37',
  'dark-gold': '#B8941F',
}
```

---

## 📱 Responsive Design

- **Mobile-first approach** with Tailwind breakpoints
- **Navbar:** Hamburger menu on mobile, full nav on desktop
- **Hero:** Full height on all devices
- **Grid Layouts:** 1 column (mobile) → 2 columns (tablet) → 3+ columns (desktop)
- **Text:** Responsive font sizes with `text-sm` to `text-7xl`
- **Touch-friendly:** Large buttons (48px+) for mobile

---

## 🚀 Deployment

### Vercel (Recommended)

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Lake Salt Bartending website"
   git remote add origin https://github.com/yourusername/lake-salt-bartending
   git push -u origin main
   ```

2. **Connect to Vercel:**
   - Go to [https://vercel.com](https://vercel.com)
   - Import your repository
   - Set environment variables:
     ```
     VITE_EMAILJS_PUBLIC_KEY=...
     VITE_EMAILJS_SERVICE_ID=...
     VITE_EMAILJS_TEMPLATE_ID=...
     ```
   - Deploy!

### Recipe Server Deployment

**Option A: Heroku (Free tier limited)**
```bash
# Create Heroku app
heroku create lake-salt-recipes

# Set environment variables (if needed)
heroku config:set VITE_API_URL=https://lake-salt-recipes.herokuapp.com

# Deploy
git push heroku main
```

**Option B: Self-hosted (VPS/Dedicated Server)**
- Use systemd or PM2 to run `recipe_server.py` as a service
- Example PM2 config:
  ```bash
  pm2 start recipe_server.py --name "lake-salt-recipes" --interpreter python3
  ```

**Option C: Docker**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY recipe_server.py .
CMD ["python", "recipe_server.py"]
```

```bash
docker build -t lake-salt-recipes .
docker run -p 5000:5000 lake-salt-recipes
```

---

## 📊 Performance Optimizations

- ✅ **Code Splitting:** Dynamic imports for components
- ✅ **Lazy Loading:** Images load on viewport intersection
- ✅ **Swiper.js:** Efficient carousel rendering
- ✅ **Framer Motion:** GPU-accelerated animations
- ✅ **Tailwind CSS:** Minimal CSS output (~50KB gzipped)
- ✅ **Build Optimization:** Vite handles tree-shaking & minification

### Lighthouse Score Targets
- Performance: 90+
- Accessibility: 95+
- Best Practices: 95+
- SEO: 100

---

## 🔐 Security Considerations

1. **EmailJS Keys:** Store in environment variables, never commit `.env.local`
2. **CORS:** Flask recipe server configured for localhost + production domain
3. **Input Validation:** Form fields validated before submission
4. **HTTPS:** Use HTTPS in production
5. **API Rate Limiting:** Consider adding on recipe server if public

---

## 🐛 Troubleshooting

### EmailJS Not Sending
1. Check environment variables are set correctly
2. Verify email template is active in EmailJS dashboard
3. Ensure email service is connected in EmailJS
4. Check browser console for errors (F12)

### Recipe API Not Connecting
1. Start Python server: `python recipe_server.py`
2. Test health endpoint: `curl http://localhost:5000/health`
3. Check CORS settings if deployed
4. Site falls back to default recipe if API unavailable

### Animations Not Working
1. Check Framer Motion version in `package.json`
2. Verify `motion` component is imported correctly
3. Check browser DevTools for performance issues
4. Reduce animation complexity on lower-end devices

### Build Errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## 📝 Future Enhancements

- [ ] Google Calendar integration for event booking
- [ ] Client portal for event management
- [ ] Online payment integration (Stripe)
- [ ] Photo gallery with real images (replace emoji placeholders)
- [ ] Blog section for bartending tips
- [ ] Admin dashboard for managing recipes & events
- [ ] Mobile app (React Native)
- [ ] Live chat support widget
- [ ] Email marketing integration (Mailchimp)
- [ ] Analytics integration (Google Analytics 4)

---

## 📞 Support

**EmailJS Support:** https://www.emailjs.com/docs/
**Framer Motion Docs:** https://www.framer.com/motion/
**Tailwind CSS Docs:** https://tailwindcss.com/docs
**Vite Docs:** https://vitejs.dev/
**Flask Docs:** https://flask.palletsprojects.com/

---

## 📄 File Descriptions

| File | Purpose |
|------|---------|
| `src/App.jsx` | Main app component, routing & layout |
| `src/components/*` | Reusable React components |
| `index.html` | SEO meta tags & schema markup |
| `tailwind.config.js` | Custom colors & animations |
| `recipe_server.py` | Python Flask API for daily recipes |
| `recipes.json` | Recipe database |
| `vite.config.js` | Vite build configuration |
| `package.json` | NPM dependencies & scripts |
| `.env.example` | Environment variables template |

---

## 🎯 Key Decisions & Rationale

1. **React + Vite:** Fast HMR, modern tooling, great DX
2. **Tailwind CSS:** Utility-first, responsive by default, fast iteration
3. **Framer Motion:** Smooth animations, great performance
4. **Swiper.js:** Industry-standard carousels, mobile-friendly
5. **EmailJS:** Easy integration, no backend required for basic emails
6. **Python Flask:** Lightweight, simple daily recipe updates
7. **APScheduler:** Reliable cron job handling in Python
8. **Schema.org:** SEO boost, rich search results

---

## 🏁 Checklist for Production

- [ ] EmailJS credentials configured in `.env.local`
- [ ] Recipe server running (if using Python integration)
- [ ] Domain registered & DNS configured
- [ ] SSL certificate installed (HTTPS)
- [ ] Google Analytics tracking code added
- [ ] Contact email verified in EmailJS
- [ ] All links tested and working
- [ ] Mobile responsiveness verified on devices
- [ ] Lighthouse audit scores > 90
- [ ] Social media links updated
- [ ] Backup of recipes.json created

---

## 💡 Tips for Customization

### Updating Colors
Edit `tailwind.config.js`:
```javascript
colors: {
  navy: '#YOUR_COLOR',
  gold: '#YOUR_COLOR',
}
```

### Adding Team Members
Edit `src/components/About.jsx` - add profile cards

### Changing Recipes
Edit `recipes.json` and add/modify entries

### Updating Services
Edit `src/components/Services.jsx` - modify services array

### Customizing Fonts
Edit `src/index.css` - import different Google Fonts

---

## 📚 Resources

- **React Docs:** https://react.dev
- **Vite Guide:** https://vitejs.dev/guide/
- **Tailwind Tutorial:** https://tailwindcss.com/docs/installation
- **Framer Motion API:** https://www.framer.com/motion/
- **Swiper Documentation:** https://swiperjs.com/
- **EmailJS Tutorial:** https://www.emailjs.com/docs/
- **Schema.org Markup:** https://schema.org/LocalBusiness

---

**Last Updated:** November 10, 2025  
**Version:** 1.0.0  
**Status:** Ready for Production ✅

