# Changelog

## 1.0.0 — 2026-08-08

First complete version.

- Design system: token-driven CSS, RTL-first, responsive, reduced-motion aware
- Header: sticky option, cart badge, off-canvas mobile menu, dark variant
- Footer: about text setting, footer menu, dark variant
- Product page: gallery with thumbnails, quantity stepper, add-to-cart
- Listing, cart, search with empty states
- Customer area: profile, orders, order detail, wishlist, notifications (data-guarded)
- Blog and brands pages (data-guarded)
- Thank-you page
- 7 merchant components: hero slider, testimonials, promo banner, store
  features, image with text, photo grid, video
- Full Arabic/English locales

## 1.1.0 — 2026-08-30

- Listing: `<falak-filters>` sidebar (categories with counts, price, rating,
  availability) with applied chips and reset; sort select; off-canvas
  filters drawer on phones
- New SDK components available to blocks: `<falak-count-down>` (offer and
  pre-order timers) and `<falak-filters>`
- Product page: buy-now hidden while sold out; spacing between detail panels
- Locales: countdown, filters and sort strings (ar/en)
- New home block: Videos Slider — portrait (9:16) video cards in a 4-column
  row; muted autoplay while visible, per-card sound toggle, caption + CTA

## 1.2.0 — 2026-10-13

- Hero slider: optional background video per slide (muted loop; the slide
  image stays as its poster and fallback). Only the visible slide's clip
  plays, and none play for shoppers who prefer reduced motion

## 1.3.0 — 2026-10-26

- Customizer: every block ships a preview thumbnail under
  `src/assets/images/sections/` and points at it with `"preview"` in its
  `*.schema.json`; the add-section gallery and section editor show it
- New blocks: Custom HTML, Contact form (plus a `pages/contact.twig` page)
- Testimonials: `source` switch — real approved store reviews (with a `limit`)
  or manually written quotes
- Products carousel: `show_all` switch replaces the free-text `all_url`; the
  link opens the products page for the chosen source
- Video commerce: plays when scrolled into view by default
- Head: `seo.title` / `seo.description` from the platform resolver; the
  breadcrumb trail resets when the language changes; brand colour variables
  are only injected when the merchant picked one
- Account menu: no notifications row (this theme has no notifications page)
- Blog, page, payment-status and product templates follow the current SDK
  components (`<falak-blog-list>`, reviews summary, related products)
