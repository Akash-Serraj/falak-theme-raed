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
