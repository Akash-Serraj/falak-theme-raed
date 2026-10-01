/*
    Falak Theme 2026 — site-wide behavior.

    Commerce actions (add to cart, quantity, wishlist, checkout) are NOT
    handled here — they're delegated entirely to the `<falak-*>` SDK web
    components (see falak-add-product-button.js and friends), so a page keeps
    working even if this file fails to load. What's left here is markup-only
    behavior the SDK doesn't own: the mobile menu drawer, language-switch link
    rewriting, and small per-page glue (e.g. the listing sort + filters drawer below).
*/
(function () {
    'use strict';

    /* ------------------------------------------------ mobile menu drawer */

    var toggle = document.querySelector('[data-menu-toggle]');
    var backdrop = document.querySelector('[data-menu-backdrop]');

    function closeMenu() {
        document.body.classList.remove('menu-is-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
        if (backdrop) backdrop.hidden = true;
    }

    if (toggle) {
        toggle.addEventListener('click', function () {
            var open = document.body.classList.toggle('menu-is-open');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (backdrop) backdrop.hidden = !open;
        });
    }

    if (backdrop) backdrop.addEventListener('click', closeMenu);

    // Dropdown submenus, keyboard handling and viewport-edge flipping are
    // handled by <falak-menu> (see menu.twig's own comment) — kept out of
    // this file entirely to avoid double-toggling.

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeMenu();
    });

    /* ----------------------------------------------- language switching */
    // The storefront reads ?lang= per request, so the choice must ride on
    // every internal link until the platform persists locale in the session.

    var currentLang = new URLSearchParams(window.location.search).get('lang');

    document.addEventListener('click', function (event) {
        var swap = event.target.closest('[data-set-lang]');
        if (!swap) return;

        event.preventDefault();
        var params = new URLSearchParams(window.location.search);
        params.set('lang', swap.getAttribute('data-set-lang'));
        window.location.search = params.toString();
    });

    if (currentLang) {
        document.querySelectorAll('a[href]').forEach(function (link) {
            var href = link.getAttribute('href');

            if (!href || href.charAt(0) !== '/' || link.hasAttribute('data-set-lang')) return;

            var url = new URL(href, window.location.origin);
            url.searchParams.set('lang', currentLang);
            link.setAttribute('href', url.pathname + url.search + url.hash);
        });
    }

    /* --------------------------------------------------- announcement bar */
    // Now <falak-announcement> (platform component): dashboard declarations,
    // the customizer text, the welcome fallback, marquee and per-text
    // dismissal all live there. Nothing for the theme to do.

    /* -------------------------------------------- video embed normalizer */
    // Merchants paste whatever YouTube/Vimeo link they have, but only the
    // /embed/ and player.vimeo.com forms may load inside an iframe (watch
    // pages send X-Frame-Options and show a grey refused-to-connect box).
    // Rewrite the common share forms to the embeddable ones.

    function embedUrlFor(raw) {
        var url;

        try { url = new URL(raw, window.location.origin); } catch (e) { return null; }

        var host = url.hostname.replace(/^(www|m)\./, '');

        if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
            if (url.pathname.indexOf('/embed/') === 0) return null; // already fine

            var id = url.searchParams.get('v');
            if (!id && /^\/(shorts|live)\//.test(url.pathname)) id = url.pathname.split('/')[2];

            return id ? 'https://www.youtube.com/embed/' + id : null;
        }

        if (host === 'youtu.be') {
            var short = url.pathname.slice(1).split('/')[0];
            return short ? 'https://www.youtube.com/embed/' + short : null;
        }

        if (host === 'vimeo.com') {
            var vid = url.pathname.slice(1).split('/')[0];
            return /^\d+$/.test(vid) ? 'https://player.vimeo.com/video/' + vid : null;
        }

        return null;
    }

    document.querySelectorAll('.video-embed iframe').forEach(function (frame) {
        var fixed = embedUrlFor(frame.getAttribute('src') || '');
        if (fixed) frame.src = fixed;
    });

    /* ------------------------------------------------------- add to cart */
    /*
        Adding is <falak-add-product-button>'s job now: it reads the quantity
        stepper, performs the add for a guest or a customer, and reports back.
        What is left for the theme is the visible side — a toast for the SDK's
        notify() (silent until a theme claims it) and the header badge.
    */

    function showToast(message, type) {
        var host = document.querySelector('[data-toasts]');
        if (!host) {
            host = document.createElement('div');
            host.className = 'toasts';
            host.setAttribute('data-toasts', '');
            host.setAttribute('aria-live', 'polite');
            document.body.appendChild(host);
        }
        var el = document.createElement('div');
        el.className = 'toast toast--' + (type || 'info');
        el.setAttribute('role', type === 'error' ? 'alert' : 'status');
        el.textContent = message;
        host.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('is-in'); });
        window.setTimeout(function () {
            el.classList.remove('is-in');
            window.setTimeout(function () { el.remove(); }, 300);
        }, type === 'error' ? 4500 : 2800);
    }

    // A <falak-notifications> on the page renders its own toast stack off
    // the same falak.notify calls (it listens on the bus, not this handler
    // slot) — leaving this registered too would show every message twice.
    if (window.falak && !document.querySelector('falak-notifications')) {
        window.falak.notify.setNotifier(function (message, type) { showToast(message, type); });
    }

    /* --------------------------------------------------------- cart page */
    /*
        The page is server-rendered; each control asks the SDK for the change
        and reloads so the server draws the new state — one source of truth,
        no client-side templating. The header's <falak-cart-summary> follows
        the SDK on its own.
    */

    var cartPage = document.querySelector('[data-cart-page]');

    if (cartPage && window.falak) {
        var cartBusy = false;

        function lineOf(el) {
            var line = el.closest('[data-cart-line]');
            if (!line) return null;
            return {
                productId: line.getAttribute('data-product-id'),
                variationId: line.getAttribute('data-variation-id') || null,
                quantity: parseInt(line.querySelector('[data-cart-qty-value]').textContent, 10) || 1
            };
        }

        function runCart(action) {
            if (cartBusy) return;
            cartBusy = true;
            cartPage.classList.add('is-busy');
            action().then(function () {
                window.location.reload();
            }).catch(function (error) {
                cartBusy = false;
                cartPage.classList.remove('is-busy');
                showToast((error && error.message) || window.falak.lang.get('common.load_failed'), 'error');
            });
        }

        cartPage.addEventListener('click', function (event) {
            var step = event.target.closest('[data-cart-qty]');
            if (step) {
                var line = lineOf(step);
                if (!line) return;
                var next = line.quantity + (step.getAttribute('data-cart-qty') === 'up' ? 1 : -1);
                runCart(function () {
                    return next < 1
                        ? window.falak.cart.remove(line.productId, { variationId: line.variationId })
                        : window.falak.cart.update(line.productId, next, { variationId: line.variationId });
                });
                return;
            }

            var remove = event.target.closest('[data-cart-remove]');
            if (remove) {
                var target = lineOf(remove);
                if (!target) return;
                runCart(function () { return window.falak.cart.remove(target.productId, { variationId: target.variationId }); });
                return;
            }
        });

        // The coupon control is <falak-cart-coupons>; it applies and removes on
        // its own and shows its own error. The page only needs new totals.
        window.falak.event.on('cart::coupon.applied', function () { window.location.reload(); });
        window.falak.event.on('cart::coupon.removed', function () { window.location.reload(); });
    }

    /*
        Components announce on the bus as well as the DOM. Subscribing here is
        how the theme reacts to a component without either side holding a
        reference to the other — the same decoupling the platform relies on.
    */
    if (window.falak) {
        window.falak.event.on('product::quantity.changed', function (payload) {
            window.falak.log('quantity changed', payload);
        });
    }

    /* --------------------------------------------- variant price display */
    // <falak-product-options> announces the chosen variant; the page shows
    // its price where the product's price was.

    if (window.falak) {
        window.falak.event.on('product::options.changed', function (payload) {
            var el = document.querySelector('[data-product-price]');
            if (!el || !payload) return;
            if (!el.dataset.basePrice) el.dataset.basePrice = el.innerHTML;

            if (payload.price === null || payload.price === undefined) {
                el.innerHTML = el.dataset.basePrice;
                return;
            }

            var html = window.falak.money(payload.price);
            if (payload.comparePrice) html += ' <del>' + window.falak.money(payload.comparePrice) + '</del>';
            el.innerHTML = html;
        });
    }

    /* -------------------------------------------------- product gallery */

    document.addEventListener('click', function (event) {
        var thumb = event.target.closest('[data-gallery-thumb]');
        if (!thumb) return;

        var main = document.querySelector('[data-gallery-main]');
        if (!main) return;

        main.src = thumb.getAttribute('data-gallery-thumb');

        var thumbImg = thumb.querySelector('img');
        if (thumbImg && thumbImg.alt) main.alt = thumbImg.alt;

        document.querySelectorAll('[data-gallery-thumb]').forEach(function (el) {
            el.classList.toggle('is-active', el === thumb);
        });
    });

    /* -------------------------------------------- product description clamp */
    // The clamp height itself is CSS (--description-lines); this only measures
    // it so the open/close can animate, and only switches the clamp on when the
    // copy really is taller than the preview — a two-line description keeps its
    // old look, button and all absent. Nothing here hides text until it has
    // rendered, so with this file missing the description simply stays open.

    var descWrap = document.querySelector('[data-description]');
    var descBody = descWrap && descWrap.querySelector('[data-description-body]');
    var descToggle = descWrap && descWrap.querySelector('[data-description-toggle]');

    if (descBody && descToggle) {
        var descLabel = descToggle.querySelector('[data-description-label]');
        var descCollapsed = 0;

        function descMeasure() {
            // Drop the inline height so CSS decides the clamp, then read it back.
            descBody.style.maxHeight = '';
            descWrap.classList.add('is-clampable');
            descCollapsed = descBody.clientHeight;

            var overflows = descBody.scrollHeight > descCollapsed + 8;

            descWrap.classList.toggle('is-clampable', overflows);
            descToggle.hidden = !overflows;

            if (!overflows) {
                descWrap.classList.remove('is-open');
                descToggle.setAttribute('aria-expanded', 'false');
                return;
            }

            descSetHeight(descWrap.classList.contains('is-open'));
        }

        function descSetHeight(open) {
            descBody.style.maxHeight = open ? descBody.scrollHeight + 'px'
                                            : descCollapsed + 'px';
        }

        // Collapsing from far down the page would otherwise leave the reader
        // staring at whatever followed; bring the description back under the
        // sticky header instead.
        function descKeepInView() {
            var rect = descWrap.getBoundingClientRect();
            var header = document.querySelector('.site-header');
            var offset = header ? header.getBoundingClientRect().height : 0;

            if (rect.top >= offset) return;
            window.scrollTo({ top: window.pageYOffset + rect.top - offset - 16, behavior: 'smooth' });
        }

        descToggle.addEventListener('click', function () {
            var open = !descWrap.classList.contains('is-open');

            // Animate out of the pixel height it currently has, not out of `none`.
            descBody.style.maxHeight = descBody.scrollHeight + 'px';

            descWrap.classList.toggle('is-open', open);
            descToggle.setAttribute('aria-expanded', open ? 'true' : 'false');

            if (descLabel) {
                descLabel.textContent = descToggle.getAttribute(open ? 'data-label-less' : 'data-label-more')
                    || descLabel.textContent;
            }

            // A frame between the two heights, or the browser sees one value.
            requestAnimationFrame(function () { descSetHeight(open); });

            if (!open) descKeepInView();
        });

        // Once open, hand the height back to the content so a resize, a late
        // font or an image inside the copy can't leave it cut off.
        descBody.addEventListener('transitionend', function (event) {
            if (event.propertyName !== 'max-height') return;
            if (descWrap.classList.contains('is-open')) descBody.style.maxHeight = 'none';
        });

        var descResize;

        window.addEventListener('resize', function () {
            clearTimeout(descResize);
            descResize = setTimeout(descMeasure, 150);
        });

        // Images in the description land after this runs and change the height.
        window.addEventListener('load', descMeasure);

        descMeasure();
    }

    /* ------------------------------------------------------ price filter */
    // <falak-price-range> only picks a range and emits it; reloading the
    // listing with it applied is the theme's job. Query-string only, so it
    // composes with every other filter, the category included — a category
    // page is this same URL with category_id[] on it.

    /* ------------------------------------------------ listing: sort + filters drawer */

    // <falak-filters> reloads with the selection itself; the sort select and
    // the phone-width drawer are the only listing glue left to the theme.
    var sort = document.querySelector('[data-sort]');

    if (sort) {
        sort.addEventListener('change', function () {
            var url = new URL(window.location.href);

            if (sort.value === 'newest') url.searchParams.delete('sort');
            else url.searchParams.set('sort', sort.value);

            url.searchParams.delete('page');
            window.location.href = url.toString();
        });
    }

    var panel = document.querySelector('[data-filters-panel]');
    var filtersBackdrop = document.querySelector('[data-filters-backdrop]');

    function setFilters(open) {
        if (!panel) return;
        panel.classList.toggle('is-open', open);
        document.body.classList.toggle('filters-are-open', open);
        if (filtersBackdrop) filtersBackdrop.hidden = !open;
    }

    document.querySelectorAll('[data-filters-open]').forEach(function (button) {
        button.addEventListener('click', function () { setFilters(true); });
    });
    document.querySelectorAll('[data-filters-close]').forEach(function (button) {
        button.addEventListener('click', function () { setFilters(false); });
    });
    if (filtersBackdrop) filtersBackdrop.addEventListener('click', function () { setFilters(false); });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') setFilters(false);
    });
})();

