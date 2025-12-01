# 🏗️ E-commerce Architecture Documentation

## System Overview

The Lake Salt Bartending e-commerce integration uses a **headless commerce** approach where:
- **Frontend**: Your React website (product display, cart UI)
- **Backend**: Shopify (product data, checkout, payments, orders)
- **Integration**: Shopify Storefront API

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        App.jsx                              │
│                    (Root Component)                         │
│                                                             │
│  ┌───────────────────────────────────────────────────┐    │
│  │            CartProvider (Context)                  │    │
│  │         (Global Cart State Management)             │    │
│  │                                                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │    │
│  │  │   Navbar     │  │    Shop      │  │  Cart   │ │    │
│  │  │              │  │              │  │         │ │    │
│  │  │ - Shop Link  │  │ - Product    │  │ - Items │ │    │
│  │  │ - Cart Icon  │  │   Grid       │  │ - Total │ │    │
│  │  │ - Cart Badge │  │ - Loading    │  │ - Qty   │ │    │
│  │  │              │  │ - Error      │  │ - Remove│ │    │
│  │  └──────────────┘  └──────────────┘  └─────────┘ │    │
│  │                           │                        │    │
│  │                           ↓                        │    │
│  │                  ┌──────────────┐                 │    │
│  │                  │ ProductCard  │                 │    │
│  │                  │              │                 │    │
│  │                  │ - Image      │                 │    │
│  │                  │ - Title      │                 │    │
│  │                  │ - Price      │                 │    │
│  │                  │ - Add Button │                 │    │
│  │                  └──────────────┘                 │    │
│  └───────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
                    ┌──────────────────┐
                    │  shopify.js      │
                    │  (API Utils)     │
                    │                  │
                    │ - fetchProducts  │
                    │ - createCheckout │
                    │ - addToCheckout  │
                    │ - updateItem     │
                    │ - removeItem     │
                    └──────────────────┘
                              │
                              ↓
                    ┌──────────────────┐
                    │  Shopify API     │
                    │  (Storefront)    │
                    └──────────────────┘
```

## Data Flow

### 1. Loading Products

```
User visits site
      ↓
Shop component mounts
      ↓
fetchProducts() called
      ↓
Shopify API request
      ↓
Products returned
      ↓
ProductCard components rendered
```

### 2. Adding to Cart

```
User clicks "Add to Cart"
      ↓
ProductCard calls addItem()
      ↓
CartContext.addItem(variantId, quantity)
      ↓
addToCheckout() API call
      ↓
Shopify updates checkout
      ↓
CartContext updates state
      ↓
Cart sidebar opens
      ↓
Cart badge updates
      ↓
localStorage saves checkout ID
```

### 3. Checkout Flow

```
User clicks "Proceed to Checkout"
      ↓
getCheckoutUrl() returns Shopify URL
      ↓
window.open() to Shopify checkout
      ↓
User completes payment on Shopify
      ↓
Shopify processes payment
      ↓
Order created in Shopify Admin
      ↓
User redirected back to site
```

## State Management

### CartContext State

```javascript
{
  checkout: {
    id: "Z2lkOi8vc2hvcGlmeS9DaGVja291dC8...",
    webUrl: "https://yourstore.myshopify.com/...",
    lineItems: [
      {
        id: "Z2lkOi8vc2hvcGlmeS9DaGVja291dExpbmVJdGVtLy...",
        title: "Signature Cocktail Kit",
        quantity: 2,
        variant: {
          id: "Z2lkOi8vc2hvcGlmeS9Qcm9kdWN0VmFyaWFudC8...",
          title: "Default Title",
          price: "45.00",
          image: { src: "https://cdn.shopify.com/..." }
        }
      }
    ],
    subtotalPrice: { amount: "90.00", currencyCode: "USD" },
    totalPrice: { amount: "90.00", currencyCode: "USD" }
  },
  isCartOpen: false,
  isLoading: false,
  cartCount: 2
}
```

### LocalStorage Persistence

```javascript
// Stored in browser
localStorage.setItem('shopify_checkout_id', checkoutId);

