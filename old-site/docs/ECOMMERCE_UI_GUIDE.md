# 🎨 E-commerce UI/UX Guide

## Visual Overview

This guide shows what each component looks like and how users interact with it.

## 🏠 Navigation Bar

### Desktop View
```
┌─────────────────────────────────────────────────────────────┐
│  🍷 Lake Salt    Services  Gallery  Reviews  Shop  🛒(2)  📞 Book Now │
│     BARTENDING                                                │
└─────────────────────────────────────────────────────────────┘
```

**Features**:
- Logo on left with wine glass icon
- Navigation links in center
- **Shop** link added to nav
- **Cart icon** with badge showing item count
- Book Now CTA button on right

**Interactions**:
- Click "Shop" → Scroll to shop section
- Click cart icon → Open cart sidebar
- Badge shows number of items (e.g., "2")
- Badge animates when items added

### Mobile View
```
┌───────────────────────────┐
│  🍷 Lake Salt    ☰        │
│     BARTENDING            │
└───────────────────────────┘

When menu open:
┌───────────────────────────┐
│  Services                 │
│  Gallery                  │
│  Reviews                  │
│  Shop                     │
│  🛒 Cart            (2)   │
│  📞 Book Now              │
└───────────────────────────┘
```

## 🛍️ Shop Section

### Section Header
```
┌─────────────────────────────────────────────┐
│                                             │
│              🛍️                             │
│                                             │
│        Shop Our Products                    │
│                                             │
│  Discover premium cocktail kits, bar        │
│  accessories, and exclusive merchandise     │
│                                             │
└─────────────────────────────────────────────┘
```

### Product Grid (Desktop - 3 Columns)
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   SALE       │  │              │  │              │
│  ┌────────┐  │  │  ┌────────┐  │  │  ┌────────┐  │
│  │        │  │  │  │        │  │  │  │        │  │
│  │ Image  │  │  │  │ Image  │  │  │  │ Image  │  │
│  │        │  │  │  │        │  │  │  │        │  │
│  └────────┘  │  │  └────────┘  │  │  └────────┘  │
│              │  │              │  │              │
│ Product Name │  │ Product Name │  │ Product Name │
│              │  │              │  │              │
│ Description  │  │ Description  │  │ Description  │
│              │  │              │  │              │
│ $45.00       │  │ $35.00       │  │ Sold Out     │
│              │  │              │  │              │
│ [🛒 Add]     │  │ [🛒 Add]     │  │ [Sold Out]   │
│              │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Product Grid (Mobile - 1 Column)
```
┌──────────────────────┐
│      SALE            │
│   ┌──────────┐       │
│   │          │       │
│   │  Image   │       │
│   │          │       │
│   └──────────┘       │
│                      │
│  Signature Cocktail  │
│  Kit                 │
│                      │
│  Everything you need │
│  to make amazing...  │
│                      │
│  $45.00              │
│                      │
│  [🛒 Add to Cart]    │
│                      │
└──────────────────────┘
```

## 🃏 Product Card States

### Default State
```
┌──────────────────┐
│  ┌────────────┐  │
│  │            │  │
│  │   Image    │  │  ← Hover: Scales up 110%
│  │            │  │
│  └────────────┘  │
│                  │
│  Product Title   │  ← Hover: Turns gold
│  Description...  │
│                  │
│  $45.00          │
│  [🛒 Add]        │  ← Gradient navy→gold
└──────────────────┘
```

### Hover State
```
┌──────────────────┐
│  Quick View      │  ← Badge appears
│  ┌────────────┐  │
│  │            │  │
│  │   Image    │  │  ← Scaled up
│  │  (larger)  │  │
│  └────────────┘  │
│                  │
│  Product Title   │  ← Gold color
│  Description...  │
│                  │
│  $45.00          │
│  [🛒 Add] ↑      │  ← Lifted up
└──────────────────┘
```

### Adding State
```
┌──────────────────┐
│  ┌────────────┐  │
│  │   Image    │  │
│  └────────────┘  │
│                  │
│  Product Title   │
│  Description...  │
│                  │
│  $45.00          │
│  [⟳ Adding...]   │  ← Spinning icon
└──────────────────┘
```

