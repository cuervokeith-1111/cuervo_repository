/* ==========================================================================
   animations.js — driver for animations.css
   --------------------------------------------------------------------------
   Loaded after script.js. Every effect here is additive: it only toggles
   classes or sets custom properties on elements that style.css does not
   already animate, and it bails out early when the user prefers reduced
   motion.
   ========================================================================== */

(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* The hero name is the single most important thing on the page, so it is
     never left blank: it is typed by a timer, not requestAnimationFrame, and a
     failsafe always completes it even if timers are throttled. Browsers and
     embedded webviews disagree about prefers-reduced-motion often enough that
     gating this on it left the heading silently inert, so the effect runs by
     default and ?motion=off is the way to switch it off. */
  const motionFlag = new URLSearchParams(location.search).get("motion");
  const reduced = () => motionFlag === "off";

  /* Published on <html> so the stylesheets' reduced-motion blocks can stand
     down too. Those blocks used to switch animations off on their own, so the
     JS effects ran while the CSS ones stayed dead — the chat panel opened
     without its animation even though the typewriter worked. Now both sides
     read the same single decision. */
  document.documentElement.dataset.motion = reduced() ? "off" : "on";

  /* ------------------------------------------------------------------ */
  /* 1. Typewriter effect on the hero eyebrow                            */
  /* ------------------------------------------------------------------ */
  const eyebrow = document.querySelector(".eyebrow");
  if (eyebrow && !reduced()) {
    const text = eyebrow.textContent;
    eyebrow.setAttribute("aria-label", text);
    eyebrow.classList.add("typewriter");
    eyebrow.textContent = "";

    let i = 0;
    const tick = () => {
      // typing a couple of chars per frame is smooth without a library
      i = Math.min(text.length, i + 2);
      eyebrow.textContent = text.slice(0, i);
      if (i < text.length) {
        setTimeout(tick, 45);
      } else {
        setTimeout(() => eyebrow.classList.add("done"), 400);
      }
    };
    setTimeout(tick, 45);
  }

  /* ------------------------------------------------------------------ */
  /* 1b. Typewriter on the hero name                                     */
  /* ------------------------------------------------------------------ */
  /* The heading is a text node plus a gradient <span>, so this types across
     both instead of swapping innerHTML — that would discard the span and take
     the gradient with it. Timing is duration-based so the speed does not
     change with the frame rate. */
  const heading = document.querySelector(".intro h1");
  const nameEl = heading ? heading.querySelector("span") : null;
  const prefixNode = heading ? heading.firstChild : null;

  if (heading && nameEl && prefixNode && prefixNode.nodeType === 3 && !reduced()) {
    const prefix = prefixNode.nodeValue;
    const full = prefix + nameEl.textContent;

    // keep the full name available to screen readers while it types out
    heading.setAttribute("aria-label", full);

    prefixNode.nodeValue = "";
    nameEl.textContent = "";
    nameEl.classList.add("tw-caret");

    const show = count => {
      const head = full.slice(0, count);
      prefixNode.nodeValue = head.slice(0, prefix.length);
      nameEl.textContent = head.slice(prefix.length);
    };

    const DURATION = full.length * 52;
    const START_AFTER = 950; // let the eyebrow get going first

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      show(full.length);
      nameEl.classList.remove("tw-caret");
    };

    setTimeout(() => {
      if (done) return;
      const startedAt = performance.now();

      /* Driven by setTimeout rather than requestAnimationFrame on purpose.
         rAF is paused outright whenever the page is hidden or rendered in a
         context that does not run frames, and the name has already been
         emptied above — so an rAF loop left the heading permanently blank.
         Timers keep running (throttled at worst) and, because the progress is
         measured against elapsed time, the typing speed is identical either
         way. */
      const step = () => {
        if (done) return;
        const p = Math.min(Math.max((performance.now() - startedAt) / DURATION, 0), 1);
        show(Math.ceil(p * full.length));

        if (p < 1) {
          setTimeout(step, 32);
        } else {
          finish();
        }
      };

      step();

      // last-resort guard in case timers are throttled hard
      setTimeout(finish, DURATION + 1500);
    }, START_AFTER);
  }

  /* ------------------------------------------------------------------ */
  /* 2. Floating shapes behind the hero                                  */
  /* ------------------------------------------------------------------ */
  if (!reduced()) {
    const shapes = [
      { cls: "hero-decor--a" },
      { cls: "hero-decor--b" },
      { cls: "hero-decor--c" }
    ];

    shapes.forEach(({ cls }) => {
      const dot = document.createElement("span");
      dot.className = "hero-decor " + cls;
      dot.setAttribute("aria-hidden", "true");
      document.querySelector(".hero").appendChild(dot);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 3. Scroll progress bar under the nav                                */
  /* ------------------------------------------------------------------ */
  const nav = document.querySelector(".nav");
  if (nav) {
    const bar = document.createElement("span");
    bar.className = "nav-progress";
    bar.setAttribute("aria-hidden", "true");
    nav.appendChild(bar);

    let ticking = false;
    const updateBar = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const ratio = max > 0 ? Math.min(doc.scrollTop / max, 1) : 0;
      bar.style.transform = "scaleX(" + ratio + ")";
      ticking = false;
    };

    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          requestAnimationFrame(updateBar);
          ticking = true;
        }
      },
      { passive: true }
    );
    updateBar();
  }

  /* ------------------------------------------------------------------ */
  /* 4. Skeleton shimmer while project screenshots load                  */
  /* ------------------------------------------------------------------ */
  document.querySelectorAll(".project-shot img").forEach(img => {
    const shot = img.closest(".project-shot");
    if (img.complete && img.naturalWidth > 0) return;

    shot.classList.add("is-loading");
    const clear = () => shot.classList.remove("is-loading");
    img.addEventListener("load", clear, { once: true });
    img.addEventListener("error", clear, { once: true });
  });

  /* ------------------------------------------------------------------ */
  /* 5. Underline sweep on section headings as they scroll in             */
  /* ------------------------------------------------------------------ */
  const headings = document.querySelectorAll(".section-heading h2");
  if (headings.length) {
    if (!("IntersectionObserver" in window) || reduced()) {
      headings.forEach(h => h.classList.add("sweep"));
    } else {
      const sweepObserver = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("sweep");
            sweepObserver.unobserve(entry.target);
          });
        },
        { threshold: 0.6 }
      );
      headings.forEach(h => sweepObserver.observe(h));
    }
  }

  /* ------------------------------------------------------------------ */
  /* 6. Gentle 3D tilt on cards that don't already have one              */
  /*    (.photo is skipped on purpose — script.js owns its tilt)          */
  /* ------------------------------------------------------------------ */
  /* Pointer devices only. A touch screen has no hover position to track, so
     the tilt would sit flat forever; script.js handles those cards on tap
     instead, where there is a real position to aim at.

     The about panel used to be in this list and was taken out: its tilt was
     reported as disorienting on hover, since a panel this wide swings a long
     way for only a few degrees. It now uses a plain border-and-shadow hover. */
  if (!reduced() && window.matchMedia("(hover: hover)").matches) {
    const MAX = 5;

    document
      .querySelectorAll(".contact-card")
      .forEach(card => {
        card.dataset.tilt = "";

        /* The inline transform written below outranks the `:hover` rule, so a
           plain `transform: none` on hover would silently drop the card's
           lift. Each card declares its own lift as `--lift` in style.css;
           reading it here folds the lift back into the tilted transform.
           Measured once per card — getComputedStyle on every pointermove
           would force a style recalc per frame. */
        const lift = getComputedStyle(card).getPropertyValue("--lift").trim() || "0px";

        card.addEventListener("pointermove", e => {
          if (e.pointerType === "touch") return;
          const rect = card.getBoundingClientRect();
          const px = (e.clientX - rect.left) / rect.width - 0.5;
          const py = (e.clientY - rect.top) / rect.height - 0.5;
          card.style.transform =
            "perspective(800px) translateY(" + lift + ") rotateX(" +
            -py * MAX + "deg) rotateY(" + px * MAX + "deg)";
        });

        card.addEventListener("pointerleave", () => {
          card.style.transform = "";
        });
      });
  }

  /* ------------------------------------------------------------------ */
  /* 7. Parallax drift on the hero photo                                 */
  /* ------------------------------------------------------------------ */
  /* Driven by the window, not by the hero: .hero is a normal flow section,
     so its own scrollTop never moves. The photo eases down as the hero
     leaves, which is what gives the depth. `translate` is used rather than
     `transform` so it composes with the 3D tilt in script.js instead of
     overwriting it. */
  const heroPhoto = document.querySelector(".photo");
  const hero = document.querySelector(".hero");
  if (heroPhoto && hero && !reduced()) {
    heroPhoto.dataset.parallax = "";

    let raf = null;
    const drift = () => {
      const rect = hero.getBoundingClientRect();
      // 0 while the hero is still in view, 1 once it has scrolled fully past
      const progress = rect.height > 0
        ? Math.min(Math.max(-rect.top / rect.height, 0), 1)
        : 0;
      heroPhoto.style.translate = "0 " + (progress * 40).toFixed(2) + "px";
      raf = null;
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(drift);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    drift();
  }
})();
