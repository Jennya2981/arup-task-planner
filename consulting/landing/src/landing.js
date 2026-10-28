/* ═══════════════════════════════════════════════════════════════
   AR LANDING — поведение страницы
   Настройки лежат в window.AR_POPUP / window.AR_IMG (см. шапку сниппета).
   Без библиотек. Если JS не загрузился — контент остаётся видимым.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var root = document.querySelector(".ar-landing");
  if (!root) return;

  var POPUP_ID = (window.AR_POPUP || "zayavka").replace(/^#?popup:?/, "");
  var IMAGES = window.AR_IMG || {};

  /* ── 1. Кнопки и попап Tilda ──────────────────────────────── */

  var ctas = root.querySelectorAll("[data-ar-cta]");

  function popupExists(id) {
    return !!document.querySelector('[id="popup:' + id + '"]');
  }

  // Свой плавный скролл: scrollIntoView({behavior:"smooth"}) не везде работает,
  // а window.scrollTo — стабильно. Отступ учитывает закреплённую шапку Tilda.
  function scrollToElement(target) {
    if (!target) return;
    var header = document.querySelector(".t-header, #t-header, .t199__header");
    var headerOffset = header ? Math.min(header.getBoundingClientRect().height, 140) : 84;
    var top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;
    if (top < 0) top = 0;
    if ("scrollBehavior" in document.documentElement.style) {
      window.scrollTo({ top: top, behavior: "smooth" });
    } else {
      window.scrollTo(0, top);
    }
  }

  function scrollToFinal(event) {
    var target = root.querySelector("[data-ar-final]");
    if (!target) return;
    event.preventDefault();
    scrollToElement(target);
    var firstControl = target.querySelector("a, button");
    if (firstControl) firstControl.focus({ preventScroll: true });
  }

  Array.prototype.forEach.call(ctas, function (cta) {
    cta.setAttribute("href", "#popup:" + POPUP_ID);
    cta.addEventListener("click", function (event) {
      if (!popupExists(POPUP_ID)) scrollToFinal(event);
    });
  });

  /* ── 2. Картинки из настроек ──────────────────────────────── */

  Array.prototype.forEach.call(root.querySelectorAll("[data-ar-img]"), function (img) {
    var key = img.getAttribute("data-ar-img");
    var url = IMAGES[key];
    if (!url) return;
    img.setAttribute("src", url);
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    var frame = img.closest(".ar-plate__frame, .ar-final__frame");
    if (frame) frame.removeAttribute("data-ar-empty");
  });

  /* ── 3. Плавный скролл по внутренним ссылкам ──────────────── */

  Array.prototype.forEach.call(root.querySelectorAll("[data-ar-scroll]"), function (link) {
    link.addEventListener("click", function (event) {
      var hash = link.getAttribute("href") || "";
      var target = hash.charAt(0) === "#" ? root.querySelector(hash) : null;
      if (!target) return;
      event.preventDefault();
      scrollToElement(target);

      if (history.replaceState) {
        history.replaceState(null, "", hash);
      }
    });
  });

  /* ── 4. FAQ-аккордеон ─────────────────────────────────────── */

  Array.prototype.forEach.call(root.querySelectorAll(".ar-faq__btn"), function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".ar-faq__item");
      if (!item) return;
      var isOpen = item.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  });

  /* ── 5. Мягкое появление блоков ───────────────────────────── */

  var revealItems = root.querySelectorAll("[data-ar-reveal]");

  function showAll() {
    Array.prototype.forEach.call(revealItems, function (item) {
      item.classList.add("is-in");
    });
  }

  var reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!("IntersectionObserver" in window) || reduced) {
    showAll();
  } else {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
    );

    Array.prototype.forEach.call(revealItems, function (item) {
      observer.observe(item);
    });
  }

  /* ── 6. Метка «страница готова» ───────────────────────────── */

  root.setAttribute("data-ar-ready", "true");
})();
