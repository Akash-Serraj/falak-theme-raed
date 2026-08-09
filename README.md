# Falak Theme 2026

Falak Cart's default storefront theme and the official reference implementation
of the theme package structure. Bilingual (Arabic/English), RTL-first.

## Structure

```
theme.json                  manifest: metadata, settings schema, presets
src/
  assets/
    styles/app.css          design system — token-driven, RTL via logical properties
    js/app.js               menu drawer, add-to-cart, qty stepper, gallery
    js/home.js              hero slider
  locales/
    ar.json · en.json       every trans() key used by the templates
  views/
    layouts/master.twig     required hooks: head:end, body:end
    layouts/customer.twig   account-area layout (side navigation)
    pages/                  one template per platform page type
    components/             header/footer + merchant-placeable blocks
```

## Platform contract

Globals, sandboxed functions, hooks and page-data shapes are defined by
`config/theme-context.php` in the platform. The Twig sandbox allows a fixed
set of tags, filters and functions — run the platform checklist before
submitting.

Pages under `pages/customer/`, `pages/blog/`, `pages/brands/`, `search.twig`
and `thank-you.twig` are ahead of the current storefront routes: they are
data-guarded and render empty states until the platform wires their data.

## Merchant components

| Component | Areas |
|---|---|
| Hero slider | home |
| Testimonials | home, pages |
| Promo banner | home, pages |
| Store features | home, pages |
| Image with text | home, pages |
| Photo grid | home, pages |
| Video | home, pages |

## Development

Files are read from `storage/themes/falak-theme-2026/{version}/` via the
`themes` disk. After editing a published version locally:

```bash
rm -rf storage/framework/cache/twig/falak-theme-2026   # compiled-template cache
php artisan theme:seed-reference                       # re-freeze manifest + schemas
```
