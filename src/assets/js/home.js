/*
    Falak Theme 2026 — home page behavior: hero slider rotation + dots.
    Respects prefers-reduced-motion by not auto-rotating.
*/
(function () {
    'use strict';

    document.querySelectorAll('.hero-slider').forEach(function (slider) {
        var slides = slider.querySelectorAll('.hero-slider__slide');
        if (slides.length < 2) return;

        var dotsWrap = slider.querySelector('.hero-slider__dots');
        var current = 0;
        var timer = null;

        function show(index) {
            current = (index + slides.length) % slides.length;

            slides.forEach(function (slide, i) {
                slide.classList.toggle('is-active', i === current);
            });

            if (dotsWrap) {
                dotsWrap.querySelectorAll('.hero-slider__dot').forEach(function (dot, i) {
                    dot.classList.toggle('is-active', i === current);
                });
            }
        }

        if (dotsWrap) {
            dotsWrap.addEventListener('click', function (event) {
                var dot = event.target.closest('[data-slide-to]');
                if (!dot) return;
                show(Number(dot.getAttribute('data-slide-to')));
                restart();
            });
        }

        slider.querySelectorAll('[data-slide-dir]').forEach(function (arrow) {
            arrow.addEventListener('click', function () {
                show(current + Number(arrow.getAttribute('data-slide-dir')));
                restart();
            });
        });

        /*
         * How fast the carousel advances, in milliseconds, or 0 for not at all.
         *
         * Read off the element rather than hard-coded, so the merchant's
         * "Advance slides automatically" switch and its speed actually reach
         * the behaviour. Missing attribute falls back to the old 5s, which is
         * what a slide placed before those settings existed should keep doing.
         *
         * A missing or empty attribute is NOT zero. Number(null) and Number('')
         * are both 0, which would read as "never advance" and silently stop any
         * slider that predates these settings.
         */
        var raw = slider.getAttribute('data-autoplay');
        var delay = raw === null || raw === '' ? 5000 : Number(raw);
        if (!Number.isFinite(delay) || delay < 0) delay = 5000;

        function restart() {
            if (timer) window.clearInterval(timer);
            if (delay === 0) return;
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            timer = window.setInterval(function () { show(current + 1); }, delay);
        }

        restart();
    });
})();
