# Falak Cart Starter Theme

The starting point for a Falak Cart storefront theme. Bilingual
(Arabic/English), RTL-first, and complete: every page type, a header and
footer, and a set of components merchants can place on their pages.

Rename it, restyle it, add or remove components — it is yours.

## Getting started

Create a theme from the Partners Portal, or from the terminal with the
[Falak CLI](https://www.npmjs.com/package/@falakcart/cli):

```bash
npm install -g @falakcart/cli
falak login
falak theme create my-theme
cd my-theme
falak theme preview      # every save lands on your demo store
```

A theme created in the Portal lives in a GitHub repository instead: each push
to its development branch is checked and, if it passes, deployed to your demo
store. A push that fails the security checks is not deployed — the reason
shows in the Portal and as a check on the commit in GitHub.

Before submitting a version for review, run:

```bash
falak theme validate
```

## Structure

```
theme.json                  manifest: name, settings schema, presets
src/
  assets/
    styles/app.css          design system — token-driven, RTL via logical properties
    js/app.js               menu drawer, add-to-cart, qty stepper, gallery
    js/home.js              hero slider
    images/sections/        one preview thumbnail per block, 800px wide (see below)
  locales/
    ar.json · en.json       every trans() key used by the templates
  views/
    layouts/master.twig     required hooks: head:end, body:end
    layouts/customer.twig   account-area layout (side navigation)
    pages/                  one template per storefront page type
    components/             header/footer + merchant-placeable blocks
```

Fill in `author`, `author_email`, `support_url` and `description` in
`theme.json` — they are what merchants see on your marketplace listing, and
where they come for help with your theme.

## Templates

Templates are Twig, rendered in a sandbox: a fixed set of tags, filters and
functions is allowed, and `falak theme validate` reports anything outside it.
The globals every view receives (`store`, `theme`, `menus`, `page`, `user`)
are listed at the top of `layouts/master.twig`.

Pages under `pages/customer/`, `pages/blog/`, `pages/brands/`, `search.twig`
and `thank-you.twig` are data-guarded: they render an empty state when the
store has nothing to show there.

A theme may only contain Twig templates, CSS, JavaScript, JSON, images, fonts
and text files. Keep scripts inside the theme, under `src/assets`, rather than
loading them from other domains.

## Merchant components

| Component | Areas | Preview |
|---|---|---|
| Hero slider | home | `enhanced-slider.png` |
| Products grid | home, pages | `products.png` |
| Products carousel | home, pages | `products-slider.png` |
| Video commerce | home, pages | `video-products.png` |
| Videos slider | home, pages | `videos-slider.png` |
| Video | home, pages | `video.png` |
| All categories | home, pages | `categories-circles.png` |
| Promo banner | home, pages | `banner.png` |
| Offer countdown | home, pages | `offer-countdown.png` |
| Image with text | home, pages | `image-with-text.png` |
| Photo grid | home, pages | `photo-grid.png` |
| Store features | home, pages | `features.png` |
| Testimonials | home, pages | `testimonials.png` |
| Newsletter | home, pages | `newsletter.png` |
| Contact form | home, pages | `contact.png` |
| Custom HTML | home, pages | `custom-html.png` |

### Preview thumbnails

Every block carries a `"preview"` entry in its `*.schema.json`, next to `icon`:

```json
"icon": "image-line",
"preview": "images/sections/banner.png",
```

The path is relative to `src/assets/`. The customizer shows the picture in the
add-section gallery and at the top of the section editor, resolving it against
wherever this version's assets are served from (CDN for a published version,
the dev proxy for a workspace). Because the image travels inside the package,
each submitted version shows its own screenshots and a store pinned to an older
version keeps seeing that version's pictures.

Keep thumbnails at 800px wide, PNG, named after the schema file. A block
without `preview` still works; the gallery falls back to its icon.

## Customizer annotations

The merchant edits this theme in a live preview: hovering a component outlines
it, clicking it opens its editor, typing rewrites the page as they type, and
double-clicking text edits it in place. Most of that is free — the platform
wraps every `{% component %}` in draft renders, so **every component is already
selectable without the theme doing anything**.

What a theme adds is the finer half: which element renders which field. Tag it,
and that element becomes selectable on its own, writable while the merchant
types, and editable in place.

```twig
<h2 data-falak-field="title" data-falak-label="{{ trans('editor.field.title') }}">{{ component.title }}</h2>
```

| Attribute | Purpose |
|---|---|
| `data-falak-field="id"` | The blueprint field this element renders. Must match an `id` in the component's `*.schema.json`. |
| `data-falak-label="…"` | What the merchant sees on the overlay. Use `trans()` so it follows their language; falls back to the field id. |
| `data-falak-bind="target"` | Where the value is written: `text` (default), `src` (default for `<img>`/`<iframe>`), `href`, `alt`, `background`, or `none`. |
| `data-falak-bind-<target>="id"` | Binds a *second* field to the same element — one `<a>` carrying both its label and its href. |
| `data-falak-bind="attr:<name>"` / `data-falak-bind-attr-<name>="id"` | Writes the value into an attribute. This is how a field reaches an SDK component: `<falak-countdown title="…" data-falak-field="title" data-falak-bind="attr:title" data-falak-bind-attr-date="ends_at">` re-renders itself as the merchant types. An element carrying only `bind-attr-*` bindings also needs `data-falak-bound`. |

### Rules worth knowing before you tag anything

1. **`text` replaces the element's content.** Tag the element holding that value
   and nothing else. A wrapper with an icon inside it loses the icon.
2. **Collections take `bind="none"`.** A `collection` field's value is a list,
   not a string. Tagged without it, the customizer stringifies the whole list
   into the element the first time the merchant touches that field. The element
   stays selectable; the panel keeps the editing.
3. **A field the theme skips has nothing to write into.** `{% if component.title %}`
   means an empty title renders no element, so the merchant's first title
   appears on save rather than instantly. Render it unconditionally and hide it
   with `:empty` in your CSS if you want it live.
4. **Field ids are checked.** They point at `*.schema.json` by name, and nothing
   at runtime complains when one drifts — the overlay just quietly stops
   highlighting. Rename a field, rename its tag.
5. **An `<iframe>` swallows the pointer.** Put the selection on a wrapper with
   `bind="none"` and write the value through `data-falak-bind-src` on the frame.
6. **Keep `{% hook 'body:end' %}` in master.twig.** The editor bridge is injected
   there in draft renders. Without it the preview loses click-to-edit entirely.

None of these attributes reach a shopper: they are inert HTML, and the live
storefront render never carries the editor markers either.

### Languages

The customizer opens the language box matching the text that was clicked —
which is not always the language being previewed, because a value written in
only one language still renders in the other. The platform works that out per
field; a theme just renders `{{ component.title }}` as normal and tags it.

## Releasing

Record your own releases in `CHANGELOG.md`, and raise the version with
`falak theme version patch|minor|major` before each submission.
