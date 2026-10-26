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

    // The drawer's own close button (menu.twig). The backdrop alone is not a
    // discoverable way out, and the hamburger that opened the drawer sits
    // behind the overlay once the drawer is over it.
    var drawerClose = document.querySelector('[data-menu-close]');
    if (drawerClose) drawerClose.addEventListener('click', closeMenu);

    var drawer = document.querySelector('.main-menu');

    // Following a link inside the drawer closes it. On a cross-page link the
    // drawer would otherwise come back open on a bfcache restore; on a
    // same-page anchor it would simply sit over the target.
    //
    // Except the first tap on a parent item: <falak-menu> turns that tap into
    // "open the submenu" instead of navigating (it marks such links with
    // aria-controls), and the drawer has to stay for the shopper to see it.
    // Its listener runs after this one — it sits on the outer <falak-menu> —
    // so `is-open` here is the state BEFORE that tap is handled.
    if (drawer) {
        drawer.addEventListener('click', function (event) {
            var link = event.target.closest('a[href]');
            if (!link) return;

            var parent = link.closest('li');
            var opensSubmenu = link.hasAttribute('aria-controls')
                && parent && !parent.classList.contains('is-open');

            if (!opensSubmenu) closeMenu();
        });
    }

    /* ---------------------------------------- drawer: account + sign-in */

    /*
        The drawer carries a guest card (sign in / create account), two
        account tiles and a sign-out button. Which of them show is a
        client-side fact — the storefront session is the SDK's
        token, not anything Twig can see — so all three ship hidden and this
        picks, now and again on every auth event, the same way
        <falak-user-menu> redraws itself.
    */
    var guestCard = document.querySelector('[data-menu-guest]');
    var logoutButton = document.querySelector('[data-menu-logout]');

    function syncDrawerAuth() {
        var auth = window.falak && window.falak.auth;
        if (!auth || !drawer) return;

        var signedIn = auth.isLoggedIn();
        if (guestCard) guestCard.hidden = signedIn;
        if (logoutButton) logoutButton.hidden = !signedIn;
        // The shortcut tiles are account pages; a guest gets the sign-in card.
        var tiles = drawer.querySelector('[data-menu-tiles]');
        if (tiles) tiles.hidden = !signedIn;
    }

    if (drawer && window.falak && window.falak.onReady) {
        window.falak.onReady(function () {
            syncDrawerAuth();

            ['auth::logged.in', 'auth::logged.out', 'auth::token.invalid', 'auth::user.fetched']
                .forEach(function (name) { window.falak.event.on(name, syncDrawerAuth); });

            // Rows the store has switched off drop out rather than 404 — the
            // same gate <falak-user-menu> applies to its own list.
            drawer.querySelectorAll('[data-menu-feature]').forEach(function (row) {
                if (!window.falak.config.get('store.settings.' + row.dataset.menuFeature, true)) row.hidden = true;
            });
        });

        // Both guest buttons open the OTP sheet: `auth::required` is what the
        // layout's <falak-login-modal> listens for, and what <falak-user-menu>
        // dispatches for its own sign-in button.
        drawer.addEventListener('click', function (event) {
            if (event.target.closest('[data-menu-login]')) {
                closeMenu();
                window.falak.event.dispatch('auth::required');
            }
        });

        if (logoutButton) {
            logoutButton.addEventListener('click', function () {
                logoutButton.disabled = true;
                Promise.resolve(window.falak.auth.logout()).finally(function () {
                    // Server-rendered account markup is still on the page.
                    window.location.reload();
                });
            });
        }
    }

    /* ------------------------------------- account menu: no notifications */
    /*
        This theme has no notifications page, so the shared <falak-user-menu>
        must not offer one. The component redraws its list on every auth
        event, so a one-off removal is not enough: watch each menu and drop
        the row whenever it reappears (app.css hides it too, via :has()).
    */
    function dropNotificationRows(root) {
        (root || document).querySelectorAll(
            'falak-user-menu .f-user__link[href="/customer/notifications"]'
        ).forEach(function (link) {
            var row = link.closest('.f-user__item');
            (row || link).remove();
        });
    }

    dropNotificationRows();
    document.querySelectorAll('falak-user-menu').forEach(function (menu) {
        new MutationObserver(function () { dropNotificationRows(menu); })
            .observe(menu, { childList: true, subtree: true });
    });

    // Dropdown submenus, keyboard handling and viewport-edge flipping are
    // handled by <falak-menu> (see menu.twig's own comment) — kept out of
    // this file entirely to avoid double-toggling.

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeMenu();
    });

    /* ------------------------------------------ categories strip: current chip */

    /*
        "All" leads the strip and links to the listing; each category chip
        links to the listing filtered to it. The one matching this page fills
        (app.css .is-active) — compared on path and query, with the query
        parameters sorted, so `?category_id[]=5` matches however the merchant's
        link was typed. Nothing fills on pages the strip does not describe.
    */
    var chips = document.querySelectorAll('.cat-bar a[href]');
    if (chips.length) {
        var key = function (url) {
            try {
                var u = new URL(url, window.location.href);
                var params = Array.from(u.searchParams.entries())
                    .filter(function (pair) { return pair[0] !== 'lang' && pair[0] !== 'currency' && pair[0] !== 'page'; })
                    .sort()
                    .map(function (pair) { return pair[0] + '=' + pair[1]; })
                    .join('&');
                return u.pathname.replace(/\/+$/, '') + '?' + params;
            } catch (error) {
                return url;
            }
        };
        var current = key(window.location.href);
        chips.forEach(function (chip) {
            if (key(chip.href) === current) chip.classList.add('is-active');
        });
    }

    /* ------------------------------------------ categories strip: overflow */

    /*
        The desktop strip is centred and its scrollbar hidden, so once the
        merchant's categories outgrow the row the extras were simply cut off —
        reachable by a wheel-less horizontal scroll nobody has. Priority+
        instead: the row keeps what fits and folds the rest into a trailing
        "More N" dropdown, recounted on every resize.

        Desktop only. The phone strip is already a swipeable row of chips with
        an edge fade saying so; folding there would take away the better
        affordance.
    */
    var catBar = document.querySelector('.cat-bar ul');
    if (catBar) {
        var desktopBar = window.matchMedia('(min-width: 861px)');

        var moreLabel = function () {
            if (window.falak && window.falak.lang) return window.falak.lang.get('menu.more');
            return (document.documentElement.lang || '').indexOf('ar') === 0 ? 'المزيد' : 'More';
        };

        var moreItem = document.createElement('li');
        moreItem.className = 'cat-bar__more';
        moreItem.hidden = true;

        var moreTrigger = document.createElement('a');
        moreTrigger.href = '#';
        moreTrigger.setAttribute('role', 'button');
        moreTrigger.setAttribute('aria-haspopup', 'true');
        moreTrigger.setAttribute('aria-expanded', 'false');
        moreTrigger.innerHTML = '<span data-more-label></span><span class="cat-bar__more-count" data-more-count></span>'
            + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"'
            + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

        var morePanel = document.createElement('ul');
        morePanel.className = 'cat-bar__more-panel';
        morePanel.id = 'cat-bar-more';
        moreTrigger.setAttribute('aria-controls', morePanel.id);

        moreItem.appendChild(moreTrigger);
        moreItem.appendChild(morePanel);
        catBar.appendChild(moreItem);

        var setMoreOpen = function (open) {
            moreItem.classList.toggle('is-open', open);
            moreTrigger.setAttribute('aria-expanded', String(open));
        };

        moreTrigger.addEventListener('click', function (event) {
            event.preventDefault();
            setMoreOpen(!moreItem.classList.contains('is-open'));
        });
        document.addEventListener('click', function (event) {
            if (!moreItem.contains(event.target)) setMoreOpen(false);
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') setMoreOpen(false);
        });

        /* The "All" chip is the phone strip's; on desktop it is display:none
           and must not join the measuring or the folding. */
        var stripItems = function () {
            return Array.from(catBar.children).filter(function (li) {
                return li !== moreItem && !li.classList.contains('cat-bar__all');
            });
        };

        var relayoutStrip = function () {
            var items = stripItems();
            items.forEach(function (li) { li.classList.remove('is-collapsed'); });
            morePanel.innerHTML = '';
            moreItem.hidden = true;
            setMoreOpen(false);

            if (!desktopBar.matches) {
                catBar.removeAttribute('data-cat-overflow');
                return;
            }

            /* Keys `overflow: visible` in the stylesheet, so the dropdown is
               not clipped by the strip's own scroller — safe, because after
               the fold nothing overflows the row any more. */
            catBar.setAttribute('data-cat-overflow', '');

            if (catBar.scrollWidth <= catBar.clientWidth + 1) return;

            /* Worded and counted BEFORE measuring, with the widest count it
               could end up holding — an empty pill measures ~40px narrow and
               the fold comes up one chip short. */
            moreTrigger.querySelector('[data-more-label]').textContent = moreLabel();
            moreTrigger.querySelector('[data-more-count]').textContent = String(items.length);

            moreItem.hidden = false;
            var collapsed = [];
            for (var i = items.length - 1; i >= 0 && catBar.scrollWidth > catBar.clientWidth + 1; i--) {
                items[i].classList.add('is-collapsed');
                collapsed.unshift(items[i]);
            }

            collapsed.forEach(function (li) {
                var link = li.querySelector('a');
                if (!link) return;
                var row = document.createElement('li');
                var a = document.createElement('a');
                a.href = link.getAttribute('href') || '#';
                if (link.getAttribute('target')) {
                    a.target = link.getAttribute('target');
                    a.rel = 'noopener';
                }
                a.textContent = (link.textContent || '').trim();
                // The chip matcher above has already run; carry its verdict.
                if (link.classList.contains('is-active')) a.classList.add('is-active');
                row.appendChild(a);
                morePanel.appendChild(row);
            });

            moreTrigger.querySelector('[data-more-count]').textContent = String(collapsed.length);
        };

        var stripFrame = 0;
        var queueStrip = function () {
            cancelAnimationFrame(stripFrame);
            stripFrame = requestAnimationFrame(relayoutStrip);
        };

        window.addEventListener('resize', queueStrip);
        if (desktopBar.addEventListener) desktopBar.addEventListener('change', queueStrip);
        /* A late font swap can change what fits by a whole chip. */
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueStrip);

        relayoutStrip();
    }

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

    /* ----------------------------------------------------- copy page link */
    /*
        The product share row's copy button. Falls back to a hidden textarea
        where the async clipboard API is missing (plain-http hosts).
    */
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
        return new Promise(function (resolve, reject) {
            var field = document.createElement('textarea');
            field.value = text;
            field.setAttribute('readonly', '');
            field.style.cssText = 'position:fixed;inset-block-start:-9999px;opacity:0';
            document.body.appendChild(field);
            field.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { /* reported below */ }
            field.remove();
            ok ? resolve() : reject();
        });
    }

    document.querySelectorAll('[data-copy-link]').forEach(function (button) {
        button.addEventListener('click', function () {
            copyText(window.location.href).then(function () {
                button.classList.add('is-copied');
                window.clearTimeout(button._copiedTimer);
                button._copiedTimer = window.setTimeout(function () { button.classList.remove('is-copied'); }, 1800);
                showToast(button.dataset.copiedText, 'success');
            }, function () {
                showToast(button.dataset.failedText, 'error');
            });
        });
    });

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

    /* ------------------------------------------- payment return: failed */
    // A declined or cancelled payment does not park the shopper on the
    // return page's "Payment was not completed" screen with a "check
    // status" button: it sends them to the order itself, where the status
    // banner says the same thing and "Retry payment" opens the gateway
    // picker. The verdict arrives on the bus BEFORE the component paints
    // its failed state, so the screen never flashes. Pending verdicts stay
    // here, where the component keeps polling for a late webhook.
    var paymentStatus = document.querySelector('falak-payment-status');
    if (paymentStatus && window.falak && window.falak.onReady) {
        var orderUrlTemplate = paymentStatus.getAttribute('order-url') || '/customer/orders/{order}';
        var sentToOrder = false;

        function sendToOrder(orderNumber) {
            if (sentToOrder || !orderNumber) return;
            sentToOrder = true;
            // replace(), not assign(): Back from the order page must not land
            // on a return page that would only redirect again.
            window.location.replace(orderUrlTemplate.replace('{order}', encodeURIComponent(orderNumber)));
        }

        window.falak.onReady(function () {
            window.falak.event.on('checkout::payment.verified', function (payload) {
                if (payload && payload.status === 'failed') sendToOrder(payload.orderNumber);
            });

            // Had the verdict already landed before this listener existed,
            // the component is sitting in its failed state right now.
            if (paymentStatus._state === 'failed') sendToOrder(paymentStatus._number);
        });
    }
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

            /* A store with no categories yet says so where the tiles would be,
               rather than leaving the whole band hidden: the merchant who
               placed the section has to be able to see it. Styled with the
               component library's message classes — same state, same look. */
            if (!categories.length) {
                var note = document.createElement('div');
                note.className = 'f-list__message f-list__message--empty';

                var noteText = document.createElement('p');
                noteText.textContent = window.falak.lang.get('categories.none_added');

                note.appendChild(noteText);
                list.insertAdjacentElement('afterend', note);
                section.removeAttribute('hidden');

                return;
            }

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
        var playback = section.getAttribute('data-playback') || 'inview';
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

            /* Drawn pointing toward inline-start; the stylesheet mirrors it
               for the next arrow and again under [dir="rtl"]. */
            const chevron = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"'
                + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                + '<path d="M15 18l-6-6 6-6"/></svg>';

            /* The reel's arrows, for the pointer. On a phone the next clip is a
               swipe away and these stay hidden; above the breakpoint only the
               active slide is drawn and nothing scrolls, so without them a
               mouse had no way from one clip to the next. A reel of one has
               nowhere to step and gets none. */
            const arrows = list.length > 1
                ? '<button type="button" class="vv__chip vv__chip--step vv__chip--prev" data-vv-step="-1"'
                    + ' aria-label="' + this.escape(t('common.previous')) + '">' + chevron + '</button>'
                + '<button type="button" class="vv__chip vv__chip--step vv__chip--next" data-vv-step="1"'
                    + ' aria-label="' + this.escape(t('common.next')) + '">' + chevron + '</button>'
                : '';

            return ''
                + '<div class="vv__reel" data-vv-reel data-active="' + active + '">' + slides + '</div>'
                + arrows
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
                    + '<span class="vv__name">' + this.escape(p.name) + '</span>'

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
            this.wireStep(modal);
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

        /* Bound to the MODAL (see wire) and delegated, so it survives the
           library's re-render of everything inside. */
        wireStep(modal) {
            modal.addEventListener('click', (event) => {
                const button = event.target.closest('[data-vv-step]');
                if (!button || button.disabled || !modal.contains(button)) return;
                this.step(modal, Number(button.getAttribute('data-vv-step')) || 0);
            });
        }

        /*
         * One clip over, for the arrows.
         *
         * On a phone the reel scrolls, so the step is a scroll and the
         * observer names the slide the way it does for a swipe. Above the
         * breakpoint the reel CANNOT scroll — only the active slide is drawn —
         * so there the step is the class change itself, with settle() doing
         * what it does for every change of slide: swap the clips over and
         * carry the shopper's sound choice across.
         */
        step(modal, delta) {
            const reel = modal.querySelector('[data-vv-reel]');
            const slides = [...(reel ? reel.querySelectorAll('[data-vv-slide]') : [])];
            if (slides.length < 2) return;

            const current = this.current(modal);
            const index = Math.max(0, Math.min(slides.indexOf(current) + delta, slides.length - 1));
            const target = slides[index];
            if (!target || target === current) return;

            if (reel.scrollHeight > reel.clientHeight + 1) {
                reel.scrollTo({ top: target.offsetTop - slides[0].offsetTop, behavior: 'smooth' });
                return;
            }

            slides.forEach(slide => slide.classList.toggle('is-active', slide === target));
            reel.setAttribute('data-active', target.getAttribute('data-index'));
            this.settle(modal, target);
        }

        /* The ends say so: an arrow with no clip left on its side disappears
           (the stylesheet hides a disabled step) rather than swallowing the
           click over the video. */
        syncStep(modal) {
            const slides = [...modal.querySelectorAll('[data-vv-slide]')];
            const index = slides.indexOf(this.current(modal));
            const prev = modal.querySelector('[data-vv-step="-1"]');
            const next = modal.querySelector('[data-vv-step="1"]');
            if (prev) prev.disabled = index <= 0;
            if (next) next.disabled = index >= slides.length - 1;
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

            /* Every change of slide comes through here — a swipe, an arrow, the
               opening jump — so this is the one place the arrows' end state is
               kept true. */
            this.syncStep(modal);
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

        /* Drawn pointing toward inline-start; the stylesheet mirrors it for
           the next button and again under [dir="rtl"], so one path serves all
           four cases. */
        var chevron = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"'
            + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            + '<path d="M15 18l-6-6 6-6"/></svg>';

        var lang = window.falak && window.falak.lang;

        var nav = document.createElement('div');
        nav.className = 'vp-nav';
        nav.innerHTML =
            '<button type="button" class="vp-nav__btn" data-vp-prev aria-label="'
                + (lang ? lang.get('common.previous') : 'Previous') + '">' + chevron + '</button>'
            + '<button type="button" class="vp-nav__btn" data-vp-next aria-label="'
                + (lang ? lang.get('common.next') : 'Next') + '">' + chevron + '</button>';

        /* One line under the row: the progress rail with the arrows at its
           inline end. The stylesheet keeps the arrows for mouse-sized screens;
           on a phone the row scrolls under the thumb and needs neither. */
        var foot = document.createElement('div');
        foot.className = 'vp-foot';
        foot.appendChild(rail);
        foot.appendChild(nav);
        track.insertAdjacentElement('afterend', foot);

        var thumb = rail.firstElementChild;
        var prev = nav.querySelector('[data-vp-prev]');
        var next = nav.querySelector('[data-vp-next]');

        function update() {
            var span = track.scrollWidth - track.clientWidth;

            /* Nothing to scroll — the merchant's count fits after all, or the
               window grew. A line that cannot move is just a stray rule, and
               arrows that cannot move anything go with it. */
            if (span <= 0) { foot.hidden = true; return; }
            foot.hidden = false;

            /* The ends say so: an arrow with nowhere left to go greys out
               instead of swallowing the click. scrollLeft runs negative in
               RTL, so distance is its magnitude either way. */
            var gone = Math.abs(track.scrollLeft);
            prev.disabled = gone <= 1;
            next.disabled = gone >= span - 1;

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
         * One viewport of cards per press, smooth, and the snap already live
         * on the track settles it onto a card boundary — so the arrows page
         * through the row without ever leaving half a card at the edge.
         *
         * "Forward" is a LOGICAL direction: in RTL the row advances as
         * scrollLeft falls, so the sign follows the track's direction rather
         * than the arrow's side of the screen.
         */
        function page(sign) {
            var forward = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
            track.scrollBy({ left: sign * forward * track.clientWidth, behavior: 'smooth' });
        }

        prev.addEventListener('click', function () { page(-1); });
        next.addEventListener('click', function () { page(1); });

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


/*
 * <custom-falak-blog-card> — THE article card, one definition for the theme.
 *
 * The counterpart of the product card: the index grid builds this element
 * rather than markup of its own, so one card can never drift from another.
 *
 * Two ways it gets its data, in order:
 *
 *   1. `_post` property — how the list hands over a record it already fetched.
 *      A property, not a JSON attribute, so a headline containing a quote
 *      never needs two rounds of escaping.
 *   2. `post` attribute — a record already in hand from Twig.
 *
 * Labels come from falak.lang, which is loaded from this theme's own
 * src/locales files — the same table trans() reads in Twig — so the card needs
 * nothing passed in to say "read more" in the right language.
 */
(function () {
    'use strict';

    if (window.customElements && customElements.get('custom-falak-blog-card')) return;

    class CustomFalakBlogCard extends HTMLElement {
        connectedCallback() {
            if (!window.falak) return;
            window.falak.onReady(() => this.render());
        }

        get record() {
            if (this._post) return this._post;
            try { return JSON.parse(this.getAttribute('post') || 'null'); }
            catch (e) { return null; }
        }

        escape(v) {
            return String(v ?? '').replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }

        /*
         * TWO SHAPES arrive here, and both have to work:
         *
         *   the API's raw row      title, slug, featured_image, published_at
         *   the server's mapBlog   title, url, image, published_label
         *
         * Cards created by the list carry the first; a card server-rendered
         * from Twig carries the second.
         */
        normalise(row) {
            return {
                title: row.title || '',
                url: row.url || ('/blogs/' + (row.slug || '')),
                image: row.image !== undefined ? row.image : this.media(this.rawImage(row)),
                imageAlt: row.image_alt || row.featured_image_alt || row.title || '',
                excerpt: row.excerpt || '',
                /* show_author is the server's opt-in; a row that hid the name
                   arrives with it already null, on either shape. */
                author: row.author !== undefined ? row.author : (row.author_name || null),
                date: row.published_label || this.formatDate(row.published_at),
            };
        }

        /*
         * featured_image_url is the model's accessor, and it runs the stored
         * value through the disk's url() unconditionally — which mangles a
         * value that is already absolute into ".../storage/https://…". So an
         * absolute stored path wins over the accessor, matching what the
         * server's blogImage() does for the same row.
         */
        rawImage(row) {
            const stored = String(row.featured_image || '').trim();
            if (stored && /^(https?:)?[/][/]/i.test(stored)) return stored;
            return row.featured_image_url || stored;
        }

        /* Bare storage paths are resolved against the public disk — the same
           rule the video wall applies to its clips. */
        media(value) {
            var s = String(value || '').trim();
            if (!s) return null;
            if (/^(https?:)?[/][/]/i.test(s) || s.indexOf('data:') === 0) return s;
            if (s.charAt(0) === '/') return s;
            return '/storage/' + s.replace(/^[/]+/, '');
        }

        formatDate(value) {
            if (!value) return null;

            const date = new Date(value);
            if (isNaN(date.getTime())) return null;

            try {
                return new Intl.DateTimeFormat(
                    window.falak.lang.locale === 'ar' ? 'ar' : 'en-GB',
                    { day: 'numeric', month: 'long', year: 'numeric' }
                ).format(date);
            } catch (e) {
                return date.toISOString().slice(0, 10);
            }
        }

        render() {
            const raw = this.record;
            if (!raw) return;

            const p = this.normalise(raw);
            const t = key => window.falak.lang.get(key);

            this.classList.add('blog-card');

            this.innerHTML =
                '<a class="blog-card__media" href="' + this.escape(p.url) + '" aria-label="' + this.escape(p.title) + '">'
                    + (p.image
                        ? '<img src="' + this.escape(p.image) + '" alt="' + this.escape(p.imageAlt) + '" loading="lazy">'
                        : '<span class="blog-card__placeholder"></span>')
                + '</a>'
                + '<div class="blog-card__body">'
                    + '<p class="blog-card__meta">'
                        + (p.date
                            ? '<span class="blog-card__meta-item">'
                                + '<span class="blog-card__meta-glyph blog-card__meta-glyph--date" aria-hidden="true"></span>'
                                + this.escape(p.date)
                              + '</span>'
                            : '')
                        + (p.author
                            ? '<span class="blog-card__meta-item">'
                                + '<span class="blog-card__meta-glyph blog-card__meta-glyph--user" aria-hidden="true"></span>'
                                + this.escape(p.author)
                              + '</span>'
                            : '')
                    + '</p>'
                    + '<h3 class="blog-card__title"><a href="' + this.escape(p.url) + '">' + this.escape(p.title) + '</a></h3>'
                    + (p.excerpt ? '<p class="blog-card__excerpt">' + this.escape(p.excerpt) + '</p>' : '')
                    + '<a class="blog-card__more" href="' + this.escape(p.url) + '">'
                        + this.escape(t('blog.read_more'))
                        + '<span class="blog-card__more-chevron" aria-hidden="true"></span>'
                    + '</a>'
                + '</div>';
        }
    }

    customElements.define('custom-falak-blog-card', CustomFalakBlogCard);
})();

/*
 * <custom-falak-blog-list> — the /blogs grid.
 *
 * Reads GET /api/storefront/blogs, the endpoint that already existed. It owns
 * the published scope, the ?category / ?tag / ?search filters and the per-post
 * "show author" rule, so none of that is restated here or in the controller.
 *
 * Filters come off the page's own query string, so /blogs?tag=x is a real,
 * shareable URL and the server needs to know nothing about it.
 *
 * | attribute | role                          |
 * | per-page  | how many articles to request  |
 */
(function () {
    'use strict';

    if (window.customElements && customElements.get('custom-falak-blog-list')) return;

    class CustomFalakBlogList extends HTMLElement {
        connectedCallback() {
            if (!window.falak) return;
            window.falak.onReady(() => this.load());
        }

        async load() {
            const falak = window.falak;
            const query = new URLSearchParams(window.location.search);

            this.tag = query.get('tag');

            this.renderState('loading');

            try {
                /* 'blogs', NOT '/blogs'. helpers.url.api() returns any path
                   that already starts with a slash verbatim, so a leading one
                   fetches the storefront's own HTML index page instead of
                   /api/storefront/blogs — a 200 of text/html and no rows. */
                const response = await falak.api.request('blogs', {
                    params: {
                        per_page: Number(this.getAttribute('per-page')) || 24,
                        tag: this.tag,
                        category: query.get('category'),
                        search: query.get('search'),
                    },
                });

                /* The endpoint answers { success, data: <paginator> }, and the
                   client returns it as it came. Both shapes are read rather
                   than guessed at, so a change on either side degrades to an
                   empty grid instead of a thrown render. */
                const payload = (response && response.data) || response;
                this.posts = Array.isArray(payload) ? payload : ((payload && payload.data) || []);
                this.render();
            } catch (e) {
                falak.logger.warn('custom-falak-blog-list: fetch failed', e);
                this.renderState('error');
            }
        }

        renderState(state) {
            const t = key => window.falak.lang.get(key);

            /* The loading state is a row of card-shaped blanks rather than a
               spinner, so the page does not jump when the articles land. */
            if (state === 'loading') {
                this.innerHTML = '<div class="blog-grid">'
                    + new Array(3).fill('<div class="blog-card blog-card--skeleton" aria-hidden="true"></div>').join('')
                    + '</div>';
                return;
            }

            const message = document.createElement('p');
            message.className = 'blog-index__empty';
            message.textContent = state === 'error' ? t('blog.load_failed') : t('blog.none');

            this.innerHTML = '';
            this.appendChild(message);
        }

        render() {
            const falak = window.falak;

            if (!this.posts || !this.posts.length) {
                this.renderState('empty');
                return;
            }

            this.innerHTML = '';

            /* A filtered view says so, and offers the way back out. Rendered
               only when a tag is actually in play. */
            if (this.tag) {
                const filter = document.createElement('p');
                filter.className = 'blog-index__filter';
                filter.textContent = falak.lang.get('blog.tagged') + ' ';

                const strong = document.createElement('strong');
                strong.textContent = this.tag;
                filter.appendChild(strong);

                const clear = document.createElement('a');
                clear.href = '/blogs';
                clear.textContent = falak.lang.get('blog.clear_filter');
                filter.appendChild(clear);

                this.appendChild(filter);
            }

            const grid = document.createElement('div');
            grid.className = 'blog-grid';

            /* Cards are created as elements and handed their record as a
               property, so a headline with a quote in it never needs
               escaping twice. */
            this.posts.forEach(post => {
                const card = document.createElement('custom-falak-blog-card');
                card._post = post;
                grid.appendChild(card);
            });

            this.appendChild(grid);
        }
    }

    customElements.define('custom-falak-blog-list', CustomFalakBlogList);
})();

/*
 * <custom-falak-blog-article> — one article and its sidebar.
 *
 * Two calls to the endpoint that already existed:
 *   GET /blogs/{slug}   the article. This is also what bumps view_count —
 *                       the controller does it, so nothing here has to.
 *   GET /blogs          the sidebar. Scoped to the article's own category
 *                       when it has one, and falling back to the newest of
 *                       anything when that returns too little: a sidebar that
 *                       empties itself on a store with one post per category
 *                       is worse than a slightly loose match.
 *
 * | attribute | role                                  |
 * | slug      | the article to load, from the route   |
 */
(function () {
    'use strict';

    if (window.customElements && customElements.get('custom-falak-blog-article')) return;

    const RELATED = 4;

    class CustomFalakBlogArticle extends HTMLElement {
        connectedCallback() {
            if (!window.falak) return;
            window.falak.onReady(() => this.load());
        }

        escape(v) {
            return String(v ?? '').replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }

        async load() {
            const falak = window.falak;
            const slug = this.getAttribute('slug');

            try {
                /* withoutNotifier: a missing article is this page's own error
                   to render, not a toast in the corner of the screen. */
                const response = await falak.api.withoutNotifier(
                    () => falak.api.request('blogs/' + encodeURIComponent(slug))
                );

                this.post = (response && response.data) || response;
            } catch (e) {
                this.post = null;
            }

            if (!this.post || !this.post.id) {
                this.renderMissing();
                return;
            }

            this.render();
            /* Not awaited: the sidebar is a second request and the article
               must not wait on it to paint. */
            this.loadRelated();
        }

        async loadRelated() {
            const falak = window.falak;
            const category = this.post.category && this.post.category.slug;

            const fetchList = async params => {
                try {
                    const response = await falak.api.request('blogs', { params });
                    const payload = (response && response.data) || response;
                    return Array.isArray(payload) ? payload : ((payload && payload.data) || []);
                } catch (e) {
                    return [];
                }
            };

            const mine = row => row.id !== this.post.id;

            let rows = category
                ? (await fetchList({ per_page: RELATED + 1, category })).filter(mine)
                : [];

            if (rows.length < RELATED) {
                const seen = new Set(rows.map(row => row.id));
                const latest = (await fetchList({ per_page: RELATED + 1 })).filter(mine);

                latest.forEach(row => {
                    if (rows.length < RELATED && !seen.has(row.id)) {
                        seen.add(row.id);
                        rows.push(row);
                    }
                });
            }

            this.renderRelated(rows.slice(0, RELATED));
        }

        media(value) {
            var s = String(value || '').trim();
            if (!s) return null;
            if (/^(https?:)?[/][/]/i.test(s) || s.indexOf('data:') === 0) return s;
            if (s.charAt(0) === '/') return s;
            return '/storage/' + s.replace(/^[/]+/, '');
        }

        /* featured_image_url runs the stored value through the disk's url()
           unconditionally, which mangles a path that is already absolute into
           ".../storage/https://…". Absolute wins over the accessor. */
        image(row) {
            const stored = String(row.featured_image || '').trim();
            if (stored && /^(https?:)?[/][/]/i.test(stored)) return stored;
            return this.media(row.featured_image_url || stored);
        }

        date(value) {
            if (!value) return null;

            const parsed = new Date(value);
            if (isNaN(parsed.getTime())) return null;

            try {
                return new Intl.DateTimeFormat(
                    window.falak.lang.locale === 'ar' ? 'ar' : 'en-GB',
                    { day: 'numeric', month: 'long', year: 'numeric' }
                ).format(parsed);
            } catch (e) {
                return parsed.toISOString().slice(0, 10);
            }
        }

        /*
         * A category name is an {ar, en} pair, and the endpoint hands it over
         * as the raw column — a JSON STRING, not an object, because the model
         * has no cast for it. Printed as-is it reads {"ar": …, "en": …} on
         * the page, so it is parsed here and the current language picked;
         * a plain string passes straight through.
         */
        label(value) {
            let pair = value;

            if (typeof pair === 'string') {
                const trimmed = pair.trim();
                if (trimmed.charAt(0) !== '{') return trimmed;
                try { pair = JSON.parse(trimmed); } catch (e) { return trimmed; }
            }

            if (!pair || typeof pair !== 'object') return '';

            const locale = window.falak.lang.locale === 'ar' ? 'ar' : 'en';
            const other = locale === 'ar' ? 'en' : 'ar';

            return String(pair[locale] || pair[other] || Object.values(pair).find(Boolean) || '');
        }

        renderMissing() {
            const t = key => window.falak.lang.get(key);

            /* The theme's own empty state, with the way back to the index. */
            this.innerHTML =
                '<div class="empty-state">'
                    + '<div class="empty-state__icon" aria-hidden="true">📝</div>'
                    + '<p>' + this.escape(t('blog.not_found')) + '</p>'
                    + '<a class="btn btn--outline" href="/blogs">' + this.escape(t('blog.title')) + '</a>'
                + '</div>';
        }

        render() {
            const post = this.post;
            const t = key => window.falak.lang.get(key);
            const image = this.image(post);
            const published = this.date(post.published_at);
            const tags = Array.isArray(post.tags) ? post.tags : [];
            const category = post.category ? this.label(post.category.name) : '';

            this.innerHTML =
                '<div class="blog-post__grid">'
                    + '<article class="blog-post__main">'
                        + '<h1 class="blog-post__title">' + this.escape(post.title) + '</h1>'
                        + '<p class="blog-post__meta">'
                            + (published
                                ? '<span class="blog-post__meta-item">'
                                    + '<span class="blog-card__meta-glyph blog-card__meta-glyph--date" aria-hidden="true"></span>'
                                    + this.escape(published)
                                  + '</span>'
                                : '')
                            /* author_name arrives null when the merchant did
                               not opt in — the endpoint strips it. */
                            + (post.author_name
                                ? '<span class="blog-post__meta-item">'
                                    + '<span class="blog-card__meta-glyph blog-card__meta-glyph--user" aria-hidden="true"></span>'
                                    + this.escape(post.author_name)
                                  + '</span>'
                                : '')
                            + (category
                                ? '<a class="blog-post__meta-item blog-post__category" href="/blogs?category='
                                    + encodeURIComponent(post.category.slug || '') + '">'
                                    + this.escape(category)
                                  + '</a>'
                                : '')
                        + '</p>'
                        + (image
                            ? '<figure class="blog-post__figure">'
                                + '<img src="' + this.escape(image) + '" alt="'
                                + this.escape(post.featured_image_alt || post.title) + '">'
                              + '</figure>'
                            : '')
                        /* The article body is merchant HTML from the admin
                           editor, so it goes in as markup. It is the ONLY
                           unescaped value on this page; every other field is a
                           single-line column with no reason to carry tags. */
                        + '<div class="blog-post__body">' + (post.content || '') + '</div>'
                        + (tags.length
                            ? '<ul class="blog-post__tags">'
                                + tags.map(tag =>
                                    '<li><a href="/blogs?tag=' + encodeURIComponent(tag) + '">'
                                        + '<span class="blog-post__tag-glyph" aria-hidden="true"></span>'
                                        + this.escape(tag)
                                    + '</a></li>').join('')
                              + '</ul>'
                            : '')
                        /* The thread hangs off the article, inside the
                           content column — not the page — so it sits under the
                           tags and beside the sidebar rather than below it. */
                        + '<custom-falak-blog-comments slug="'
                            + this.escape(this.getAttribute('slug') || '') + '"></custom-falak-blog-comments>'
                    + '</article>'
                    /* Filled by loadRelated(), which is still in flight. */
                    + '<aside class="blog-post__aside" hidden>'
                        + '<h2 class="blog-post__aside-title">' + this.escape(t('blog.related')) + '</h2>'
                    + '</aside>'
                + '</div>';
        }

        renderRelated(rows) {
            const aside = this.querySelector('.blog-post__aside');
            if (!aside || !rows.length) return;

            aside.hidden = false;

            rows.forEach(row => {
                const image = this.image(row);
                const published = this.date(row.published_at);

                const card = document.createElement('a');
                card.className = 'blog-aside-card';
                card.href = '/blogs/' + (row.slug || '');
                card.innerHTML =
                    (image
                        ? '<span class="blog-aside-card__media">'
                            + '<img src="' + this.escape(image) + '" alt="'
                            + this.escape(row.featured_image_alt || row.title) + '" loading="lazy">'
                          + '</span>'
                        : '')
                    + '<span class="blog-aside-card__body">'
                        + (published
                            ? '<span class="blog-aside-card__date">'
                                + '<span class="blog-card__meta-glyph blog-card__meta-glyph--date" aria-hidden="true"></span>'
                                + this.escape(published)
                              + '</span>'
                            : '')
                        + '<span class="blog-aside-card__title">' + this.escape(row.title) + '</span>'
                    + '</span>';

                aside.appendChild(card);
            });
        }
    }

    customElements.define('custom-falak-blog-article', CustomFalakBlogArticle);
})();

/*
 * <custom-falak-blog-comments> — the article's comment thread and form.
 *
 * Reads GET /api/storefront/blogs/{slug}/comments, which is public, and posts
 * to POST /api/customer/blog-comments, which is not: that route sits behind
 * auth:sanctum + tenant.customer, so the author comes from the session and a
 * guest is offered the sign-in modal instead of a form that would fail on
 * submit — the same courtesy <falak-comments> extends for product reviews.
 *
 * The sign-in modal is already in the master layout (<falak-login-modal>) and
 * opens on the SDK's `login::open` bus event, so this element neither owns
 * nor imports one.
 *
 * | attribute | role                              |
 * | slug      | the article, from the page's route |
 */
(function () {
    'use strict';

    if (window.customElements && customElements.get('custom-falak-blog-comments')) return;

    class CustomFalakBlogComments extends HTMLElement {
        connectedCallback() {
            if (!window.falak) return;

            window.falak.onReady(() => {
                this.load();

                /* Signing in from the modal has to turn the prompt into a form
                   without a reload; signing out has to do the reverse. */
                this._offIn = window.falak.event.on('auth::logged.in', () => this.render());
                this._offOut = window.falak.event.on('auth::logged.out', () => this.render());
            });
        }

        disconnectedCallback() {
            if (typeof this._offIn === 'function') this._offIn();
            if (typeof this._offOut === 'function') this._offOut();
        }

        escape(v) {
            return String(v ?? '').replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }

        get slug() { return this.getAttribute('slug') || ''; }

        async load() {
            const falak = window.falak;

            try {
                const response = await falak.api.withoutNotifier(
                    () => falak.api.request('blogs/' + encodeURIComponent(this.slug) + '/comments', {
                        params: { per_page: 50 },
                    })
                );

                const payload = (response && response.data) || response;
                this.comments = Array.isArray(payload) ? payload : ((payload && payload.data) || []);
            } catch (e) {
                /* A thread that cannot be read is not a reason to hide the form:
                   the article is still there and a customer can still write. */
                falak.logger.warn('custom-falak-blog-comments: fetch failed', e);
                this.comments = [];
            }

            this.render();
        }

        date(value) {
            if (!value) return null;

            const parsed = new Date(value);
            if (isNaN(parsed.getTime())) return null;

            try {
                return new Intl.DateTimeFormat(
                    window.falak.lang.locale === 'ar' ? 'ar' : 'en-GB',
                    { day: 'numeric', month: 'long', year: 'numeric' }
                ).format(parsed);
            } catch (e) {
                return parsed.toISOString().slice(0, 10);
            }
        }

        /* The disc beside a comment: the author's first letter, because there
           are no customer avatars on this platform. */
        initial(name) {
            const trimmed = String(name || '').trim();
            return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
        }

        render() {
            const falak = window.falak;
            const t = key => falak.lang.get(key);
            const rows = this.comments || [];

            const list = rows.length
                ? '<ul class="blog-comments__list">'
                    + rows.map(row =>
                        '<li class="blog-comment">'
                            + '<span class="blog-comment__avatar" aria-hidden="true">'
                                + this.escape(this.initial(row.author_name))
                            + '</span>'
                            + '<div class="blog-comment__body">'
                                + '<p class="blog-comment__meta">'
                                    + '<span class="blog-comment__author">'
                                        + this.escape(row.author_name || t('blog.comment_anonymous'))
                                    + '</span>'
                                    + (this.date(row.created_at)
                                        ? '<span class="blog-comment__date">' + this.escape(this.date(row.created_at)) + '</span>'
                                        : '')
                                + '</p>'
                                /* Shopper-written text. Escaped, never markup —
                                   this is the one field on the article that did
                                   not come from the merchant. */
                                + '<p class="blog-comment__text">' + this.escape(row.comment) + '</p>'
                            + '</div>'
                        + '</li>').join('')
                  + '</ul>'
                : '<p class="blog-comments__empty">' + this.escape(t('blog.comments_none')) + '</p>';

            const form = falak.auth.isLoggedIn()
                ? '<form class="blog-comments__form">'
                    + '<textarea class="blog-comments__input" name="comment" rows="4" maxlength="2000"'
                        + ' placeholder="' + this.escape(t('blog.comment_placeholder')) + '" required></textarea>'
                    + '<p class="blog-comments__status" role="status" hidden></p>'
                    + '<button type="submit" class="btn btn--primary blog-comments__submit">'
                        + this.escape(t('blog.comment_submit'))
                    + '</button>'
                  + '</form>'
                : '<div class="blog-comments__signin">'
                    + '<p>' + this.escape(t('blog.comment_signin')) + '</p>'
                    + '<button type="button" class="btn btn--primary blog-comments__signin-btn">'
                        + this.escape(t('auth.login'))
                    + '</button>'
                  + '</div>';

            this.innerHTML =
                '<section class="blog-comments">'
                    + '<h2 class="blog-comments__title">'
                        + this.escape(t('blog.comments'))
                        + (rows.length ? ' <span class="blog-comments__count">' + rows.length + '</span>' : '')
                    + '</h2>'
                    + list
                    + form
                + '</section>';

            this.wire();
        }

        wire() {
            const falak = window.falak;

            const signin = this.querySelector('.blog-comments__signin-btn');
            if (signin) {
                signin.addEventListener('click', () => falak.event.dispatch('login::open'));
                return;
            }

            const form = this.querySelector('.blog-comments__form');
            if (!form) return;

            form.addEventListener('submit', async event => {
                event.preventDefault();

                const input = form.querySelector('.blog-comments__input');
                const button = form.querySelector('.blog-comments__submit');
                const status = form.querySelector('.blog-comments__status');
                const comment = String(input.value || '').trim();

                if (comment.length < 2) return;

                /* Disabled for the whole round trip: a double submit is two
                   identical comments, and the endpoint has no idempotency key
                   to fold them back together. */
                button.disabled = true;
                status.hidden = true;

                try {
                    /* Absolute, unlike the reads: url.api() prefixes bare
                       paths with /api/storefront, and the authenticated
                       customer group lives at /api/customer — which is why the
                       SDK's own auth calls are written this way too. */
                    const response = await falak.api.request('/api/customer/blog-comments', {
                        method: 'post',
                        body: { slug: this.slug, comment },
                    });

                    const created = (response && response.data) || response;

                    input.value = '';

                    /* Appended from the response rather than re-fetching the
                       thread — and only when the server says it is visible, so
                       a future "hold for moderation" setting does not make this
                       element lie about what other people can see. */
                    if (created && created.is_approved === false) {
                        status.textContent = falak.lang.get('blog.comment_pending');
                        status.hidden = false;
                    } else {
                        this.comments = (this.comments || []).concat(created || []);
                        this.render();
                    }
                } catch (e) {
                    status.textContent = falak.lang.get('blog.comment_failed');
                    status.hidden = false;
                } finally {
                    if (button.isConnected) button.disabled = false;
                }
            });
        }
    }

    customElements.define('custom-falak-blog-comments', CustomFalakBlogComments);
})();

/*
 * <custom-falak-testimonials> — the testimonials block's "real reviews" source.
 *
 * Reads GET /api/storefront/reviews, the store-wide endpoint that already
 * existed. It owns the enable_reviews switch and the per-review review_visible
 * opt-in, so neither is restated here: a store with reviews turned off gets an
 * empty list and this element hides the whole section rather than printing
 * "no reviews yet" on a shop's home page.
 *
 * It builds the SAME .testimonial-card figures the block's manual branch
 * writes in Twig, so a quote looks identical whichever source it came from —
 * the grid, not onyx's slider, because that is this theme's testimonials.
 *
 * Lives in app.js rather than home.js because the block is placeable on
 * merchant pages too, and home.js only loads on the home page.
 *
 * | attribute  | role                                        |
 * | limit      | how many reviews to request                 |
 * | show-stars | present = the star row renders (the block's |
 * |            | show_stars switch, applied to fetched rows) |
 */
(function () {
    'use strict';

    if (window.customElements && customElements.get('custom-falak-testimonials')) return;

    class CustomFalakTestimonials extends HTMLElement {
        connectedCallback() {
            if (!window.falak) return;
            window.falak.onReady(() => this.load());
        }

        escape(v) {
            return String(v ?? '').replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }

        async load() {
            const falak = window.falak;
            const limit = Number(this.getAttribute('limit')) || 6;

            /* Card-shaped blanks rather than a spinner, so the band holds its
               height and the page does not jump when the reviews land — the
               same loading state the blog grid uses. */
            this.innerHTML = '<div class="testimonials-grid">'
                + new Array(Math.min(limit, 3)).fill(
                    '<div class="testimonial-card testimonial-card--skeleton" aria-hidden="true"></div>'
                ).join('')
                + '</div>';

            try {
                /* 'reviews', not '/reviews': url.api() returns a leading-slash
                   path verbatim and would fetch a storefront page. */
                const response = await falak.api.withoutNotifier(() => falak.api.request('reviews', {
                    params: { per_page: limit },
                }));

                /* This endpoint answers { reviews: [...], pagination: {...} } —
                   its own shape, not the { success, data } envelope the blog
                   endpoints use. Read both rather than assume either. */
                this.reviews = (response && (response.reviews || response.data)) || [];
                if (!Array.isArray(this.reviews)) this.reviews = [];
            } catch (e) {
                falak.logger.warn('custom-falak-testimonials: fetch failed', e);
                this.reviews = [];
            }

            this.render();
        }

        render() {
            const falak = window.falak;
            const showStars = this.hasAttribute('show-stars');

            /*
             * Nothing to show is a reason to remove the whole block, heading
             * and all. The section is this element's grandparent:
             * <section><div class="container"> … this.
             */
            if (!this.reviews.length) {
                this.innerHTML = '';

                const section = this.closest('.block--testimonials');
                if (section) section.hidden = true;
                return;
            }

            this.innerHTML = '<div class="testimonials-grid">'
                + this.reviews.map((row) => {
                    /* customer_name is nullable on the endpoint — a guest
                       checkout has no customer row behind it — so the fallback
                       is a label, never an empty byline. */
                    const name = row.customer_name || falak.lang.get('product.anonymous');
                    const text = row.review_comment || '';
                    const rating = Math.min(5, Math.round(Number(row.review_rating) || 0));

                    return '<figure class="testimonial-card">'
                        + (showStars && rating > 0
                            ? '<div class="testimonial-card__stars" aria-label="' + rating + '/5">'
                                + new Array(rating).fill('★').join('')
                              + '</div>'
                            : '')
                        + (text ? '<blockquote>' + this.escape(text) + '</blockquote>' : '')
                        + '<figcaption>' + this.escape(name) + '</figcaption>'
                    + '</figure>';
                }).join('')
                + '</div>';
        }
    }

    customElements.define('custom-falak-testimonials', CustomFalakTestimonials);
})();

/*
    Search dropdown — the desktop design: pill field with a clear ×, a
    "Products / N results" line over the list, each result a card row with a
    quick-add button and a chevron, and a full-width dark "view all" pill.

    <falak-search> stays the SDK's — trigger, modal, fetch, debounce, the
    race guard and reset-on-close are all untouched. The design just needs
    markup the SDK does not render, so the three markup-producing methods on
    its prototype are re-pointed here (keeping every SDK class, data-
    attribute and event, so the SDK's own delegated listeners and CSS still
    apply); app.css carries the look.

    The extra markup MUST come from these overrides rather than from edits
    to the live tree: <falak-modal> snapshots its children on first render
    and rebuilds them from that snapshot on every open/close, so anything
    inserted afterwards is wiped at the next toggle. Listeners for the new
    controls are delegated on the <falak-search> element itself for the same
    reason.
*/
(function () {
    'use strict';

    if (!window.customElements || !customElements.whenDefined) return;

    customElements.whenDefined('falak-search').then(function () {
        const Search = customElements.get('falak-search');
        const proto = Search.prototype;

        if (proto._theme2026Search) return;
        proto._theme2026Search = true;

        /* ------------------------------------------- field: the clear × */

        proto.render = function () {
            this.classList.add('f-search');

            this.innerHTML = `
                <button type="button" class="f-search__trigger" data-search-open aria-label="${this.escape(this.trans('search.title'))}">
                    ${Search.ICON}
                </button>
                <falak-modal id="falak-search" width="lg" position="top" no-padding>
                    <div class="f-search__panel">
                        <form class="f-search__form" data-search-form novalidate>
                            <span class="f-search__icon" aria-hidden="true">${Search.ICON}</span>
                            <input class="f-search__input" type="search" name="q" data-search-input
                                   placeholder="${this.escape(this.trans('search.placeholder'))}"
                                   autocomplete="off" spellcheck="false">
                            <button type="button" class="f-search__clear" data-search-clear
                                    aria-label="${this.escape(this.trans('search.clear'))}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                            </button>
                        </form>
                        <div class="f-search__results" data-search-results hidden></div>
                    </div>
                </falak-modal>`;

            this._modal = this.querySelector('falak-modal');
        };

        const baseAfterRender = proto.afterRender;
        proto.afterRender = function () {
            baseAfterRender.call(this);

            if (this._clearWired) return;
            this._clearWired = true;

            this.listen(this, 'click', (event) => {
                if (!event.target.closest('[data-search-clear]')) return;

                const input = this.querySelector('[data-search-input]');
                if (!input) return;

                input.value = '';
                /* Through the SDK's own input path (bubbling), so its
                   debounce is cancelled and the result list emptied the
                   same way typing backspace-to-nothing would. */
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.focus();
            });
        };

        /* --------------------------- rows: quick-add button + chevron */

        proto.resultHtml = function (product) {
            const locale = this.sdk.lang.locale;
            const name = (locale === 'ar' && product.name_ar) ? product.name_ar : product.name;

            const list = Number(product.price_cents ?? 0);
            const discount = Number(product.discount_price_cents ?? 0);
            const onSale = discount > 0 && discount < list;
            const price = onSale ? discount : list;

            const image = product.images?.[0]?.url
                || product.images?.[0]?.image_path
                || this.sdk.config.get('store.placeholders.product')
                || null;
            const url = this.sdk.url.product(product.id);

            /*
             * Stock and variants, read the way <falak-product-card> reads
             * the same API row: the server's resolved `in_stock` when sent,
             * else the row itself — and a variant product is decided by its
             * variants alone, never by its own product-level quantity.
             */
            const hasOptions = Array.isArray(product.variations) && product.variations.length > 0;
            const inStock = product.in_stock !== undefined
                ? !!product.in_stock
                : (!!product.allow_backorders || (hasOptions
                    ? product.variations.some((v) => v.quantity === null || v.quantity === undefined || Number(v.quantity) > 0)
                    : (product.quantity === null || product.quantity === undefined || Number(product.quantity) > 0)));

            return `
                <li class="f-search__item">
                    <a class="f-search__link" href="${this.escape(url)}" data-search-result>
                        <span class="f-search__thumb">
                            ${image
                                ? `<img src="${this.escape(image)}" alt="" loading="lazy" decoding="async">`
                                : `<span class="f-search__thumb-placeholder"></span>`}
                        </span>
                        <span class="f-search__info">
                            <span class="f-search__name">${this.escape(name || '')}</span>
                            <span class="f-search__price">
                                <span class="f-search__price-now">${this.escape(this.money(price, product.currency))}</span>
                                ${onSale ? `<del class="f-search__price-was">${this.escape(this.money(list, product.currency))}</del>` : ''}
                            </span>
                        </span>
                    </a>
                    <falak-add-product-button product-id="${product.id}"
                                              product-status="${inStock ? 'sale' : 'out'}"
                                              ${hasOptions ? 'has-options' : ''}
                                              product-name="${this.escape(name || '')}"
                                              product-image="${this.escape(image || '')}"
                                              product-price="${this.escape(this.money(price, product.currency))}"
                                              product-price-amount="${this.escape(price)}"
                                              ${onSale ? `product-compare-price="${this.escape(list)}"` : ''}
                                              ${product.currency ? `product-currency="${this.escape(product.currency)}"` : ''}
                                              product-url="${this.escape(url)}"
                                              product-in-stock="${inStock ? 'true' : 'false'}"
                                              button-class="f-search__add-btn"
                                              source="search">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                    </falak-add-product-button>
                    <span class="f-search__chevron" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </span>
                </li>`;
        };

        /* -------------------------- "Products / N results" over the list */

        const baseShowResults = proto.showResults;
        proto.showResults = function (products) {
            baseShowResults.call(this, products);

            if (!Array.isArray(products) || !products.length) return;

            const host = this.querySelector('[data-search-results]');
            const listEl = host && host.querySelector('.f-search__list');
            if (!listEl) return;

            const count = products.length;
            const countText = count === 1
                ? this.trans('search.one_result')
                : this.trans('search.results_count', { count: count });

            listEl.insertAdjacentHTML('beforebegin', `
                <div class="f-search__meta">
                    <span class="f-search__meta-label">${this.escape(this.trans('search.products'))}</span>
                    <span class="f-search__meta-count">${this.escape(countText)}</span>
                </div>`);
        };

        /* An instance that upgraded before this patch ran already rendered
           the SDK markup — re-render it (idempotent at page load: the modal
           is closed and no query is in flight; the SDK's _wired guard keeps
           listeners single). */
        document.querySelectorAll('falak-search').forEach(function (el) {
            if (!el.isConnected || typeof el.render !== 'function') return;
            try {
                el.render();
                el.afterRender();
            } catch (e) {
                /* leave that instance on the SDK's own rendering */
            }
        });
    });
})();

/* ======================================================================
   Footer categories — "show more"
   ----------------------------------------------------------------------
   The footer caps a long categories list: the rows past the cap ship as
   hidden <li data-footer-extra> and the button under the list reveals
   them, swapping its label to "show less".
   ====================================================================== */
(function () {
    'use strict';

    function init() {
        document.querySelectorAll('.site-footer [data-footer-more]').forEach(function (button) {
            button.addEventListener('click', function () {
                var expanded = button.getAttribute('aria-expanded') === 'true';
                var group = button.closest('.site-footer__group');
                if (!group) return;

                group.querySelectorAll('[data-footer-extra]').forEach(function (item) {
                    item.hidden = expanded;
                });

                button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                var more = button.querySelector('[data-more-label]');
                var less = button.querySelector('[data-less-label]');
                if (more) more.hidden = !expanded;
                if (less) less.hidden = expanded;
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/* ---------------------------------------------- self-free product rails */

/*
 * A product page must not suggest the product already on screen. The rails
 * are the SDK's generic listing components, and the listing endpoints never
 * know which product the shopper is viewing — "the newest of the category"
 * regularly includes it.
 *
 * Any <falak-products-list> / <falak-products-slider> carrying
 * data-exclude-product="<id>" gets that product dropped here. Both
 * components dispatch their bubbling `fetched` event synchronously BEFORE
 * they render, and `detail.products` is the very array they render from,
 * so editing it in place is invisible — no re-render, no flicker.
 *
 * data-max-cards then trims back to the count the layout was designed for:
 * the template asks the endpoint for one extra product, so the rail stays
 * full when the current product was in the window and does not grow when
 * it was not.
 */
(function () {
    'use strict';

    document.addEventListener('fetched', function (event) {
        var host = event.target;
        if (!host || !host.getAttribute) return;

        var exclude = host.getAttribute('data-exclude-product');
        var products = event.detail && event.detail.products;
        if (!exclude || !Array.isArray(products)) return;

        for (var i = products.length - 1; i >= 0; i--) {
            if (String(products[i].id) === exclude) products.splice(i, 1);
        }

        var max = parseInt(host.getAttribute('data-max-cards') || '', 10);
        if (max > 0 && products.length > max) products.length = max;
    });
})();

/* ----------------------------------------------- products-slider view-all */

/*
 * The products carousel renders its "view all" link hidden, because only the
 * slider knows how many products match. `detail.total` is the full count
 * before the limit slice, so the link appears only when there is more to see
 * than the threshold (data-view-all-min) — a store with eight products or
 * fewer has nothing behind the link.
 */
(function () {
    'use strict';

    document.addEventListener('fetched', function (event) {
        var host = event.target;
        if (!host || host.localName !== 'falak-products-slider') return;

        var section = host.closest('.block--products-slider');
        var link = section && section.querySelector('.products-slider__all[data-view-all-min]');
        if (!link) return;

        var min = parseInt(link.getAttribute('data-view-all-min'), 10) || 0;
        var total = Number(event.detail && event.detail.total) || 0;
        link.hidden = total <= min;
    });
})();

/*
 * Announcement marquee — seamless repeat.
 *
 * The SDK scrolls merchant declarations whatever their length, over a track
 * that holds the message twice and travels half its width. That is only
 * continuous while one message is wider than the strip; a short message on a
 * wide screen left most of the bar empty and jumped when the loop restarted.
 *
 * Repeat the message until the track covers the bar plus one spare copy,
 * then hand app.css one copy's width as --announce-step. The loop travels
 * exactly that, so the frame it ends on is the frame it began on: the text
 * runs unbroken with no gap and no visible restart. The duration comes from
 * the step at the SDK's own 60px/s, so the speed does not change with the
 * number of copies.
 *
 * The component renders after its SDK setup resolves, and re-renders when
 * the message changes, so the build runs off an observer — detached while
 * cloning, since the clones are themselves childList mutations.
 */
(function () {
    'use strict';

    const SPEED = 60; // px/s — the SDK's own marquee speed
    const bar = document.querySelector('falak-announcement');
    if (!bar) return;

    const observer = new MutationObserver(() => build());

    const watch = () => observer.observe(bar, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
    });

    function build() {
        if (!bar.classList.contains('f-announce--scroll')) return;

        const inner = bar.querySelector('.f-announce__inner');
        const track = bar.querySelector('.f-announce__track');
        if (!inner || !track || !track.children.length) return;

        const original = track.children[0];
        // Includes the SDK's 4rem trailing pad, which is the gap between
        // repeats — so one step carries the message and its separator.
        const step = original.getBoundingClientRect().width;
        // Zero while the webfont is still loading; a later pass retries.
        if (!step) return;

        // The bar plus one spare copy: no frame of the loop can show a gap.
        const needed = Math.ceil(inner.clientWidth / step) + 1;

        if (track.children.length !== needed) {
            observer.disconnect();

            while (track.children.length > 1) track.lastElementChild.remove();
            for (let i = 1; i < needed; i++) {
                const copy = original.cloneNode(true);
                // The repeats are decoration; one reading is enough.
                copy.setAttribute('aria-hidden', 'true');
                track.appendChild(copy);
            }

            watch();
        }

        track.style.setProperty('--announce-step', step + 'px');
        track.style.setProperty('--announce-chain-duration', step / SPEED + 's');
    }

    watch();
    window.addEventListener('resize', build);
    build();
    // The strip is measured in the theme font; a late swap changes the step.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
})();

/*
 * Expired offer countdowns.
 *
 * The server already drops a section whose `ends_at` has passed (see
 * offer-countdown.twig). This is the page that is open when the moment
 * arrives: <falak-countdown> fires `ended` once and would otherwise sit there
 * as a row of zeros under "offer ends in". Live pages only: the customizer
 * preview renders the section flagged instead, so it carries no
 * data-countdown-hide-on-end and keeps showing the merchant what happened.
 */
(function () {
    'use strict';

    var CLOCKS = 'falak-countdown, falak-count-down';

    function hide(clock) {
        var block = clock.closest('[data-countdown-hide-on-end]');
        if (block) block.classList.add('is-ended');
    }

    document.addEventListener('ended', function (event) {
        var clock = event.target;
        if (clock && clock.matches && clock.matches(CLOCKS)) hide(clock);
    });

    /* A clock whose moment had passed by the time it first rendered fired
       `ended` during its upgrade, possibly before this deferred script was
       listening — the SDK records that as data-ended on the element. */
    Array.prototype.forEach.call(
        document.querySelectorAll('[data-countdown-hide-on-end] falak-countdown, [data-countdown-hide-on-end] falak-count-down'),
        function (clock) {
            if (clock.ended === true || clock.getAttribute('data-ended') === 'true') hide(clock);
        }
    );
})();
