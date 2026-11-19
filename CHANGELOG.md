# Changelog

## 0.1.0 — Unreleased

- Started from the Falak Cart starter theme.

## 1.4.0 — 2026-10-27

- Categories bar: a category's sub-categories arrive as `children` on each
  `menus.categories_menu` item (the platform derives them from the store's
  category tree). A chip with children opens them as a dropdown — on hover,
  or on a first tap where there is no hover, while the chip itself still
  links to the parent listing; folded chips carry their children into the
  "More" panel. The drawer's Categories entry nests them as accordion rows

## 1.5.0 — 2026-10-28

- Hero slider: optional mobile image and mobile video per slide. Phones
  (up to 767px) show their own uploads — video first, then image — and fall
  back to the desktop media only when they have none of their own; the
  desktop side does the same. The image swap is a `<picture>` source, the
  video file is picked once by home.js, and the phone image doubles as the
  phone poster. A slide with phone media is a 1:1 square on phones

## 1.6.0 — 2026-11-04

- Menu text colour: a new Colors setting, menu_text_color, feeds --color-menu-text
  (emitted by master.twig only when set). It paints the top-level main-menu
  links and the categories bar chips on desktop; hover, the current chip and
  the drawer keep their own ink. The customizer shows it beside the header
  background on the Menus panel Style tab
- Categories section: "How many categories" is a dropdown whose first option
  is All (data-limit="all", no cap); only top-level categories show unless the
  new "Show subcategories" switch is on. app.js filters by parent_id
