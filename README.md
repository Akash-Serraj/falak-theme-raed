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

## Development

Files are read from `storage/themes/falak-theme-2026/{version}/` via the
`themes` disk. After editing a published version locally:

```bash
rm -rf storage/framework/cache/twig/falak-theme-2026   # compiled-template cache
php artisan theme:seed-reference                       # re-freeze manifest + schemas
```
