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

        function restart() {
            if (timer) window.clearInterval(timer);
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            timer = window.setInterval(function () { show(current + 1); }, 5000);
        }

        restart();
    });
})();
