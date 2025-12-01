# 🛍️ Shopify E-commerce Integration Guide

## Overview

This guide walks you through setting up Shopify e-commerce functionality for the Lake Salt Bartending website. The integration provides a seamless, native shopping experience with products managed in Shopify and displayed beautifully on your site.

## 🎯 Features Implemented

### ✅ What's Included

- **Product Grid**: Beautiful, responsive product display with animations
- **Shopping Cart**: Smooth sliding sidebar with real-time updates
- **Add to Cart**: Instant feedback with success animations
- **Quantity Management**: Increase/decrease quantities directly in cart
- **Checkout Integration**: Secure Shopify-hosted checkout
- **Cart Persistence**: Cart saved in localStorage across sessions
- **Mobile Responsive**: Optimized for all device sizes
- **Loading States**: Smooth loading animations and error handling
- **Cart Badge**: Real-time cart count in navbar
- **Premium UX**: Framer Motion animations throughout

## 📋 Prerequisites

Before you begin, you'll need:

1. **Shopify Account** - Sign up at [shopify.com](https://www.shopify.com)
2. **Shopify Store** - Create a new store or use existing one
3. **Products** - At least one product added to your Shopify store
4. **Storefront API Access** - We'll set this up below

## 🚀 Step-by-Step Setup

### Step 1: Create Shopify Store

1. Go to [shopify.com](https://www.shopify.com) and sign up
2. Choose a plan (Basic Shopify - $39/month recommended)
3. Complete store setup wizard
4. Choose a store name (e.g., `lakesalt-shop.myshopify.com`)

### Step 2: Add Products to Shopify

1. In Shopify Admin, go to **Products** → **Add product**
2. Add your products with:
   - **Title**: Product name (e.g., "Signature Cocktail Kit")
   - **Description**: Detailed product description
   - **Price**: Product price
   - **Images**: High-quality product photos
   - **Inventory**: Stock quantity
   - **Variants**: Size, color, etc. (optional)
3. Click **Save**
4. Repeat for all products

**Example Products You Might Add:**
- Cocktail kits (Margarita Kit, Old Fashioned Kit, etc.)
- Bar tools and accessories
- Gift cards
- Branded merchandise (glasses, shakers, etc.)
- Recipe books

### Step 3: Create Storefront API Access Token

This is the most important step - it connects your website to Shopify:

1. In Shopify Admin, go to **Settings** → **Apps and sales channels**
2. Click **Develop apps** (or **Manage private apps** on older accounts)
3. Click **Create an app** (or **Create a private app**)
4. Name it: `Lake Salt Website Integration`
5. Click **Configure Storefront API scopes**
6. Enable these permissions:
   - ✅ `unauthenticated_read_product_listings`
   - ✅ `unauthenticated_read_product_inventory`
   - ✅ `unauthenticated_write_checkouts`
   - ✅ `unauthenticated_read_checkouts`
7. Click **Save**
8. Click **Install app**
9. Copy the **Storefront API access token** (you'll need this!)

⚠️ **Important**: Keep this token secret - don't commit it to GitHub!

### Step 4: Configure Environment Variables

1. Create a `.env.local` file in your project root:

```bash
cd "/Users/kendellandrews/New Lake Salt/lake-salt-bartending"
touch .env.local
```

2. Add your Shopify credentials:

```env
# Shopify Configuration
VITE_SHOPIFY_DOMAIN=your-store.myshopify.com
VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN=your_storefront_access_token_here

# Existing EmailJS Configuration
VITE_EMAILJS_PUBLIC_KEY=your_emailjs_public_key
VITE_EMAILJS_SERVICE_ID=your_emailjs_service_id
VITE_EMAILJS_TEMPLATE_ID=your_emailjs_template_id
```

3. Replace the values:
   - `VITE_SHOPIFY_DOMAIN`: Your store URL (e.g., `lakesalt-shop.myshopify.com`)
   - `VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN`: The token you copied in Step 3

### Step 5: Test Locally

1. Install dependencies (already done):
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Open [http://localhost:5173](http://localhost:5173)

4. Navigate to the **Shop** section

5. Test the following:
   - ✅ Products display correctly
   - ✅ "Add to Cart" button works
   - ✅ Cart sidebar opens/closes
   - ✅ Quantity can be increased/decreased
   - ✅ Items can be removed
   - ✅ "Proceed to Checkout" redirects to Shopify

### Step 6: Test Checkout Flow

1. Add a product to cart
2. Click "Proceed to Checkout"
3. You'll be redirected to Shopify's secure checkout
4. Complete the checkout process (use test mode)
5. After purchase, you'll be returned to your site

**Enable Test Mode:**
- In Shopify Admin → **Settings** → **Payments**
- Enable **Shopify Payments** test mode
- Use test credit card: `4242 4242 4242 4242`

## 🎨 Customization

### Styling

The shop components use your existing Tailwind CSS theme:
- **Navy**: Primary color for text and buttons
- **Gold**: Accent color for prices and highlights
- **Cream**: Background color for sections

To customize colors, edit `tailwind.config.js`:

```javascript
colors: {
  navy: '#YOUR_COLOR',
  gold: '#YOUR_COLOR',
  cream: '#YOUR_COLOR',
}
```

### Product Display

Products are displayed in a 3-column grid on desktop, 2 columns on tablet, and 1 column on mobile. To change this, edit `src/components/Shop.jsx`:

```jsx
// Change grid columns
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
```

### Cart Position

The cart slides in from the right. To change this, edit `src/components/Cart.jsx`:

```jsx
// Slide from left instead
initial={{ x: '-100%' }}
animate={{ x: 0 }}
exit={{ x: '-100%' }}
```

## 📱 Mobile Optimization

The shop is fully responsive:
- **Mobile**: Single column product grid, full-width cart
- **Tablet**: 2-column grid, cart sidebar
- **Desktop**: 3-column grid, cart sidebar

## 🔒 Security

### What's Secure
- ✅ Checkout handled by Shopify (PCI compliant)
- ✅ Payment processing on Shopify servers
- ✅ Customer data stored securely by Shopify
- ✅ SSL/HTTPS required for checkout

### Best Practices
- ❌ Never commit `.env.local` to Git (already in `.gitignore`)
- ✅ Use environment variables for all secrets
- ✅ Regenerate tokens if accidentally exposed
- ✅ Use HTTPS in production

## 🚢 Deployment

### Environment Variables

When deploying to Vercel, Netlify, or Firebase, add environment variables:

**Vercel:**
1. Go to Project Settings → Environment Variables
2. Add `VITE_SHOPIFY_DOMAIN`
3. Add `VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN`

**Netlify:**
1. Go to Site Settings → Build & Deploy → Environment
2. Add variables

**Firebase:**
Add to `.env.production`:
```env
VITE_SHOPIFY_DOMAIN=your-store.myshopify.com
VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN=your_token
```

### Build for Production

```bash
npm run build
```

The shop will be included in the production build automatically.

## 🧪 Testing Checklist

Before going live, test:

- [ ] Products load correctly
- [ ] Product images display
- [ ] Prices format correctly
- [ ] Add to cart works
- [ ] Cart opens/closes smoothly
- [ ] Quantity controls work
- [ ] Remove item works
- [ ] Cart count updates in navbar
- [ ] Cart persists on page refresh
- [ ] Checkout redirects to Shopify
- [ ] Can complete test purchase
- [ ] Mobile responsive
- [ ] Animations smooth on all devices
- [ ] Loading states display
- [ ] Error handling works (try with invalid token)

## 📊 Shopify Admin

### Managing Orders

1. Go to Shopify Admin → **Orders**
2. View all orders, customer info, and payment status
3. Mark orders as fulfilled
4. Print packing slips and shipping labels

### Managing Inventory

1. Go to **Products** → Select product
2. Update inventory quantity
3. Changes reflect on your site immediately

### Analytics

1. Go to **Analytics** → **Reports**
2. View sales, traffic, and conversion data
3. Track which products are most popular

## 🎁 Advanced Features (Future Enhancements)

### Product Quick View
Add a modal to view product details without leaving the shop page.

### Product Filtering
Add filters for price range, categories, etc.

### Product Search
Add search functionality to find products quickly.

### Related Products
Show "You might also like" suggestions.

### Discount Codes
Shopify handles discount codes automatically at checkout.

### Customer Accounts
Enable customer accounts in Shopify for order history.

### Abandoned Cart Recovery
Shopify can email customers who abandon their carts.

## 🆘 Troubleshooting

### Products Not Loading

**Issue**: "Shop is not configured yet" error

**Solution**:
1. Check `.env.local` exists and has correct values
2. Verify `VITE_SHOPIFY_DOMAIN` format (no https://)
3. Verify token is correct
4. Restart dev server: `npm start`

### "Access Denied" Error

**Issue**: API returns 403 error

**Solution**:
1. Check Storefront API permissions in Shopify Admin
2. Ensure all required scopes are enabled
3. Regenerate token if needed

### Cart Not Persisting

**Issue**: Cart clears on page refresh

**Solution**:
1. Check browser localStorage is enabled
2. Check console for errors
3. Clear localStorage and try again: `localStorage.clear()`

### Checkout Not Working

**Issue**: Checkout button doesn't work

**Solution**:
1. Ensure products have prices set
2. Check checkout URL is valid
3. Verify Shopify Payments is enabled

### Images Not Loading

**Issue**: Product images show placeholder

**Solution**:
1. Ensure products have images in Shopify Admin
2. Check image URLs are accessible
3. Verify Storefront API has image permissions

## 💰 Costs

### Shopify Plans
- **Basic Shopify**: $39/month (recommended)
- **Shopify**: $105/month (advanced features)
- **Advanced Shopify**: $399/month (enterprise)

### Transaction Fees
- **Shopify Payments**: 2.9% + 30¢ per transaction
- **Third-party payment**: Additional 2% fee

### Hosting
- Your existing hosting (Vercel/Netlify/Firebase) - Free to $20/month

**Total Monthly Cost**: ~$39-60/month

## 📚 Resources

- [Shopify Storefront API Docs](https://shopify.dev/docs/api/storefront)
- [Shopify Buy SDK](https://github.com/Shopify/js-buy-sdk)
- [Shopify Help Center](https://help.shopify.com)
- [Shopify Community](https://community.shopify.com)

## 🎉 Next Steps

1. ✅ Complete Shopify setup
2. ✅ Add products
3. ✅ Configure environment variables
4. ✅ Test locally
5. ✅ Test checkout flow
6. ✅ Deploy to production
7. 🎊 Start selling!

## 📞 Support

If you need help:
1. Check this guide first
2. Review Shopify documentation
3. Check browser console for errors
4. Test with different products
5. Verify environment variables

---

**Built with ❤️ for Lake Salt Bartending**

Happy selling! 🛍️