// Retrieved on page load
const checkoutId = localStorage.getItem('shopify_checkout_id');

// Cart persists across:
// - Page refreshes
// - Navigation
// - Browser close/reopen (until checkout completed)
```

## API Integration

### Shopify Storefront API

**Endpoint**: `https://your-store.myshopify.com/api/2024-01/graphql.json`

**Authentication**: Storefront Access Token (in headers)

**Key Operations**:

1. **Fetch Products**
   ```javascript
   shopifyClient.product.fetchAll()
   ```

2. **Create Checkout**
   ```javascript
   shopifyClient.checkout.create()
   ```

3. **Add Line Items**
   ```javascript
   shopifyClient.checkout.addLineItems(checkoutId, lineItems)
   ```

4. **Update Quantity**
   ```javascript
   shopifyClient.checkout.updateLineItems(checkoutId, lineItems)
   ```

5. **Remove Items**
   ```javascript
   shopifyClient.checkout.removeLineItems(checkoutId, lineItemIds)
   ```

## Component Details

### 1. Shop Component (`src/components/Shop.jsx`)

**Responsibilities**:
- Fetch products from Shopify
- Display loading state
- Handle errors
- Render product grid
- Show empty state

**State**:
```javascript
{
  products: [],
  isLoading: true,
  error: null
}
```

**Key Features**:
- Responsive grid (1/2/3 columns)
- Staggered animations
- Error retry button
- Custom order CTA

### 2. ProductCard Component (`src/components/ProductCard.jsx`)

**Responsibilities**:
- Display product info
- Handle add to cart
- Show success feedback
- Display sale badges
- Handle out of stock

**Props**:
```javascript
{
  product: {
    id: string,
    title: string,
    description: string,
    images: [{ src: string }],
    variants: [{
      id: string,
      price: string,
      compareAtPrice: string,
      available: boolean
    }]
  }
}
```

**Animations**:
- Fade in on scroll
- Hover scale effect
- Button pulse on add
- Success checkmark

### 3. Cart Component (`src/components/Cart.jsx`)

**Responsibilities**:
- Display cart items
- Update quantities
- Remove items
- Show totals
- Handle checkout

**Features**:
- Sliding sidebar animation
- Backdrop overlay
- Quantity +/- controls
- Item removal
- Empty state
- Checkout button

**Animations**:
- Slide in from right
- Backdrop fade
- Item stagger
- Button interactions

### 4. CartContext (`src/contexts/CartContext.jsx`)

**Responsibilities**:
- Global cart state
- Cart operations
- LocalStorage sync
- Checkout management

**Provided Values**:
```javascript
{
  // State
  checkout: Object,
  isCartOpen: boolean,
  isLoading: boolean,
  cartCount: number,
  
  // Actions
  addItem: (variantId, quantity) => void,
  updateItem: (lineItemId, quantity) => void,
  removeItem: (lineItemId) => void,
  clearCart: () => void,
  toggleCart: () => void,
  openCart: () => void,
  closeCart: () => void,
  
  // Getters
  getCheckoutUrl: () => string,
  getTotalPrice: () => Object,
  getSubtotalPrice: () => Object,
  getLineItems: () => Array
}
```

### 5. Navbar Updates (`src/components/Navbar.jsx`)

**New Features**:
- Shop navigation link
- Cart icon button
- Cart count badge
- Mobile cart button

**Integration**:
```javascript
const { toggleCart, cartCount } = useCart();
```

## Security Considerations

### What's Secure ✅

1. **Payment Processing**
   - Handled entirely by Shopify
   - PCI DSS compliant
   - SSL/TLS encrypted

2. **Customer Data**
   - Stored on Shopify servers
   - Not accessible from frontend
   - GDPR/CCPA compliant

3. **API Tokens**
   - Stored in environment variables
   - Not committed to Git
   - Read-only access (Storefront API)

### What's NOT Secure ❌

1. **Storefront Token Exposure**
   - Token is visible in frontend code
   - This is by design (read-only)
   - Can only read products, not sensitive data

