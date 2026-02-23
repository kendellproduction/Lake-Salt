# Lake Salt Redesign - Design Specs

## Current Site Analysis

### What's Working
- Complete feature set (hero, about, gallery, services, reviews, FAQ, contact)
- Mobile responsive
- Functional contact form
- Team bio section

### Areas to Improve
- Visual hierarchy and spacing
- Premium feel
- Call-to-action clarity
- Social proof visibility

---

## Page-by-Page Design Specs

### 1. HERO SECTION

**Current:** Carousel with multiple images
**Proposed:** Single powerful hero

```
Layout:
- Full-width hero (100vh on desktop, 80vh mobile)
- Background: Video or high-quality image with overlay
- Centered text: Headline + subheadline + 2 buttons
- Bottom: Scroll indicator

Colors:
- Background overlay: rgba(0,0,0,0.4)
- Headline: #FFFFFF (white)
- Subheadline: #E0E0E0
- Primary CTA: Gold (#C9A962)
- Secondary CTA: Transparent with white border
```

**Content:**
- Headline: "Utah's Premier Mobile Bar Experience"
- Subheadline: "Professional bartending for weddings, corporate events, and private celebrations"
- CTA 1: "Book Now" (gold button)
- CTA 2: "View Services" (outline button)

---

### 2. ABOUT SECTION

**Current:** Team photos of Ken & Maddie
**Proposed:** Enhanced team section with story

```
Layout:
- Two columns (image + text) on desktop
- Stacked on mobile
- Subtle parallax on scroll

Content:
- Brief story about starting Lake Salt
- Ken & Maddie with roles
- "Our Philosophy" or "Why We Love It"
```

---

### 3. SERVICES SECTION

**Current:** 4 service packages in cards
**Proposed:** Clearer, more compelling

```
Layout:
- 4 cards in grid (2x2 on desktop, 1 column mobile)
- One card highlighted as "Most Popular"
- Clear pricing prominently displayed
- What's included list for each

Cards:
1. **The Host Bar** (starter) - $XXX
2. **The Craft Bar** (popular) - $XXX ← HIGHLIGHT
3. **The Premium Bar** - $XXX
4. **The Ultimate Experience** - $XXX

Each card shows:
- Package name
- Price
- What's included (bulleted list)
- CTA button
```

---

### 4. GALLERY SECTION

**Current:** Grid + carousel
**Proposed:** Curated showcase

```
Layout:
- Category tabs: All | Weddings | Corporate | Private
- Masonry or grid layout
- Lightbox on click
- "View More" button

Categories:
- Weddings
- Corporate Events
- Private Parties
- Holiday Parties
```

---

### 5. REVIEWS SECTION

**Current:** 5 testimonials carousel
**Proposed:** More visible social proof

```
Layout:
- Large quote with 5 stars
- Customer name and event type
- Google Reviews badge/link
- "See All Google Reviews" link

Content:
- Rotate through top reviews
- Show average rating prominently (5.0 ★)
- Link to Google Business page
```

---

### 6. FREQUENTLY ASKED QUESTIONS

**Current:** Accordion
**Proposed:** Grouped by category

```
Categories:
- Pricing & Packages
- The Day Of
- Travel & Location
- Custom Drinks

Style:
- Expand/collapse accordions
- Plus/minus icons
- Smooth animation
```

---

### 7. CONTACT / BOOKING

**Current:** Form with EmailJS
**Proposed:** Streamlined booking

```
Layout:
- Two columns on desktop
- Left: Contact form
- Right: Contact info + FAQ link

Form Fields:
- Name
- Email  
- Phone
- Event Date
- Event Type (dropdown)
- Guest Count
- Message

Plus:
- "How did you hear about us?" dropdown
- Quick response time indicator
```

---

### 8. FOOTER

**Current:** Basic footer
**Proposed:** Complete footer

```
Content:
- Logo
- Quick links
- Services
- Contact info
- Social media icons
- Business license info
- Copyright
```

---

## Color Palette (Keep Same)

```
Primary: #C9A962 (Gold)
Primary Dark: #A88B4A
Background: #0A0A0A (Dark)
Background Secondary: #1A1A1A
Text: #FFFFFF
Text Secondary: #A0A0A0
Accent: #C9A962
```

---

## Typography

```
Headlines: Playfair Display (elegant, premium)
Body: Inter or System UI (clean, readable)
```

---

## Mobile Considerations

- Hamburger menu
- Sticky CTA button
- Swipe-friendly galleries
- Large tap targets (44px min)
- Readable text (16px base)

---

## Animations

- Hero: Fade in on load
- Scroll reveal: Sections fade up as user scrolls
- Hover: Subtle lift on cards (transform: translateY(-4px))
- Buttons: Scale on hover (1.02)
- Accordion: Smooth expand/collapse
