# 🚀 Lake Salt Bartending - Deployment & Launch Guide

**Project Status:** ✅ **COMPLETE & READY FOR PRODUCTION**

This guide walks you through deploying your Lake Salt Bartending website to the internet.

---

## 📋 Pre-Deployment Checklist

- [ ] Update `contact@lakesalt.us` in all places (Contact form, Footer, etc.)
- [ ] Update Instagram handle if needed (`@LakesaltBartending`)
- [ ] Set up EmailJS account and configure email template
- [ ] Review all content (team bios, services, FAQs, reviews)
- [ ] Test contact form locally with EmailJS credentials
- [ ] Replace emoji placeholders with real images (optional)
- [ ] Update Google Analytics tracking ID (if using)
- [ ] Review SEO meta tags in `index.html`

---

## 🌐 Frontend Deployment

### Option 1: Vercel (Recommended - Easiest)

**Why Vercel?** Free tier, automatic CI/CD, fast, integrates with GitHub

1. **Create GitHub Repository**
   ```bash
   cd "/Users/kendellandrews/New Lake Salt/lake-salt-bartending"
   git init
   git add .
   git commit -m "Initial commit: Lake Salt Bartending website"
   git remote add origin https://github.com/yourusername/lake-salt-bartending
   git push -u origin main
   ```

