/*
    Falak Theme 2026 — site-wide behavior.

    The platform injects `window.Falak.boot` ({storeId, locale, cartCount}) at
    body:end. The full FalakSDK (cart mutations etc.) arrives in a later platform
    phase, so every commerce action here degrades gracefully: it emits a
    `falak:cart:add` CustomEvent for the SDK to pick up when it exists, and gives
    the shopper immediate visual feedback either way.
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

    // Dropdown submenus are handled inline in master.twig — see the comment
    // there. Keeping them out of this file avoids double-toggling.

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

    /* ------------------------------------------------------- add to cart */

    document.addEventListener('click', function (event) {
        var button = event.target.closest('[data-add-to-cart]');
        if (!button) return;

        var qtyInput = document.querySelector('[data-qty-input]');
        var detail = {
            productId: Number(button.getAttribute('data-product-id')),
            quantity: qtyInput ? Math.max(1, Number(qtyInput.value) || 1) : 1
        };

        // The SDK contract: listen for this event and perform the mutation.
        document.dispatchEvent(new CustomEvent('falak:cart:add', { detail: detail }));

        // Optimistic feedback so the button never feels dead.
        var label = button.querySelector('[data-label]') || button;
        var original = label.textContent;
        button.classList.add('is-added');
        button.disabled = true;
        label.textContent = button.getAttribute('data-added-text') || original;

        window.setTimeout(function () {
            button.classList.remove('is-added');
            button.disabled = false;
            label.textContent = original;
        }, 1600);
    });

    /* ------------------------------------------------------ qty stepper */

    document.addEventListener('click', function (event) {
        var step = event.target.closest('[data-qty-step]');
        if (!step) return;

        var input = document.querySelector('[data-qty-input]');
        if (!input) return;

        var next = (Number(input.value) || 1) + Number(step.getAttribute('data-qty-step'));
        input.value = Math.max(1, next);
    });

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
})();