/*
    All-categories band.

    The tiles are the store's own categories, so nothing about them is typed
    into the theme: the payload carries `image_url` — already resolved
    server-side, unlike the bare `image` path beside it — and `description`,
    which is the line under each name.

    Fetched rather than rendered in Twig: a home block gets no page data, the
    sandbox exposes no categories function, and there is no categories
    component in the SDK. Ported from Nova's wireCategoryGrid.

    Lives in app.js rather than home.js because the block is placeable on
    merchant pages too, and home.js only loads on the home page.
*/
(function () {
    'use strict';

    var section = document.querySelector('[data-category-grid]');
    if (!section || !window.falak) return;

    var list = section.querySelector('[data-category-grid-list]');
    var limit = Number(section.getAttribute('data-limit') || 12);
    var withText = section.getAttribute('data-text') !== '0';

    window.falak.onReady(function () {
        window.falak.api.withoutNotifier(function () {
            return window.falak.api.request('categories');
        }).then(function (response) {
            var rows = Array.isArray(response) ? response : (response && response.data) || [];

            /* Only categories a shopper can actually land on, in the order the
               merchant arranged them in the catalogue. */
            var categories = rows
                .filter(function (c) { return c && c.id && (c.status === undefined || c.status === 'active'); })
                .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
                .slice(0, limit);

            /* Left hidden: a titled band with an empty space under it reads as
               broken, and an empty catalogue is the normal state of a new store. */
            if (!categories.length) return;

            categories.forEach(function (category) {
                var tile = document.createElement('a');
                tile.className = 'cat-tile';
                tile.href = window.falak.url.category(category.id);

                var figure = document.createElement('span');
                figure.className = 'cat-tile__figure';

                /* A category with no picture keeps the tinted disc rather than
                   showing a broken img. */
                if (category.image_url) {
                    var img = document.createElement('img');
                    img.className = 'cat-tile__image';
                    img.src = category.image_url;
                    img.alt = '';
                    img.loading = 'lazy';
                    figure.appendChild(img);
                }

                var name = document.createElement('b');
                name.className = 'cat-tile__name';
                name.textContent = category.name || '';

                tile.appendChild(figure);
                tile.appendChild(name);

                if (withText && category.description) {
                    var text = document.createElement('small');
                    text.className = 'cat-tile__text';
                    text.textContent = category.description;
                    tile.appendChild(text);
                }

                list.appendChild(tile);
            });

            section.removeAttribute('hidden');
        }).catch(function (e) {
            window.falak.logger.warn('categories band: fetch failed', e);
        });
    });
})();

/*
 * Video commerce.
 *
 * The clips are not theme settings: the dashboard flags a product for video
 * commerce and its clip is uploaded against the product, so this asks
 * /storefront/videoCommerceProducts for exactly those and builds the row.
 *
 * The cards are the SDK's own <falak-product-card>, the same element the
 * listing and the home rows use. It renders a clip only when it is asked to,
 * and the section's [data-video-commerce] attribute is that ask — which is why
 * flagging a product changes nothing about how it looks anywhere else.
 */