2. **Connect to Vercel**
   - Go to [https://vercel.com](https://vercel.com)
   - Sign up or log in
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will auto-detect React + Vite

3. **Set Environment Variables**
   - In Vercel dashboard, go to Settings → Environment Variables
   - Add your EmailJS credentials:
     ```
     VITE_EMAILJS_PUBLIC_KEY=your_key_here
     VITE_EMAILJS_SERVICE_ID=your_service_id_here
     VITE_EMAILJS_TEMPLATE_ID=your_template_id_here
     VITE_API_URL=https://your-recipe-server.herokuapp.com
     ```

4. **Deploy**
   - Click "Deploy"
   - Site will be live at `your-project.vercel.app`

5. **Set Custom Domain** (Optional)
   - In Vercel Settings → Domains
   - Add your custom domain (e.g., `lakesalt.us`)
   - Follow DNS configuration instructions

### Option 2: Netlify

1. **Build Locally**
   ```bash
   npm run build
   ```

2. **Deploy to Netlify**
   ```bash
   npm install -g netlify-cli
   netlify deploy --prod --dir=dist
   ```

3. **Set Environment Variables in Netlify UI**
   - Site settings → Build & deploy → Environment
   - Add your EmailJS credentials

### Option 3: Traditional Web Host (GoDaddy, Bluehost, etc.)

1. **Build Locally**
   ```bash
   npm run build
   ```

2. **Upload `dist/` folder** via FTP/SFTP to your host's public directory

3. **Configure `.env` on server** if needed for EmailJS

---

## 🐍 Python Recipe Server Deployment

### Option 1: Heroku (Easy, Free Tier Limited)

1. **Create Heroku Account**
   - Go to [https://www.heroku.com](https://www.heroku.com)
   - Sign up

2. **Install Heroku CLI**
   ```bash
   brew tap heroku/brew && brew install heroku
   ```

3. **Create Procfile**
   ```bash
   echo "web: python recipe_server.py" > Procfile
   ```

4. **Deploy**
   ```bash
   heroku login
   heroku create lake-salt-recipes
   git push heroku main
   ```

5. **Update Frontend**
   - Set `VITE_API_URL=https://lake-salt-recipes.herokuapp.com` in Vercel

### Option 2: DigitalOcean Droplet ($6-12/month)

1. **Create Ubuntu Droplet**
   - Choose Ubuntu 22.04 LTS
   - 2GB RAM, 1 vCPU is enough
   - Note your IP address

2. **SSH into Droplet**
   ```bash
   ssh root@your_ip_address
   ```

3. **Install Python & Dependencies**
   ```bash
   apt update && apt upgrade -y
   apt install python3 python3-pip git -y
   pip install flask flask-cors apscheduler
   ```

4. **Clone Repository**
   ```bash
   git clone https://github.com/yourusername/lake-salt-bartending.git
   cd lake-salt-bartending
   ```

5. **Install PM2** (Process Manager)
   ```bash
   npm install -g pm2
   pm2 start recipe_server.py --name "lake-salt-recipes" --interpreter python3
   pm2 startup
   pm2 save
   ```

6. **Install Nginx** (Reverse Proxy)
   ```bash
   apt install nginx -y
   ```

7. **Configure Nginx**
   ```bash
   sudo tee /etc/nginx/sites-available/default > /dev/null <<EOF
   server {
       listen 80 default_server;
       server_name _;
       
       location / {
           proxy_pass http://127.0.0.1:5000;
           proxy_set_header Host \$host;
           proxy_set_header X-Real-IP \$remote_addr;
       }
   }
   EOF
   
   sudo systemctl restart nginx
   ```

8. **Enable HTTPS with Certbot**
   ```bash
   apt install certbot python3-certbot-nginx -y
   certbot --nginx -d yourdomain.com
   ```

9. **Update Frontend**
   - Set `VITE_API_URL=https://yourdomain.com` in Vercel

### Option 3: AWS Elastic Beanstalk

1. **Install AWS CLI**
   ```bash
   brew install awscli
   ```

2. **Initialize EB**
   ```bash
   eb init -p python-3.11 lake-salt-recipes
   ```

3. **Create Environment**
   ```bash
   eb create lake-salt-recipes-env
   ```

4. **Deploy**
   ```bash
   eb deploy
   ```

---

## 🔐 Setting Up EmailJS

### Step 1: Create Account
- Go to [https://dashboard.emailjs.com](https://dashboard.emailjs.com)
- Click "Create account"
- Verify email

### Step 2: Add Email Service
- Left menu → "Email Services"
- Click "Add Service"
- Choose your provider (Gmail recommended)
  - For Gmail: Enable 2FA, generate [App Password](https://support.google.com/accounts/answer/185833)
  - Or use [Gmail Less Secure Apps](https://support.google.com/accounts/answer/6010255)
- Fill in email & password
- Click "Create Service"
- Note your **Service ID**

### Step 3: Create Email Template
- Left menu → "Email Templates"
- Click "Create New Template"
- Name: `lake_salt_booking_request`
- Copy this template:

```
Subject: New Booking Request from {{from_name}}

Hello Lake Salt Team,

You have a new booking request:

Name: {{from_name}}
Email: {{from_email}}
Event Date: {{event_date}}
Event Type: {{event_type}}
Guest Count: {{guest_count}}

Message:
{{message}}

Please respond to: {{from_email}}

Best regards,
Lake Salt Booking System
```

- Click "Save"
- Note your **Template ID**

### Step 4: Get Your Keys
- Left menu → "Account"
- Copy:
  - **Public Key** (starts with `vr_...`)
  - Your **Service ID** (from earlier)
  - Your **Template ID** (from earlier)

### Step 5: Update Environment Variables
- Create `.env.local` in project root:
  ```
  VITE_EMAILJS_PUBLIC_KEY=vr_xxxxxxxxx
  VITE_EMAILJS_SERVICE_ID=service_xxxxxxxxx
  VITE_EMAILJS_TEMPLATE_ID=template_xxxxxxxxx
  ```

### Step 6: Test
- Fill out contact form on website
- You should receive email at `contact@lakesalt.us`

---

## 📊 Post-Deployment Verification

### Test Website
- [ ] Visit production URL
- [ ] Test all navigation links
- [ ] Mobile responsive on phone
- [ ] Contact form sends email
- [ ] Click all external links
- [ ] Scroll through all sections
- [ ] Check console for errors (F12)

### Test Recipe API (If Deployed)
```bash
curl https://your-recipe-server.com/api/recipe-of-day
curl https://your-recipe-server.com/api/recipes
```

### Verify SEO
- [ ] Open page source (Ctrl+U / Cmd+U)
- [ ] Check meta tags present
- [ ] Schema.org JSON-LD visible
- [ ] OpenGraph tags for sharing

---

## 📈 Monitoring & Maintenance

### Set Up Monitoring

**Vercel Dashboard**
- Monitor builds and deployments
- View analytics
- Check function logs

**Heroku Monitoring**
```bash
heroku logs --tail
heroku metrics
```

**DigitalOcean Monitoring**
- Enable monitoring in Droplet settings
- Set up alerts for CPU/Memory

### Regular Maintenance

- [ ] **Weekly:** Check email logs for failed bookings
- [ ] **Monthly:** Update recipes in `recipes.json`
- [ ] **Quarterly:** Review analytics and testimonials
- [ ] **Quarterly:** Update team bios/services if needed
- [ ] **Annually:** Renew SSL certificates (if self-hosted)

### Backup Strategy
```bash
# Backup recipes
git add recipes.json
git commit -m "Backup: Updated recipes"
git push

# Or use cloud storage
aws s3 cp recipes.json s3://lake-salt-backup/
```

---

## 🔄 Continuous Integration (GitHub Actions - Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - run: npm install
      - run: npm run build
      
      - uses: vercel/actions/deploy-production@main
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

## 🚨 Troubleshooting

### Contact Form Not Sending
1. Check email in spam folder
2. Verify EmailJS credentials in `.env`
3. Check browser console for errors (F12)
4. Verify email template exists in EmailJS

### Recipe API Not Working
1. Check if server is running: `heroku logs` or droplet SSH
2. Test endpoint: `curl https://api.domain.com/health`
3. Verify CORS settings in `recipe_server.py`

### Slow Performance
1. Check image sizes (optimize with TinyPNG)
2. Enable gzip compression (Vercel does this by default)
3. Review Lighthouse score on `https://pagespeed.web.dev`

### SSL Certificate Issues
- Self-hosted: Run `certbot renew`
- Vercel/Netlify: Automatically managed

---

## 📞 Support

If you encounter issues:

1. Check `BUILD_NOTES.md` for detailed technical information
2. Review logs:
   - Vercel: Dashboard → Deployments
   - Heroku: `heroku logs --tail`
   - Self-hosted: Check `recipe_server.py` output

3. Contact EmailJS support for email issues

---

## 🎉 Success Criteria

Your website is successfully deployed when:

✅ Frontend loads at your domain  
✅ All pages and links work  
✅ Contact form sends emails  
✅ Mobile responsive  
✅ SEO tags present  
✅ Daily recipe updates  
✅ No console errors  
✅ Lighthouse score > 85  

---

**Last Updated:** November 10, 2025  
**Status:** Ready for Production 🚀