2. **Cart Data**
   - Stored in localStorage (client-side)
   - Can be cleared by user
   - No sensitive payment info stored

## Performance Optimizations

### 1. Lazy Loading
- Product images load on demand
- `loading="lazy"` attribute
- Intersection Observer for animations

### 2. Code Splitting
- Components loaded as needed
- Vite handles automatic splitting
- Smaller initial bundle

### 3. Caching
- Checkout ID cached in localStorage
- Reduces API calls
- Faster cart restoration

### 4. Animations
- RequestAnimationFrame for smooth scrolling
- GPU-accelerated transforms
- Framer Motion optimizations

## Error Handling

### Network Errors
```javascript
try {
  const products = await fetchProducts();
} catch (error) {
  setError('Unable to load products');
  console.error(error);
}
```

### Invalid Configuration
```javascript
if (!isShopifyConfigured()) {
  setError('Shop is not configured yet');
  return;
}
```

### Checkout Errors
```javascript
if (!checkout) {
  console.error('Checkout not initialized');
  return;
}
```

## Testing Strategy

### Unit Tests (Future)
- Test cart operations
- Test price formatting
- Test quantity validation

### Integration Tests (Future)
- Test add to cart flow
- Test checkout creation
- Test cart persistence

### Manual Testing Checklist
- [ ] Products load correctly
- [ ] Add to cart works
- [ ] Cart updates in real-time
- [ ] Quantities can be changed
- [ ] Items can be removed
- [ ] Checkout redirects properly
- [ ] Cart persists on refresh
- [ ] Mobile responsive
- [ ] Animations smooth

## Deployment Considerations

### Environment Variables
Must be set in hosting platform:
- `VITE_SHOPIFY_DOMAIN`
- `VITE_SHOPIFY_STOREFRONT_ACCESS_TOKEN`

### Build Process
```bash
npm run build
```
- Vite bundles all code
- Environment variables injected
- Assets optimized
- Output to `dist/`

### CDN Considerations
- Product images served from Shopify CDN
- Automatically optimized
- Global distribution
- Fast loading

## Monitoring & Analytics

### Shopify Analytics
- Track in Shopify Admin
- Sales reports
- Conversion rates
- Top products

### Google Analytics (Optional)
Add tracking for:
- Product views
- Add to cart events
- Checkout initiations
- Purchase completions

### Error Monitoring (Optional)
Use Sentry or similar:
- Track API errors
- Monitor cart issues
- Alert on failures

## Future Enhancements

### Phase 2 Features
- [ ] Product search
- [ ] Category filtering
- [ ] Product quick view modal
- [ ] Related products
- [ ] Wishlist functionality
- [ ] Product reviews
- [ ] Size/variant selector
- [ ] Discount code input

### Phase 3 Features
- [ ] Customer accounts
- [ ] Order history
- [ ] Abandoned cart recovery
- [ ] Email marketing integration
- [ ] Loyalty program
- [ ] Gift wrapping options
- [ ] Subscription products

## Troubleshooting Guide

### Issue: Products Not Loading
**Symptoms**: Empty shop, error message
**Causes**:
- Invalid Shopify credentials
- Missing environment variables
- API permissions not set
**Solution**: Verify `.env.local` and Shopify API settings

### Issue: Cart Not Persisting
**Symptoms**: Cart clears on refresh
**Causes**:
- localStorage disabled
- Browser privacy mode
- localStorage quota exceeded
**Solution**: Check browser settings, clear storage

### Issue: Checkout Not Working
**Symptoms**: Checkout button doesn't work
**Causes**:
- Invalid checkout URL
- Shopify Payments not enabled
- Products without prices
**Solution**: Verify Shopify settings, check console

## Resources

- [Shopify Storefront API Docs](https://shopify.dev/docs/api/storefront)
- [Shopify Buy SDK GitHub](https://github.com/Shopify/js-buy-sdk)
- [React Context API Docs](https://react.dev/reference/react/useContext)
- [Framer Motion Docs](https://www.framer.com/motion/)

---

**Last Updated**: November 2025  
**Version**: 1.0.0  
**Author**: Lake Salt Bartending Development Team