### Success State
```
┌──────────────────┐
│  ┌────────────┐  │
│  │   Image    │  │
│  └────────────┘  │
│                  │
│  Product Title   │
│  Description...  │
│                  │
│  $45.00          │
│  [✓ Added!]      │  ← Green, checkmark
└──────────────────┘
```

### Sale Badge
```
┌──────────────────┐
│  SALE            │  ← Red badge, rotated -12°
│  ┌────────────┐  │
│  │   Image    │  │
│  └────────────┘  │
│                  │
│  Product Title   │
│                  │
│  $50.00          │  ← Strikethrough
│  $45.00          │  ← Gold, larger
│  [🛒 Add]        │
└──────────────────┘
```

## 🛒 Shopping Cart Sidebar

### Cart Closed (Navbar Badge Only)
```
Navigation bar:
... Shop  🛒(3)  Book Now
          ↑
     Badge shows count
```

### Cart Opening Animation
```
1. User clicks cart icon
2. Backdrop fades in (black overlay)
3. Cart slides in from right
4. Items stagger in one by one
```

### Cart Open (Desktop)
```
┌─────────────────────────────┐
│  🛒 Your Cart          (3) ✕│  ← Header (navy→gold gradient)
├─────────────────────────────┤
│                             │
│  ┌─────────────────────┐   │  ← Item 1
│  │ [img] Product Name  │   │
│  │       Variant       │   │
│  │       [-] 2 [+]     │   │  ← Quantity controls
│  │       $90.00    🗑️  │   │  ← Price & remove
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │  ← Item 2
│  │ [img] Product Name  │   │
│  │       [-] 1 [+]     │   │
│  │       $35.00    🗑️  │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │  ← Item 3
│  │ [img] Product Name  │   │
│  │       [-] 1 [+]     │   │
│  │       $45.00    🗑️  │   │
│  └─────────────────────┘   │
│                             │
├─────────────────────────────┤
│  Subtotal         $170.00   │
│  Shipping calculated at     │
│  checkout                   │
│                             │
│  Total            $170.00   │  ← Bold, gold
│                             │
│  [Proceed to Checkout 🔗]   │  ← Navy→gold gradient
│                             │
│  [Continue Shopping]        │  ← White with navy border
│                             │
│  🔒 Secure checkout by      │
│     Shopify                 │
└─────────────────────────────┘
```

### Empty Cart State
```
┌─────────────────────────────┐
│  🛒 Your Cart           ✕   │
├─────────────────────────────┤
│                             │
│                             │
│         🛒                  │  ← Large gray icon
│                             │
│    Your cart is empty       │
│                             │
│  Add some products to       │
│  get started!               │
│                             │
│  [Continue Shopping]        │
│                             │
│                             │
└─────────────────────────────┘
```

### Cart Item Interactions

**Quantity Controls**:
```
┌─────────────────┐
│  [-]  2  [+]    │  ← White rounded pill
└─────────────────┘
     ↓    ↓    ↓
  Decrease  Remove  Increase
  (if >1)   (if =1)
```

**Remove Button**:
```
🗑️  ← Red trash icon
↓
Hover: Darker red
Click: Item fades out & slides left
```

## 📱 Mobile Cart Experience

### Full-Screen Cart (Mobile)
```
┌─────────────────────┐
│ 🛒 Your Cart  (2) ✕ │  ← Full width header
├─────────────────────┤
│                     │
│ ┌─────────────────┐ │
│ │[img] Product    │ │  ← Full width items
│ │     Name        │ │
│ │  [-] 2 [+]      │ │
│ │  $90.00    🗑️   │ │
│ └─────────────────┘ │
│                     │
│ ┌─────────────────┐ │
│ │[img] Product    │ │
│ │     Name        │ │
│ │  [-] 1 [+]      │ │
│ │  $35.00    🗑️   │ │
│ └─────────────────┘ │
│                     │
│     (Scrollable)    │
│                     │
├─────────────────────┤
│ Total    $125.00    │  ← Sticky footer
│                     │
│ [Proceed to         │
│  Checkout 🔗]       │
│                     │
│ [Continue Shopping] │
└─────────────────────┘
```

## 🎬 Animation Sequences

### 1. Product Card Entry
```
Frame 1: Invisible, below viewport
Frame 2: Fade in, slide up
Frame 3: Fully visible
Duration: 0.5s
Stagger: 0.1s between cards
```

