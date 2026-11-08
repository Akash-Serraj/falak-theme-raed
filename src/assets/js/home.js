/*
    Falak Theme 2026 — home page behavior: hero slider rotation + dots, and
    the slides' background clips.
    Respects prefers-reduced-motion by not auto-rotating and by leaving every
    background video on its poster.
*/
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* Same "phone" as the <picture> source and the --mobile-only CSS in
       enhanced-slider.twig / app.css, so the three never disagree. */
    var isPhone = window.matchMedia('(max-width: 767px)').matches;

    document.querySelectorAll('.hero-slider').forEach(function (slider) {
        var slides = slider.querySelectorAll('.hero-slider__slide');
        if (!slides.length) return;

        var dotsWrap = slider.querySelector('.hero-slider__dots');
        var current = 0;
        var timer = null;

        /*
         * Each clip ships without a `src`: the template resolves the
         * per-viewport fallbacks (own video → own image → the other
         * viewport's media) into data-hero-src / data-hero-src-mobile, and
         * the pick here is strict — no attribute for this viewport means it
         * shows the <picture> instead, and fetching anyway would pull a file
         * a display:none element never plays. Chosen once: a <source media>
         * on a <video> is evaluated at load and never re-read, so a resize
         * would not swap it either.
         *
         * The phone poster is swapped before the reduced-motion exit on
         * purpose: a visitor who gets no video still gets the portrait still
         * the merchant uploaded for phones.
         */
        slider.querySelectorAll('[data-hero-video]').forEach(function (video) {
            var posterMobile = video.getAttribute('data-hero-poster-mobile');
            if (isPhone && posterMobile) video.setAttribute('poster', posterMobile);

            if (reduceMotion) return;   // poster stays, no download

            var src = isPhone
                ? video.getAttribute('data-hero-src-mobile')
                : video.getAttribute('data-hero-src');
            if (src) video.src = src;
        });

        /*
         * A slide's background clip runs only while that slide is on screen.
         * The other slides are display:none, which hides a <video> but does
         * not stop it, so each one is paused explicitly and only the active
         * one is played (the markup autoplays just the first). Under reduced
         * motion nothing plays: the poster, the slide's own image, stands in.
         *
         * play() returns a promise that rejects when the browser declines
         * (a policy, or a pause that beat it); the poster covers that case,
         * so the rejection is swallowed rather than logged as an error.
         */
        function syncVideos() {
            slides.forEach(function (slide, i) {
                var video = slide.querySelector('.hero-slider__video');
                if (!video) return;

                if (i !== current || reduceMotion) {
                    video.pause();
                    return;
                }

                var playing = video.play();
                if (playing && typeof playing.catch === 'function') playing.catch(function () {});
            });
        }

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

            syncVideos();
        }

        syncVideos();

        if (slides.length < 2) return;

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
            if (reduceMotion) return;
            timer = window.setInterval(function () { show(current + 1); }, delay);
        }

        restart();
    });
})();
