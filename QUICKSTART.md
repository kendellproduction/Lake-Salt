# 🍸 Lake Salt Bartending - Quick Start Guide

## ⚡ Start in 2 Minutes

```bash
cd "/Users/kendellandrews/New Lake Salt/lake-salt-bartending"
npm start
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

✅ **Done!** The website is running with a fallback recipe.

---

## 🔧 Optional: Add Python Recipe Server

Want the daily recipe to update automatically? Start a second terminal:

**Terminal 1 - Frontend (already running)**
```bash
npm start
```

**Terminal 2 - Recipe Server**
```bash
pip install -r requirements.txt
python recipe_server.py
```

Now daily recipes update automatically!

---

## 📝 Configure Email (For Contact Form)

1. Go to [https://dashboard.emailjs.com](https://dashboard.emailjs.com)
2. Create account (free tier works!)
3. Add email service (Gmail recommended)
4. Create email template with these fields:
   - `{{from_name}}`
   - `{{from_email}}`
   - `{{event_date}}`
   - `{{event_type}}`
   - `{{guest_count}}`
   - `{{message}}`

5. Create `.env.local` in project root:
   ```
   VITE_EMAILJS_PUBLIC_KEY=your_key_here
   VITE_EMAILJS_SERVICE_ID=your_service_id_here
   VITE_EMAILJS_TEMPLATE_ID=your_template_id_here
   ```

6. Test the contact form - you should get an email!

---

## 🚀 Deploy to Internet

### Fastest Way: Vercel (2 minutes)

1. Push to GitHub
2. Go to [https://vercel.com](https://vercel.com)
3. Click "Import Project"
4. Select your GitHub repo
5. Add environment variables (EmailJS keys)
6. Click "Deploy"

✅ Your site is now live at `your-project.vercel.app`!

See `DEPLOYMENT_GUIDE.md` for more options.

---

## 📂 Key Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | Main component |
| `src/components/` | All page sections |
| `recipes.json` | Cocktail recipes database |
| `recipe_server.py` | Daily recipe API |
| `.env.example` | Environment variables template |
| `BUILD_NOTES.md` | Detailed technical docs |
| `README.md` | Full documentation |
| `DEPLOYMENT_GUIDE.md` | Deploy to production |

---

## 🎨 Customize Content

### Update Team Info
Edit `src/components/About.jsx` - change Ken & Maddie profiles

### Add/Edit Cocktails
Edit `recipes.json` - add new drinks to database

### Update Services
Edit `src/components/Services.jsx` - change packages & pricing

### Update Reviews
Edit `src/components/Reviews.jsx` - add client testimonials

### Change Colors
Edit `tailwind.config.js` - update navy, cream, gold hex codes

---

## ✅ Testing Checklist

- [ ] Run `npm start` - works?
- [ ] All pages load - yes?
- [ ] Mobile responsive - test on phone
- [ ] FAQ accordion expands - working?
- [ ] Contact form validates - yes?
- [ ] (Optional) Recipe server running - yes?

---

## 🆘 Common Issues

**"npm start" command not found**
```bash
cd "/Users/kendellandrews/New Lake Salt/lake-salt-bartending"
npm install
npm start
```

**Port 5173 already in use**
```bash
npm start -- --port 5174
```

**EmailJS not sending emails**
1. Check `.env.local` has correct keys
2. Verify email template exists in EmailJS
3. Check browser console (F12) for errors

**Python server not working**
1. Install requirements: `pip install -r requirements.txt`
2. Run: `python recipe_server.py`
3. Test: `curl http://localhost:5000/health`

---

## 📚 Documentation

- **For Developers:** See `BUILD_NOTES.md`
- **For Deployment:** See `DEPLOYMENT_GUIDE.md`
- **For Details:** See `README.md`

---

## 🎯 Next Steps

1. ✅ **Get it running** - `npm start`
2. ✅ **Add EmailJS** - Set up contact form
3. ✅ **Deploy** - Get on internet (Vercel recommended)
4. ✅ **Share** - Send link to clients!

---

**Questions?** Check the full documentation files.  
**Ready to deploy?** See `DEPLOYMENT_GUIDE.md`

🚀 You've got this!