### 2. Add to Cart
```
Frame 1: Button normal
Frame 2: Button scales down (0.95)
Frame 3: Icon spins, text "Adding..."
Frame 4: Background turns green
Frame 5: Icon becomes checkmark
Frame 6: Text "Added!"
Frame 7: Cart sidebar slides in
Duration: 2s total
```

### 3. Cart Open
```
Frame 1: Cart off-screen (right)
Frame 2: Backdrop fades in (0.3s)
Frame 3: Cart slides in (0.4s spring)
Frame 4: Items stagger in (0.1s each)
Total: ~1s
```

### 4. Cart Close
```
Frame 1: Cart visible
Frame 2: Cart slides out (right)
Frame 3: Backdrop fades out
Duration: 0.3s
```

### 5. Quantity Change
```
Frame 1: Button scales down
Frame 2: Number updates
Frame 3: Price updates (gold flash)
Frame 4: Total updates
Duration: 0.2s
```

## 🎨 Color Usage

### Primary Actions
- **Add to Cart**: Navy → Gold gradient
- **Checkout**: Navy → Gold gradient
- **Hover**: Gold highlight

### Secondary Actions
- **Continue Shopping**: White with navy border
- **Quantity Controls**: White background, navy text

### Status Colors
- **Success**: Green (#10b981)
- **Error**: Red (#ef4444)
- **Sale**: Red badge (#ef4444)
- **Price**: Gold (#f59e0b)

### Backgrounds
- **Section**: Cream (#fef3c7)
- **Cards**: White (#ffffff)
- **Cart Header**: Navy → Gold gradient
- **Backdrop**: Black 50% opacity

## 📐 Spacing & Sizing

### Product Cards
- **Width**: 100% (mobile), 50% (tablet), 33% (desktop)
- **Padding**: 1.5rem (24px)
- **Gap**: 2rem (32px)
- **Border Radius**: 1rem (16px)

### Cart Sidebar
- **Width**: 100% (mobile), 28rem (448px) desktop
- **Padding**: 1.5rem (24px)
- **Item Gap**: 1rem (16px)

### Buttons
- **Height**: 3rem (48px) - primary
- **Height**: 2.5rem (40px) - secondary
- **Padding**: 1.5rem horizontal
- **Border Radius**: 9999px (fully rounded)

### Typography
- **Section Title**: 3rem (48px), bold
- **Product Title**: 1.25rem (20px), bold
- **Price**: 1.5rem (24px), bold
- **Description**: 0.875rem (14px), regular

## 🖱️ Interaction States

### Buttons
```
Normal:   Gradient, shadow
Hover:    Scale 1.05, larger shadow
Active:   Scale 0.95
Disabled: 50% opacity, no pointer
```

### Product Cards
```
Normal:   White background, shadow
Hover:    Larger shadow, image scales
Active:   None (handled by button)
```

### Quantity Controls
```
Normal:   Navy icon
Hover:    Gold icon, scale 1.2
Active:   Scale 0.9
Disabled: 50% opacity
```

## ♿ Accessibility Features

### Keyboard Navigation
- Tab through all interactive elements
- Enter/Space to activate buttons
- Escape to close cart

### Screen Readers
- Proper ARIA labels on all buttons
- Cart count announced
- Price changes announced
- Loading states announced

### Visual Indicators
- Focus rings on interactive elements
- Clear hover states
- Loading spinners
- Success/error messages

## 📱 Touch Targets

All interactive elements meet minimum size:
- **Buttons**: 44x44px minimum
- **Icons**: 44x44px tap area
- **Links**: 44px height minimum

## 🎯 User Feedback

### Success Feedback
- ✓ Checkmark animation
- Green background flash
- Cart badge updates
- Cart opens automatically

### Error Feedback
- ❌ Error icon
- Red background
- Error message text
- Retry button

### Loading Feedback
- ⟳ Spinning icon
- "Loading..." text
- Disabled buttons
- Skeleton screens (future)

## 🌙 Dark Mode (Future Enhancement)

Currently uses light theme matching site:
- White backgrounds
- Navy text
- Gold accents

Future dark mode would use:
- Dark backgrounds (#1f2937)
- White text
- Same gold accents

---

**This UI guide shows the complete visual design of the e-commerce integration. All animations are smooth, all interactions are intuitive, and the design matches your existing brand perfectly.**