(function () {
    'use strict';

    function init() {
        document.querySelectorAll('[data-video-commerce]').forEach(wireSection);
    }

    /* How many times the section asks again before it gives up, and how long it
       waits between tries. Three attempts over ~3s covers the case this is for
       — one request lost to a saturated connection pool — without a section
       that hammers a genuinely broken endpoint. */
    var ATTEMPTS = 3;
    var BACKOFF_MS = 900;

    function wireSection(section) {
        var grid = section.querySelector('[data-video-commerce-grid]');
        if (!grid || !window.falak) return;

        /* A merchant setting reaches this as a string and can arrive empty or
           malformed; Number('') is 0 and Number('x') is NaN, and both make
           slice() return nothing — a section that renders, clears its skeletons
           and then shows an empty grid. Anything not a positive number falls
           back to the schema's own default. */
        var limit = Math.floor(Number(section.getAttribute('data-limit')));
        if (!(limit > 0)) limit = 4;

        var badge = section.getAttribute('data-badge') || '';
        var playback = section.getAttribute('data-playback') || 'hover';
        var actions = section.getAttribute('data-actions') !== '0';

        function fill(products) {
            /* The skeletons go the moment there is something real to put in
               their place — not before, or the grid collapses to zero height
               for a frame. */
            grid.innerHTML = '';

            var shown = products.slice(0, limit);

            /*
             * More products than there are columns: ONE row that scrolls,
             * rather than a second row underneath. The attribute is what the
             * stylesheet keys the scroller on; large screens only, since the
             * phone grid stays as it is and scrolling there belongs to the
             * viewer, which opens as a reel.
             */
            var columns = parseInt(grid.style.getPropertyValue('--vp-columns'), 10);
            if (!(columns > 0)) columns = 4;

            grid.toggleAttribute('data-scroll-rail', shown.length > columns);

            shown.forEach(function (product) {
                var card = document.createElement('falak-product-card');

                /* Handed as a property, the way the SDK's own list does it:
                   a product name containing a quote would otherwise need
                   two rounds of escaping. */
                card._product = product;
                card.setAttribute('product-id', product.id);
                card.setAttribute('source', 'home.video-products');
                card.setAttribute('playback', playback);

                if (badge) card.setAttribute('video-badge', badge);

                if (actions) {
                    card.setAttribute('show-add-button', '');
                    card.setAttribute('show-wishlist', '');
                }

                grid.appendChild(card);
            });
        }

        /*
         * One attempt, and the decision about what a failure MEANS.
         *
         * This used to hide the section on any rejection at all, which is what
         * made the feature come and go: the home page opens several <video>
         * elements before this request is issued, they hold the browser's
         * per-host connections while they buffer, and this GET was left stalled
         * behind them. Lose that request once, to a timeout or a dropped
         * connection, and the whole section disappeared for the rest of the
         * page view with nothing in the console to say why.
         *
         *   the server ANSWERED (error.falak.status) — 404 means this store has
         *   video commerce switched off, anything else means the endpoint is
         *   broken. Asking again changes neither, so the section goes.
         *
         *   no answer at all (a timeout, an abort, a dropped connection) — that
         *   says nothing about the store, so it is worth asking again.
         */
        function load(attempt) {
            window.falak.api.withoutNotifier(function () {
                /* The section asks for what it intends to show, so a store
                   that merchandises a hundred products on video does not ship
                   all hundred to draw a row of four. The endpoint caps it
                   again on its own side. */
                return window.falak.api.request('videoCommerceProducts', { params: { limit: limit } });
            }).then(function (response) {
                var products = (response && response.data) ? response.data : response;

                if (!Array.isArray(products) || !products.length) {
                    section.setAttribute('hidden', '');
                    return;
                }

                fill(products);
            }).catch(function (error) {
                var answered = !!(error && error.falak && error.falak.status);

                if (!answered && attempt < ATTEMPTS) {
                    /* The skeletons stay up in the meantime, which is honest:
                       this is still loading, and the shopper sees the section
                       hold its height rather than vanish and reflow the page
                       under their thumb. */
                    window.setTimeout(function () { load(attempt + 1); }, attempt * BACKOFF_MS);
                    return;
                }

                section.setAttribute('hidden', '');
            });
        }

        window.falak.onReady(function () {
            /* Revealed NOW, carrying its skeletons, rather than after the
               fetch: a section that appears late shoves everything below it
               down just as the shopper starts reading. */
            section.removeAttribute('hidden');

            load(1);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/*
 * <custom-falak-video-view> — the video-commerce wall's own quick view.
 *
 * The wall's cards are a clip each, and opening one in the theme's ordinary
 * quick view (a square photo panel beside a buy box) threw away the only thing
 * the shopper had actually been looking at: the video shrank into half a dialog
 * and stopped being the subject. This is the viewer that section deserves — the
 * clip full-bleed, with the name, the price, the variant picker and the add laid
 * over its foot, the way a product reel reads everywhere else.
 *
 * It is DELIBERATELY not a second skin for <custom-falak-quick-view>. That
 * dialog is right for every other card in the theme — a photograph is a poor
 * thing to run edge to edge, and the gallery arrows, the share sheet, the
 * category line and the reviews link all belong to it. Two components, each
 * shaped by the card that opens it, rather than one that has to be told which of
 * two layouts to draw.
 *
 * WHAT IS THE LIBRARY'S, and is not reimplemented here:
 *
 *   falak-modal                 the dialog itself — focus, scroll lock, escape
 *   falak-product-options       the variant picker, availability per value
 *   falak-add-product-button    the add — it calls the cart API itself
 *   falak-product-availability  "notify me", shown only while sold out
 *
 * Driven either by a trigger in the wall —
 *
 *     <a href="/product/12" data-video-view="12">
 *
 * — where the enclosing [data-vp-card] is asked for the record it already
 * holds, so the clip is on screen in the same frame as the click; or from the
 * bus, for anything that holds no element:
 *
 *     falak.event.dispatch('video-view::open', { id: 12 })
 */
(function () {
    'use strict';

    if (window.customElements && customElements.get('custom-falak-video-view')) return;

    class CustomFalakVideoView extends HTMLElement {

        /*
         * One element serves the whole page, created the first time something
         * asks for it. Each open builds a FRESH <falak-modal>, because the
         * modal snapshots its content on first render and re-renders from that
         * snapshot — the same arrangement <custom-falak-quick-view> uses.
         */
        static open(seed) {
            let host = document.querySelector('custom-falak-video-view');

            if (!host) {
                host = document.createElement('custom-falak-video-view');
                document.body.appendChild(host);
            }

            return host.open(seed);
        }

        /**
         * @param {{ id: number|string, product?: object, products?: object[] }} seed
         *   `product` is the record the card already fetched. With it the
         *   dialog is complete on the first frame and never calls the API;
         *   without it — a bus dispatch carrying only an id — the record is
         *   fetched and the clip appears a round trip later.
         *
         *   `products` is the WHOLE wall, in the order it is on screen. The
         *   dialog becomes a reel of them all, opened at the one that was
         *   clicked: on a phone that is a vertical swipe from clip to clip, the
         *   way every product reel behaves, and a shopper who came to browse
         *   video never has to close the dialog to see the next one. Left out,
         *   the reel is one slide long and the dialog is exactly what it was.
         */
        async open(seed) {
            const falak = window.falak;
            if (!falak) return null;

            const s = seed || {};
            const id = s.id !== undefined ? s.id : s.productId;
            if (!id) return null;

            /* A second open while one is on screen replaces it rather than
               stacking two dialogs for two different products. */
            if (this._modal) this._modal.remove();

            /* BEFORE the dialog's own <video> exists, so it is not queued
               behind the clips this releases. */
            if (!this._held) this._held = this.quieten();

            const modal = document.createElement('falak-modal');
            modal.className = 'f-video-view';
            /* A portrait panel, so the narrowest width the library offers is
               the right starting point — the stylesheet then sizes it off the
               viewport height to hold 9:16 exactly. `sm` is what it falls back
               to if that rule ever goes missing. */
            modal.setAttribute('width', 'sm');
            modal.setAttribute('no-padding', '');
            modal.setAttribute('aria-label', falak.lang.get('product.quick_view'));

            const known = s.product && s.product.id !== undefined ? s.product : null;

            /*
             * The reel, and where in it to open.
             *
             * `products` is the whole wall when the trigger could reach it. The
             * clicked product is found by id rather than trusted by position,
             * because the wall may be capped by the merchant's `limit` while
             * the list handed over is not, and opening on the wrong clip is
             * worse than opening on a shorter reel.
             */
            const list = Array.isArray(s.products) && s.products.length
                ? s.products
                : (known ? [known] : []);

            const at = Math.max(0, list.findIndex(item => String(item && item.id) === String(id)));

            /* The records in hand are painted immediately; with none the dialog
               opens on its own spinner rather than on nothing, because the clip
               is the reason the shopper clicked. */
            modal.innerHTML = '<div class="vv" data-vv-root>'
                + (list.length ? this.body(list.map(item => this.read(item)), at) : this.spinner())
                + '</div>';

            this.appendChild(modal);
            this._modal = modal;
            this.dropOnClose(modal);

            // Let the modal render before opening so its transition plays.
            await Promise.resolve();
            modal.open();

            if (list.length) {
                this.wire(modal);
                falak.event.dispatch('video-view::opened', { productId: id });
                return modal;
            }

            const product = await this.load(id);

            /* Closed, or replaced by another product, while the request was in
               flight — painting now would either resurrect a dead dialog or
               overwrite the newer one. */
            if (this._modal !== modal || !modal.isConnected) return modal;

            const root = modal.querySelector('[data-vv-root]');
            if (root) root.innerHTML = this.body([this.read(product, { id: id })], 0);

            this.wire(modal);
            falak.event.dispatch('video-view::opened', { productId: id });

            return modal;
        }

        close() {
            if (this._modal) this._modal.close();
        }

        /*
         * The product record, memoised for the life of the page — the same
         * cache discipline the quick view uses, for the same reason: a shopper
         * stepping through a wall of four clips opens and reopens these, and
         * the record does not change between two of those clicks.
         */
        async load(id) {
            this._records = this._records || {};
            if (this._records[id]) return this._records[id];

            const falak = window.falak;

            try {
                const response = await falak.api.withoutNotifier(() => falak.product.show(id));
                const product = (response && response.data) ? response.data : response;

                if (product) this._records[id] = product;

                return product;
            } catch (error) {
                falak.logger.warn('custom-falak-video-view: fetch failed', error);
                return null;
            }
        }

        /*
         * The API's raw row, which is the only shape that ever reaches here:
         * both the wall's own endpoint and product.show return the model. The
         * quick view carries a second branch for the server's mapProduct shape
         * because server-rendered cards open that one; nothing server-rendered
         * opens this.
         */
        read(raw, seed) {
            const falak = window.falak;
            const locale = falak.lang.locale;
            const p = raw || {};
            const s = seed || {};

            const list = Number(p.price_cents || 0);
            const discount = Number(p.discount_price_cents || 0);
            const onSale = discount > 0 && discount < list;

            const variations = Array.isArray(p.variations) ? p.variations : [];
            /* The merchant's display config for those variations — order,
               labels, swatch colours, and which groups are drawn as a <select>
               rather than as pills. Without it the picker falls back to plain
               pills derived from the variation attributes, which is why the
               wall's endpoint eager-loads `options.values`. */
            const options = Array.isArray(p.options) ? p.options : [];
            const backorders = !!p.allow_backorders;

            /* A variant product is in stock while ANY variant is — the same
               rule the server's productInStock() applies.

               A null (or absent) quantity is UNLIMITED, not zero: a store that
               does not count stock sends no number at all, and reading that as
               "none left" put "Out of stock" on its whole catalogue. */
            const inStock = backorders || (variations.length
                ? variations.some(v => v.quantity === null || v.quantity === undefined || Number(v.quantity) > 0)
                : (p.quantity === null || p.quantity === undefined || Number(p.quantity) > 0));

            const images = (Array.isArray(p.images) ? p.images : [])
                .map(img => this.media(typeof img === 'string' ? img : (img.url || img.image_path)))
                .filter(Boolean);

            const id = p.id !== undefined ? p.id : s.id;

            return {
                id: id,
                name: ((locale === 'ar' && p.name_ar ? p.name_ar : p.name) || s.name || ''),
                url: falak.url.product(id),
                video: this.media(p.video_url || p.video_path),
                /* The platform stores a poster beside the clip. It is what the
                   dialog paints while the file is still arriving, so the
                   opening frame is the product rather than black. */
                /*
                 * The PATH first, not the absolute URL — the same order the
                 * card uses.
                 *
                 * `video_thumbnail_url` is the model's accessor and points at
                 * the CENTRAL domain; media() turns the bare path into a
                 * storefront-relative `/storage/…`. Preferring the URL here
                 * meant the viewer asked for the very picture the card was
                 * already showing under a different origin — so the browser
                 * could not reuse the copy it held, and the fetch went to the
                 * host that is simultaneously streaming the megabyte clips.
                 * The poster arrived after the clip, which is to say never.
                 */
                poster: this.media(p.video_thumbnail_path || p.video_thumbnail_url) || images[0] || null,
                /* A video-commerce product with no clip is a merchant mistake,
                   not a case to refuse: the first photograph stands in and the
                   dialog is still a way to buy. */
                image: images[0] || null,
                price: onSale ? discount : list,
                compareAt: onSale ? list : null,
                variations: variations,
                options: options,
                inStock: inStock,
                /* The record never arrived — everything below the name would be
                   a guess, so the dialog says so and offers the page instead. */
                partial: !raw,
            };
        }

        /* ----------------------------------------------------------- markup */

        spinner() {
            return '<div class="vv__stage vv__stage--empty">'
                + '<span class="vv__spinner" role="status" aria-live="polite"'
                    + ' aria-label="' + this.escape(this.trans('common.loading')) + '"></span>'
                + '</div>';
        }

        /*
         * The reel: one slide per product, the clicked one active.
         *
         * The same markup serves both shapes and the stylesheet decides. On a
         * phone the slides are a vertical scroll-snap column and the shopper
         * swipes from clip to clip; on a larger screen only the active slide is
         * drawn and the dialog is the single panel it has always been, because
         * a full-height snap column is a phone gesture and a mouse has the wall
         * behind it to go back to.
         *
         * The speaker lives OUTSIDE the reel: it is one control for whatever is
         * playing, not one per slide, so it does not scroll away mid-swipe.
         */
        body(list, at) {
            const t = key => this.trans(key);
            const active = Math.max(0, Math.min(at || 0, list.length - 1));

            /* The clip a slide shows is only fetched when it is the one being
               watched (see wireReel), so a reel of twelve costs one download,
               not twelve. */
            const slides = list.map((p, index) => this.slide(p, index, index === active)).join('');

            return ''
                + '<div class="vv__reel" data-vv-reel data-active="' + active + '">' + slides + '</div>'
                + '<button type="button" class="vv__chip vv__chip--sound" data-vv-sound'
                    + ' aria-pressed="false"'
                    + ' aria-label="' + this.escape(t('videos.toggle_sound')) + '"'
                    + (list.some(p => p.video) ? '' : ' hidden') + '>'
                    + this.soundGlyph(true)
                + '</button>';
        }

        slide(p, index, isActive) {
            const falak = window.falak;
            const t = key => this.trans(key);

            const open = '<section class="vv__slide' + (isActive ? ' is-active' : '') + '"'
                + ' data-vv-slide data-index="' + index + '"'
                + ' data-product-id="' + this.escape(p.id) + '">';

            if (p.partial) {
                return open + '<div class="vv__failed">'
                    + '<p>' + this.escape(t('product.quick_view_failed')) + '</p>'
                    + '<a class="btn btn--primary" href="' + this.escape(p.url) + '">'
                        + this.escape(t('product.full_details'))
                    + '</a>'
                + '</div></section>';
            }

            /*
             * Muted, and nothing else is possible: a browser refuses to start a
             * clip with sound from a click it did not itself treat as a play
             * gesture, and the refusal is silent — the dialog would open on a
             * frozen frame. The speaker in the corner is how the shopper asks
             * for audio, and that click IS a gesture the browser accepts.
             */
            /*
             * The poster is a real <img> UNDERNEATH the clip, not the <video>'s
             * own poster attribute.
             *
             * A <video> paints its poster only while it has selected no
             * resource at all. Give it a `src` and, from the first byte, it
             * paints NOTHING until it has a decodable frame — verified here
             * side by side: the same element with the same poster shows the
             * picture without a src and a blank rectangle with one. So every
             * viewer opened on a clip that had to be fetched was a black
             * screen, poster or not, for as long as the fetch took.
             *
             * An <img> has no such rule. It is a few tens of kilobytes, it
             * arrives long before the clip, and the clip is transparent until
             * it has frames — so the product is on screen from the first moment
             * and the video simply takes over the same box when it is ready.
             *
             * The attribute stays on the <video> as well: it costs nothing (the
             * same URL, already cached) and keeps the clip's own poster correct
             * for anything that reads the element on its own terms.
             */
            /*
             * The poster's URL rides on data-vv-poster and is attached with
             * the clip, near the active slide only (see settle).
             *
             * A reel is the whole wall, which for some stores is dozens of
             * products. Sixty posters fetched the moment the dialog opened —
             * at fetchpriority="high", competing with the one clip that is
             * actually playing — is the same starvation the cards were fixed
             * for, moved inside the dialog. Near the active slide the priority
             * is still high, because there the picture IS what the shopper is
             * waiting on.
             */
            const poster = p.poster
                ? '<img class="vv__poster" data-vv-poster="' + this.escape(p.poster) + '"'
                    + ' fetchpriority="high" alt="" aria-hidden="true">'
                : '';

            /*
             * The clip's URL rides on data-vv-src, and only the slide being
             * watched is given a real `src` (wireReel does that).
             *
             * These files are megabytes each. A reel that put the source on
             * every slide would start the whole wall downloading the moment the
             * dialog opened — the exact starvation the cards were fixed for,
             * moved inside the dialog. The active slide and its immediate
             * neighbours are enough: by the time a swipe lands, the next one
             * has had a head start.
             */
            const stage = p.video
                ? poster
                    + '<video class="vv__video" data-vv-video muted loop playsinline'
                    + ' preload="auto"'
                    + ' data-vv-src="' + this.escape(p.video) + '"'
                    + (p.poster ? ' poster="' + this.escape(p.poster) + '"' : '')
                    + '></video>'
                : p.image
                    ? '<img class="vv__poster" src="' + this.escape(p.image) + '" alt="' + this.escape(p.name) + '">'
                    : '<span class="vv__placeholder" aria-hidden="true"></span>';

            /* Server values, not `fetch`: the variations travelled with the
               record the wall already paid for, so the picker is drawn in the
               same frame as the clip instead of popping in under it and
               shoving the add button down. */
            const options = p.variations.length
                ? '<div class="vv__panel">'
                    + '<falak-product-options class="vv__options" data-vv-options'
                        + ' product-id="' + this.escape(p.id) + '"'
                        + (p.options.length
                            ? ' options="' + this.escape(JSON.stringify(p.options)) + '"'
                            : '')
                        + ' variations="' + this.escape(JSON.stringify(p.variations)) + '"></falak-product-options>'
                + '</div>'
                : '';

            return open
                /*
                 * `data-loading` is set in the MARKUP, not by the first media
                 * event, so the spinner is already on screen in the frame the
                 * dialog opens. A clip is several megabytes over whatever
                 * connection the shopper happens to have, and until it has
                 * buffered the panel is a still poster that is indistinguishable
                 * from a video that has quietly failed — the report was "it
                 * sometimes plays and sometimes doesn't", which is what a slow
                 * network looks like when nothing says so.
                 */
                + '<div class="vv__stage"' + (p.video ? ' data-vv-stage data-loading' : '') + '>'
                    + stage
                    + (p.video
                        ? '<span class="vv__loader" role="status" aria-live="polite"'
                                + ' aria-label="' + this.escape(t('common.loading')) + '"></span>'
                            /*
                             * The "it did not arrive" panel, rendered up front
                             * and shown by CSS only once the root is marked
                             * failed. Nothing about the dialog is torn down to
                             * reach this state, which is what makes the retry
                             * below a one-line reset rather than a rebuild.
                             */
                            + '<div class="vv__lost" role="status">'
                                + '<p class="vv__lost-text">' + this.escape(t('videos.failed')) + '</p>'
                                + '<button type="button" class="btn btn--outline vv__lost-retry" data-vv-retry>'
                                    + this.escape(t('common.retry'))
                                + '</button>'
                            + '</div>'
                        : '')
                    + '<span class="vv__scrim" aria-hidden="true"></span>'
                + '</div>'

                /* No close button of its own, and no speaker either. The modal
                   renders the ×, dismisses on it and on Escape and returns
                   focus; body() renders ONE speaker for the whole reel, above
                   the slides, so it does not scroll away mid-swipe and there is
                   never a second one arguing about the same audio. */

                + '<div class="vv__foot">'
                    + '<a class="vv__name" href="' + this.escape(p.url) + '">' + this.escape(p.name) + '</a>'

                    + '<p class="vv__price">'
                        + '<span class="vv__amount">' + this.escape(falak.money(p.price)) + '</span>'
                        + (p.compareAt
                            ? '<del class="vv__was">' + this.escape(falak.money(p.compareAt)) + '</del>'
                            : '')
                    + '</p>'

                    /* A form, so <falak-add-product-button> resolves its picker
                       INSIDE the dialog. The selector is scoped to the nearest
                       form first and only then page-wide, which is what keeps a
                       viewer opened over a product page off that page's own
                       picker. */
                    + '<form class="vv__buy" data-vv-form>'
                        + options
                        + '<falak-add-product-button class="vv__add"'
                            + ' product-id="' + this.escape(p.id) + '"'
                            + ' product-status="' + (p.inStock ? 'sale' : 'out') + '"'
                            + (p.variations.length ? ' options-selector="[data-vv-options]"' : '')
                            + ' source="video-view"'
                            + ' button-class="btn btn--primary vv__add-btn">'
                            + this.escape(t('product.add_to_cart'))
                        + '</falak-add-product-button>'

                        /* Shows itself only while the product (or the chosen
                           variant) is sold out, so it needs no condition. */
                        + '<falak-product-availability class="vv__notify"'
                            + ' product-id="' + this.escape(p.id) + '"'
                            + ' product-status="' + (p.inStock ? 'sale' : 'out') + '"'
                            + ' button-class="btn btn--outline"></falak-product-availability>'
                    + '</form>'
                + '</div>'
            + '</section>';
        }

        /* ------------------------------------------------- the wall's clips */

        /*
         * The wall lets go of its clips while the viewer is up.
         *
         * A browser serves media from a SMALL pool of loaders, and the wall
         * holds one per card — EIGHT of them on a home page where the merchant
         * placed the block twice, each pulling the same few-megabyte file. The
         * dialog's clip joined the back of that queue and often never reached
         * the front: the viewer opened on its poster and simply never started,
         * with no error to show for it.
         *
         * Pausing is not enough. A card that is still FETCHING holds its slot
         * whether or not it is playing, and only dropping the source abandons
         * the request.
         *
         * The cards are behind a full-screen dialog and nobody can see them,
         * and revive() puts every one back the moment it closes.
         */
        quieten() {
            const held = [];

            document.querySelectorAll('[data-video-commerce] video').forEach((video) => {
                const src = video.getAttribute('src');
                if (!src) return;

                video.pause();
                /* removeAttribute alone leaves the request in flight; it is
                   load() on a source-less element that abandons it. */
                video.removeAttribute('src');
                video.load();

                held.push({ video: video, src: src });
            });

            return held;
        }

        /* Put back only what quieten() took, and only where the card is still
           in the document — the wall re-renders its cards on a breakpoint
           change, and writing a src onto an orphan resurrects nothing while
           still costing a download. */
        revive(held) {
            (held || []).forEach((entry) => {
                if (!entry.video.isConnected || entry.video.hasAttribute('src')) return;

                entry.video.setAttribute('src', entry.src);
                entry.video.load();
            });
        }

        /* ----------------------------------------------------------- wiring */

        /*
         * EVERYTHING here is bound to the MODAL, never to a node inside it.
         *
         * <falak-modal> rebuilds its own innerHTML when it renders: the
         * overlay, the wrapper and the body are wrapped around a fresh copy of
         * the content it was handed. So every element this component built is
         * replaced by a clone, and a listener bound to the original is left on
         * a node that is no longer in the document — the speaker looked exactly
         * right and did nothing at all. The modal element itself survives that
         * rebuild, which is why it is the one that listens.
         */
        wire(modal) {
            this.wireReel(modal);
            this.wireLoader(modal);
            this.wireSound(modal);
            this.wireMediaFallback(modal);
            this.wireRetry(modal);
            this.closeOnAdd(modal);
        }

        /* The slide the shopper is on. Every other piece of wiring asks for it
           rather than querying the modal, because with a reel there are several
           of everything and only one of them is being watched. */
        current(modal) {
            return modal.querySelector('[data-vv-slide].is-active')
                || modal.querySelector('[data-vv-slide]');
        }

        /*
         * The reel.
         *
         * Scroll position is the state — no index to keep in step, no
         * transform to animate, and the browser does the snapping and the
         * momentum. An observer names whichever slide is mostly on screen; that
         * slide plays and loads, the rest are paused and silent.
         *
         * `scrollIntoView` with no behaviour (so, instantly) puts the clicked
         * product under the shopper before the dialog has finished opening.
         * Done on the next frame because the modal re-renders its content and a
         * scroll set before that is thrown away with the nodes it was set on.
         */
        wireReel(modal) {
            /*
             * NOTHING is captured up front.
             *
             * <falak-modal> rebuilds its own innerHTML when it renders, and
             * wire() runs before that has happened. A reel and a list of slides
             * read here are the pre-render nodes: detached a moment later, so
             * every offsetTop reads 0 and a scroll set on them goes nowhere —
             * the dialog opened on the first clip with the second one marked
             * active. Everything below re-queries the live tree instead.
             */
            const start = (tries) => {
                const reel = modal.querySelector('[data-vv-reel]');
                const slides = reel ? [...reel.querySelectorAll('[data-vv-slide]')] : [];

                /* Not rendered, or rendered but not yet laid out. Waiting for a
                   real height is more honest than guessing a frame count. */
                if (!reel || !slides.length || !reel.clientHeight) {
                    if ((tries || 0) < 40) window.requestAnimationFrame(() => start((tries || 0) + 1));
                    return;
                }

                const at = Math.max(0, Math.min(Number(reel.getAttribute('data-active') || 0), slides.length - 1));
                const target = slides[at];

                /* The observer must not read this jump as the shopper swiping:
                   mid-jump the first slide is briefly the most visible one, and
                   acting on that would land them back where they started. */
                this._settling = true;

                /* Offsets, not scrollIntoView: the slides share the dialog as
                   their offset parent, so the difference is exactly the scroll
                   distance and it cannot scroll an ancestor by mistake. */
                reel.scrollTop = target.offsetTop - slides[0].offsetTop;

                this.settle(modal, target);

                window.setTimeout(() => { this._settling = false; }, 300);

                /* One slide only: nothing to observe, and an observer on a reel
                   that cannot scroll would still fire and cost a frame. */
                if (slides.length < 2) return;

                this._reel = new IntersectionObserver((entries) => {
                    if (this._settling) return;

                    /* The most-visible entry wins. Mid-swipe two slides are
                       both partly on screen, and taking the first intersecting
                       one made the reel flicker between them. */
                    const best = entries
                        .filter(entry => entry.isIntersecting)
                        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

                    if (!best || best.target.classList.contains('is-active')) return;

                    slides.forEach(slide => slide.classList.toggle('is-active', slide === best.target));
                    reel.setAttribute('data-active', best.target.getAttribute('data-index'));
                    this.settle(modal, best.target);
                }, { root: reel, threshold: [0.25, 0.6, 0.9] });

                slides.forEach(slide => this._reel.observe(slide));
            };

            window.requestAnimationFrame(() => start(0));
        }

        /*
         * Make `active` the one that is playing, and the only one holding a
         * clip.
         *
         * The neighbours keep their source so a swipe either way starts on a
         * frame rather than on a spinner; everything further out gives its
         * source back, which is what stops a twelve-product reel from becoming
         * twelve simultaneous downloads. Sound follows the shopper: whatever
         * they chose on the last clip is what the next one plays at.
         */
        settle(modal, active) {
            if (!active) return;

            const reel = modal.querySelector('[data-vv-reel]');
            const slides = [...(reel ? reel.querySelectorAll('[data-vv-slide]') : [])];
            const index = slides.indexOf(active);
            const sound = modal.querySelector('[data-vv-sound]');
            const wanted = !!(sound && sound.getAttribute('aria-pressed') === 'true');

            /* Above the phone breakpoint the reel does not scroll — only the
               active slide is drawn — so there is no swipe to get a head start
               for, and preloading a neighbour would be a few megabytes fetched
               for something the shopper cannot reach. */
            const swipeable = !!reel && reel.scrollHeight > reel.clientHeight + 1;

            slides.forEach((slide, i) => {
                const near = slide === active || (swipeable && Math.abs(i - index) <= 1);

                /* The still first: it is tens of kilobytes against the clip's
                   megabytes, and it is what the shopper looks at while the clip
                   arrives. Once attached it stays — an image already decoded
                   costs nothing to keep, and dropping it would make swiping
                   back re-fetch a picture the browser still had. */
                const still = slide.querySelector('[data-vv-poster]');
                if (near && still && !still.getAttribute('src')) {
                    still.setAttribute('src', still.getAttribute('data-vv-poster'));
                }

                const video = slide.querySelector('[data-vv-video]');
                if (!video) return;

                const src = video.getAttribute('data-vv-src');

                if (near && src && !video.getAttribute('src')) {
                    video.setAttribute('src', src);
                    video.load();
                } else if (!near && video.getAttribute('src')) {
                    /* Released, not just paused: a paused element still holds
                       its buffer and its slot in the browser's media pool. */
                    video.pause();
                    video.removeAttribute('src');
                    video.load();
                    delete video.dataset.vvRetried;
                    const stage = slide.querySelector('[data-vv-stage]');
                    if (stage) stage.setAttribute('data-loading', '');
                }

                if (slide === active) {
                    video.muted = !wanted;
                    video.play().catch(() => { /* codec or policy refusal */ });
                } else {
                    video.pause();
                    video.muted = true;
                }
            });

            if (sound) sound.hidden = !active.querySelector('[data-vv-video]');
        }

        /*
         * The buffering spinner.
         *
         * The clip is fetched over whatever connection the shopper has, and
         * until enough of it has arrived the panel shows a motionless poster.
         * That is the same picture as a clip which has failed outright, so a
         * slow network read as "the video doesn't play" — this says which it
         * is, and goes as soon as there is a moving frame.
         *
         * Every listener is on the MODAL in the CAPTURE phase: none of these
         * media events bubble, and <falak-modal> re-creates the <video> when it
         * renders, so anything bound to the element itself would be listening
         * to a node that is no longer in the document.
         */
        wireLoader(modal) {
            /* The active slide's stage: with a reel there is one per slide
               and only the one being watched is loading anything. */
            const stage = () => {
                const slide = this.current(modal);
                return slide ? slide.querySelector('[data-vv-stage]') : null;
            };

            /*
             * Once raised, the spinner stays up for a beat.
             *
             * A clip the shopper has already hovered on the wall is in the
             * browser's cache, and the viewer then goes from opening to playing
             * in under a tenth of a second — the spinner was technically drawn
             * and nobody could see it, which reads as "there is no loader at
             * all". Below about a third of a second a spinner is a flicker
             * rather than an answer, so it is held long enough to be read as
             * one and no longer.
             */
            const MINIMUM_MS = 420;

            /*
             * And a ceiling. A fetch that is never going to finish — a wedged
             * server, a connection that dropped without the browser noticing —
             * fires no `error`, so without this the spinner turns for the rest
             * of the session and the shopper is told "wait" forever. Generous
             * on purpose: a genuinely slow phone connection pulling a few
             * megabytes must not be called a failure, so this is a backstop,
             * not a deadline.
             */
            const STALL_MS = 30000;
            let raisedAt = (window.performance || Date).now();
            let clearing = null;
            let watchdog = null;

            const set = (loading) => {
                const el = stage();
                if (!el) return;

                if (watchdog) { window.clearTimeout(watchdog); watchdog = null; }
                if (loading) watchdog = window.setTimeout(() => this.lost(modal, 'timed out'), STALL_MS);

                if (loading) {
                    if (clearing) { window.clearTimeout(clearing); clearing = null; }
                    /* Only restart the clock when it was actually down, or a
                       clip that stalls repeatedly would keep pushing its own
                       spinner out. */
                    if (!el.hasAttribute('data-loading')) raisedAt = (window.performance || Date).now();
                    el.setAttribute('data-loading', '');
                    return;
                }

                if (clearing) return;

                const left = MINIMUM_MS - ((window.performance || Date).now() - raisedAt);

                if (left <= 0) { el.removeAttribute('data-loading'); return; }

                clearing = window.setTimeout(() => {
                    clearing = null;
                    const late = stage();
                    if (late) late.removeAttribute('data-loading');
                }, left);
            };

            /*
             * Only the slide being watched.
             *
             * A reel preloads its neighbours, and those fire the same ready
             * events — which had two consequences: a neighbour buffering
             * cleared the spinner on the clip actually on screen, and the
             * "ready but not moving" nudge below started every preloaded clip
             * playing at once. An off-screen slide needs neither; settle()
             * starts whichever one the shopper lands on.
             */
            const mine = (event) => {
                const el = event.target;
                if (!el || !el.matches || !el.matches('[data-vv-video]')) return null;

                return el.closest('[data-vv-slide]') === this.current(modal) ? el : null;
            };

            /* `stalled` and `waiting` are the two that matter mid-playback: a
               clip that started and then ran out of buffer freezes, and without
               this the spinner would only ever have covered the first load. */
            ['loadstart', 'waiting', 'stalled'].forEach((name) => {
                modal.addEventListener(name, (event) => {
                    if (mine(event)) set(true);
                }, true);
            });

            /*
             * `timeupdate` is in the list deliberately. The others all fire
             * once, early, and a clip served from cache on a REOPEN can pass
             * every one of them before this wiring exists — leaving a spinner
             * over a video that is already playing. timeupdate fires several
             * times a second for as long as it plays, so that case clears
             * itself within a frame or two however the race went.
             */
            ['loadeddata', 'canplay', 'playing', 'timeupdate'].forEach((name) => {
                modal.addEventListener(name, (event) => {
                    const video = mine(event);
                    if (!video) return;

                    set(false);

                    /* Ready but not moving: autoplay was refused, or the clip
                       was paused while it buffered. Asking again here is free
                       and is what gets a cached reopen moving. */
                    if (video.paused) video.play().catch(() => { /* policy refusal */ });
                }, true);
            });

            /* The one case no event covers: the modal rendered synchronously
               and the clip was already buffered before any of the above was
               attached. Checking the element's own state costs nothing and
               settles it immediately. */
            const slide = this.current(modal);
            const video = slide && slide.querySelector('[data-vv-video]');
            if (video && video.readyState >= 2) set(false);
        }

        /*
         * The speaker.
         *
         * Unmuting is the one thing here a browser will only do from a real
         * click, so this is a toggle rather than a merchant setting. The
         * pressed state is carried on the button itself (aria-pressed), which
         * is both what a screen reader announces and what the stylesheet tints
         * — there is no second copy of the state to fall out of step.
         */
        wireSound(modal) {
            modal.addEventListener('click', (event) => {
                const button = event.target.closest('[data-vv-sound]');
                if (!button) return;

                const slide = this.current(modal);
                const video = slide && slide.querySelector('[data-vv-video]');
                if (!video) return;

                video.muted = !video.muted;
                button.setAttribute('aria-pressed', video.muted ? 'false' : 'true');
                button.innerHTML = this.soundGlyph(video.muted);

                /* Unmuting a clip a policy had refused to start leaves it
                   paused; this same click is the gesture that may now start
                   it. */
                if (!video.muted) video.play().catch(() => { /* codec or policy refusal */ });
            });
        }

        /*
         * A clip that will not load.
         *
         * `error` does not bubble, so this listens in the CAPTURE phase: that
         * is the only way for the modal to hear it on behalf of a <video> the
         * modal itself re-created.
         */
        wireMediaFallback(modal) {
            modal.addEventListener('error', (event) => {
                const video = event.target;
                if (!video || !video.matches || !video.matches('[data-vv-video]')) return;

                const why = video.error ? 'media error ' + video.error.code : 'media error';

                /*
                 * ONE automatic retry before giving up.
                 *
                 * The first failure here is usually a race rather than a
                 * verdict: the wall was still fetching this very file when the
                 * shopper clicked, quieten() abandoned that request, and a
                 * browser that keys its media cache on the URL can hand the
                 * abandoned entry straight to the dialog asking for the same
                 * one. Asking again a moment later gets a clean request and the
                 * clip plays — where the panel would have told the shopper the
                 * video was broken when it was not.
                 *
                 * Once only, and flagged on the element, so a genuinely missing
                 * file still reaches lost() on its second try instead of
                 * looping.
                 */
                if (!video.dataset.vvRetried) {
                    video.dataset.vvRetried = '1';
                    window.falak.logger.warn('custom-falak-video-view: ' + why + ', retrying once');
                    window.setTimeout(() => {
                        if (video.isConnected) video.load();
                    }, 400);
                    return;
                }

                this.lost(modal, why, video.closest('[data-vv-slide]'));
            }, true);
        }

        /*
         * SAY SO. The viewer used to fail silently: it dropped the clip and the
         * speaker, took the spinner down and left a dark rectangle with a name
         * and a price under it. On a product whose merchant saved no poster
         * that is indistinguishable from a dialog that is still thinking, and
         * the only honest reading of it from the outside was "why is there no
         * loader?" — which is exactly how it was reported.
         *
         * Nothing is removed to get here: the state is a flag on the root and
         * the stylesheet does the rest, which is what lets retry() be a reset
         * rather than a rebuild. The name, the price, the variant picker and
         * the add-to-cart all keep working — a clip that will not play is no
         * reason to stop someone buying the thing.
         */
        lost(modal, why, slide) {
            /* Flagged on the SLIDE, not on the dialog: one clip that will not
               play must not put the whole reel into a failed state — swiping
               to the next one has to still work. */
            const target = slide || this.current(modal);
            if (!target || target.hasAttribute('data-vv-failed')) return;

            target.setAttribute('data-vv-failed', '');

            const stage = target.querySelector('[data-vv-stage]');
            if (stage) stage.removeAttribute('data-loading');

            /* Named in the console, because the shopper's answer ("it did not
               load") is not enough to find out why. */
            const video = target.querySelector('[data-vv-video]');
            window.falak.logger.warn(
                'custom-falak-video-view: clip did not load (' + why + ')',
                video ? video.getAttribute('src') : null,
            );
        }

        /* The shopper asks again. The <video> was never torn down, so this is
           its src re-selected — one load() — rather than a rebuilt dialog. */
        wireRetry(modal) {
            modal.addEventListener('click', (event) => {
                if (!event.target.closest('[data-vv-retry]')) return;

                const slide = event.target.closest('[data-vv-slide]') || this.current(modal);
                if (!slide) return;

                const stage = slide.querySelector('[data-vv-stage]');
                const video = slide.querySelector('[data-vv-video]');
                if (!video) return;

                slide.removeAttribute('data-vv-failed');
                if (stage) stage.setAttribute('data-loading', '');

                /* The source was released when the slide scrolled out of
                   reach; put it back before asking the element to load it. */
                if (!video.getAttribute('src') && video.getAttribute('data-vv-src')) {
                    video.setAttribute('src', video.getAttribute('data-vv-src'));
                }

                /* A fresh start, automatic retry included: the shopper asking
                   again is a new attempt, not a continuation of the one that
                   already used up its second chance. */
                delete video.dataset.vvRetried;

                video.load();
                video.play().catch(() => { /* policy refusal; the frame is what matters */ });
            });
        }

        /*
         * Added: the shopper is done here. The viewer was opened to look at one
         * clip, and leaving it over the wall afterwards just makes them dismiss
         * it themselves. The pause lets the button's own "Added ✓" be read
         * first.
         */
        closeOnAdd(modal) {
            modal.addEventListener('success', (event) => {
                if (!event.target.matches('falak-add-product-button')) return;
                window.setTimeout(() => modal.close(), 900);
            });
        }

        /*
         * Drop the modal once it closes, rather than leaving it parked in the
         * document until the next open.
         *
         * Two reasons, and either alone would be enough: it holds a loaded
         * <falak-product-options> for this product, which a CARD's add button
         * searching document-wide would otherwise find on the next click; and
         * it holds a playing <video>, which keeps decoding — and keeps its
         * audio on — for as long as it is in the tree. Escape and backdrop
         * clicks close the modal without telling this component, so the
         * attribute is watched rather than hooking close().
         */
        dropOnClose(modal) {
            const watcher = new MutationObserver(() => {
                if (modal.hasAttribute('visible')) return;

                watcher.disconnect();

                /* Silenced the moment it is dismissed, not 400ms later: a clip
                   the shopper unmuted must not keep talking over the fade. */
                modal.querySelectorAll('[data-vv-video]').forEach((video) => {
                    video.pause();
                    video.muted = true;
                });

                if (this._reel) { this._reel.disconnect(); this._reel = null; }

                // After the close transition, so the dialog is not yanked mid-fade.
                window.setTimeout(() => {
                    if (this._modal === modal) {
                        this._modal = null;

                        /* The wall gets its clips back, but only once the LAST
                           dialog is gone: a second open replaces the first
                           without closing it, and reviving then would hand the
                           loaders straight back to the cards the new dialog is
                           competing with. */
                        this.revive(this._held);
                        this._held = null;
                    }

                    modal.remove();
                }, 400);
            });

            watcher.observe(modal, { attributes: true, attributeFilter: ['visible'] });
        }

        /* ---------------------------------------------------------- helpers */

        trans(key) {
            return window.falak.lang.get(key);
        }

        /* The API returns media as bare storage paths ('products/videos/x.mp4'),
           so anything not already absolute is resolved against the public disk. */
        media(v) {
            const s = String(v || '').trim();
            if (!s) return null;
            if (/^(https?:)?\/\//i.test(s) || s.indexOf('data:') === 0) return s;
            if (s.charAt(0) === '/') return s;
            return '/storage/' + s.replace(/^\/+/, '');
        }

        escape(v) {
            return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }

        /* One glyph with the bars swapped, rather than two drawings: the
           speaker body is identical in both states, so only the right-hand mark
           changes and the button does not appear to jump when it is pressed. */
        soundGlyph(muted) {
            return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
                + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                + '<path d="M11 5 6 9H3v6h3l5 4Z"/>'
                + (muted
                    ? '<path d="m16 9 5 6M21 9l-5 6"/>'
                    : '<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>')
                + '</svg>';
        }
    }

    customElements.define('custom-falak-video-view', CustomFalakVideoView);

    /*
     * The bus entry point, subscribed HERE rather than in the element's
     * connectedCallback — the element is created on demand, so a listener
     * registered on it could only ever hear the SECOND dispatch. Same reasoning
     * as <custom-falak-quick-view>'s.
     */
    if (window.falak) {
        window.falak.event.on('video-view::open', function (payload) {
            CustomFalakVideoView.open(payload || {});
        });
    }

    /*
     * One delegated listener for every card in the wall, however it got there —
     * the section builds its cards long after this file has run, which a
     * per-element listener could not cover.
     *
     * THIS THEME'S CARDS ARE THE SDK'S OWN <falak-product-card>, not markup of
     * the theme's, so there is no theme-owned attribute to hang the trigger on
     * and none is added: reaching into the shared component to stamp one would
     * be a change every other theme inherits. The SECTION is the scope instead,
     * which is the same thing the card already uses to decide whether to draw a
     * clip at all.
     *
     * The whole wall goes over with the click, in the order it is on screen, so
     * the dialog opens as a reel the shopper can swipe through rather than a
     * dead end they have to close to see the next clip. Read off the cards
     * rather than re-fetched: the section already holds every record.
     *
     * The card's own controls keep their jobs: the add button, the wishlist
     * heart and anything else that takes a click are skipped, and so is every
     * click but a plain left one, so a middle- or modifier-click still opens the
     * product page in a new tab.
     */
    document.addEventListener('click', function (event) {
        if (!window.falak) return;

        const card = event.target.closest('[data-video-commerce] falak-product-card');
        if (!card) return;

        // Anything but a plain left click is the shopper asking for a new tab.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        if (event.target.closest('button, falak-add-product-button, falak-wishlist-button, input, select, textarea')) return;

        const product = card.product || null;

        /* No clip, no viewer. A product flagged for video commerce whose file
           never uploaded is still a product, and its card must keep behaving
           like every other card on the page. */
        if (!product || !(product.video_url || product.video_path)) return;

        event.preventDefault();

        const wall = card.closest('[data-video-commerce]');

        const products = wall
            ? [...wall.querySelectorAll('falak-product-card')]
                .map(one => one.product)
                .filter(Boolean)
            : [];

        CustomFalakVideoView.open({ id: product.id, product: product, products: products });
    });
})();


/*
 * The video wall's scroll affordance.
 *
 * Once the wall holds more products than it shows across it becomes a
 * horizontally scrolling row — and on a desktop that row was unusable. The
 * scrollbar is deliberately hidden, a vertical wheel does not scroll a
 * horizontal container, and this theme has no slider arrows: a shopper with a
 * mouse could see four cards and had no way to reach the other eight, with
 * nothing on screen to suggest there were any.
 *
 * So the row gets what every scrolling rail needs: a line showing how far along
 * it is, and the ability to grab a card and drag. Nova and Onyx have the same
 * two things from their own rail machinery; this is the small version, scoped
 * to the one row in this theme that scrolls.
 */
(function () {
    'use strict';

    function attach(track) {
        if (track.dataset.vpRail) return;
        track.dataset.vpRail = '1';

        var rail = document.createElement('div');
        rail.className = 'vp-rail';
        rail.innerHTML = '<span class="vp-rail__thumb"></span>';
        track.insertAdjacentElement('afterend', rail);

        var thumb = rail.firstElementChild;

        function update() {
            var span = track.scrollWidth - track.clientWidth;

            /* Nothing to scroll — the merchant's count fits after all, or the
               window grew. A line that cannot move is just a stray rule. */
            if (span <= 0) { rail.hidden = true; return; }
            rail.hidden = false;

            /* The thumb is the share of the row currently in view, floored so a
               very long wall still leaves something to see and grab. */
            var width = Math.max((track.clientWidth / track.scrollWidth) * 100, 8);
            thumb.style.inlineSize = width + '%';

            /* RTL counts scrollLeft DOWN from zero in this engine, so the
               distance travelled is its magnitude either way. */
            var travelled = Math.abs(track.scrollLeft) / span;
            thumb.style.insetInlineStart = (travelled * (100 - width)) + '%';
        }

        track.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        update();

        /*
         * Grab a card and drag the row with it.
         *
         * Touch is left alone — the row already scrolls natively there, and
         * taking over would only make it worse. This is for the mouse, which
         * otherwise has nothing at all.
         *
         * Snapping is suspended for the length of the drag: with scroll-snap
         * live, every assignment to scrollLeft is pulled back to the nearest
         * card and the row judders instead of following the cursor.
         */
        var dragging = false, originX = 0, originScroll = 0, travel = 0;

        track.addEventListener('dragstart', function (event) { event.preventDefault(); });

        track.addEventListener('pointerdown', function (event) {
            if (event.pointerType === 'touch' || event.button !== 0) return;

            dragging = true;
            travel = 0;
            originX = event.clientX;
            originScroll = track.scrollLeft;
            track.style.scrollSnapType = 'none';
            track.style.scrollBehavior = 'auto';
        });

        window.addEventListener('pointermove', function (event) {
            if (!dragging) return;

            var moved = event.clientX - originX;
            if (Math.abs(moved) > travel) travel = Math.abs(moved);

            /* Only past a few pixels, so a plain click on a card is still a
               click and not a one-pixel drag. */
            if (travel > 4) track.classList.add('is-dragging');

            track.scrollLeft = originScroll - moved;
        });

        function release() {
            if (!dragging) return;
            dragging = false;
            track.style.scrollSnapType = '';
            track.style.scrollBehavior = '';
            track.classList.remove('is-dragging');

            /* A drag must not open the card it finished on. One capture-phase
               listener, fired once, swallows the click the pointer is about to
               produce — and only when there really was a drag. */
            if (travel > 4) {
                track.addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                }, { capture: true, once: true });
            }
        }

        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
    }

    function init() {
        document.querySelectorAll('[data-video-commerce]').forEach(function (section) {
            /* The grid only becomes a scroller once the products have landed
               and app.js has counted them, which is well after this runs — so
               the section is watched rather than swept once. */
            var sweep = function () {
                var track = section.querySelector('[data-video-commerce-grid][data-scroll-rail]');
                if (track) attach(track);
            };

            sweep();

            new MutationObserver(sweep).observe(section, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-scroll-rail'],
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
