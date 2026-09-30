const themeToggle = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("portfolio-theme");
const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
function setTheme(theme) {
  const isDark = theme === "dark";
  document.body.dataset.theme = isDark ? "dark" : "light";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
  themeToggle.querySelector(".theme-icon").textContent = isDark ? "☀" : "☾";
  themeToggle.querySelector(".theme-label").textContent = isDark ? "Light mode" : "Dark mode";
}

// little spin on the icon whenever the theme flips
themeToggle.addEventListener("click", () => {
  const icon = themeToggle.querySelector(".theme-icon");
  icon.classList.remove("spin");
  // force reflow so the animation restarts on rapid clicks
  void icon.offsetWidth;
  icon.classList.add("spin");
});
setTheme(savedTheme || (systemPrefersDark ? "dark" : "light"));
themeToggle.addEventListener("click", () => {
  const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  setTheme(nextTheme);
  localStorage.setItem("portfolio-theme", nextTheme);
});

// Menu button on mobile
const menu = document.getElementById("menu");
const menuBtn = document.getElementById("menuBtn");

function setMenu(open) {
  menu.classList.toggle("open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}

menuBtn.addEventListener("click", () => setMenu(!menu.classList.contains("open")));
menu.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setMenu(false)));

// close the menu if the viewport grows back to desktop
window.matchMedia("(min-width: 701px)").addEventListener("change", e => {
  if (e.matches) setMenu(false);
});

// Percentage bars: animate when scrolled into view
const bars = document.querySelectorAll(".bar i");
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.width = e.target.dataset.w + "%";
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.4 });
bars.forEach(b => observer.observe(b));

/* ------------------------------------------------------------------ */
/* SKILL BARS — replay the fills and count the numbers up on card hover */
/* ------------------------------------------------------------------ */
/* Every row is a .skill (label + percentage) followed by a .bar whose fill
   carries the real number in data-w, so the text and the bar are read from
   one source and can never drift apart. Hovering anywhere on a card winds the
   fills back to empty and replays them one after another, counting each
   percentage up as its bar reaches it. */

const motionOff = new URLSearchParams(location.search).get("motion") === "off";

if (!motionOff) {
  /* Per skill *group*, not the whole panel: the old markup had one card per
     group, so this keeps the same "hover a group, its bars replay" behaviour
     now that the three groups live in a single spec sheet. */
  document.querySelectorAll(".skill-group").forEach(card => {
    const rows = [...card.querySelectorAll(".skill")];
    const fills = [...card.querySelectorAll(".bar > i")];

    // if the two lists do not line up, a number could belong to the wrong bar
    if (!rows.length || rows.length !== fills.length) return;

    const STAGGER = 90;
    const DURATION = 720;
    const timers = [];
    let gen = 0;

    const easeOut = p => 1 - Math.pow(1 - p, 3);

    const targetOf = n => Number(fills[n].dataset.w) || 0;

    /* One loop drives the bar and its number together, from the same value and
       the same curve, so they cannot drift apart no matter how the timing
       falls out. Driving the bar from CSS instead meant the number (JS) and
       the bar (CSS) ran on two independent clocks and visibly came apart. */
    const replay = () => {
      gen++;
      const mine = gen;

      timers.forEach(clearTimeout);
      timers.length = 0;

      // clean reset, and take the transition away for the duration so the
      // per-frame widths below are not fighting a CSS transition
      rows.forEach((row, n) => {
        fills[n].style.transition = "none";
        fills[n].style.width = "0%";
        const numEl = row.querySelector("b");
        if (numEl) numEl.textContent = "0%";
      });

      const startedAt = performance.now();
      const total = (rows.length - 1) * STAGGER + DURATION;

      const step = () => {
        if (mine !== gen) return; // a newer hover took over

        const elapsed = performance.now() - startedAt;
        let allDone = true;

        rows.forEach((row, n) => {
          const fill = fills[n];
          const numEl = row.querySelector("b");
          const target = targetOf(n);

          // each row starts one stagger after the one above it
          const p = Math.min(Math.max((elapsed - n * STAGGER) / DURATION, 0), 1);
          const v = target * easeOut(p);

          fill.style.width = v.toFixed(2) + "%";
          if (numEl) numEl.textContent = Math.round(v) + "%";
          if (p < 1) allDone = false;
        });

        if (!allDone) {
          requestAnimationFrame(step);
        } else {
          settle(mine);
        }
      };

      const settle = myGen => {
        if (myGen !== gen) return;
        rows.forEach((row, n) => {
          // hand the transition back to the stylesheet for the scroll-in fill
          fills[n].style.transition = "";
          fills[n].style.width = targetOf(n) + "%";
          const numEl = row.querySelector("b");
          if (numEl) numEl.textContent = targetOf(n) + "%";
        });
      };

      requestAnimationFrame(step);

      // frames are paused when the page is hidden or embedded without them, so
      // never leave a bar or a number stranded part-way
      timers.push(setTimeout(() => settle(mine), total + 400));
    };

    // pointerenter only fires for a genuine pointing device, so touch skips
    // this without needing a media query
    card.addEventListener("pointerenter", e => {
      if (e.pointerType === "touch") return;
      replay();
    });
  });
}

/* Motion gate — the single `?motion=off` switch, shared with animations.js.

   The photo glow and the card spotlights below used to read
   `prefers-reduced-motion` directly, but browsers and embedded webviews
   disagree about that setting often enough that it left those effects
   silently dead (Brave reported "reduce" even with motion switched on).
   `animations.js` and every reduced-motion block in the CSS were already moved
   over to this override, so this file was the odd one out. `motionOff` is
   declared above and reused. */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* PHOTO CARD — 3D tilt + cursor highlight, and a click "pulse" */
const photo = document.getElementById("photoCard");

if (photo && !motionOff) {
  const MAX_TILT = 14;

  function moveTilt(clientX, clientY) {
    const rect = photo.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // percentage of the way across each axis
    const px = x / rect.width;
    const py = y / rect.height;

    photo.style.setProperty("--tilt-y", (px - 0.5) * 2 * MAX_TILT + "deg");
    photo.style.setProperty("--tilt-x", (0.5 - py) * 2 * MAX_TILT + "deg");
    photo.style.setProperty("--glow-x", px * 100 + "%");
    photo.style.setProperty("--glow-y", py * 100 + "%");
  }

  function resetTilt() {
    photo.style.setProperty("--tilt-x", "0deg");
    photo.style.setProperty("--tilt-y", "0deg");
    photo.style.setProperty("--glow-x", "50%");
    photo.style.setProperty("--glow-y", "50%");
  }

  photo.addEventListener("pointermove", e => {
    // ignore touch, where there is no hover position
    if (e.pointerType === "touch") return;
    moveTilt(e.clientX, e.clientY);
  });

  /* A finger cannot hover, so on a touch screen the tilt and the glow would
     never move — the photo would sit flat while every other card still
     reacted. Tapping it aims the effect at the finger instead, which gives
     touch the same feedback a pointer gets. Held until the finger lifts. */
  photo.addEventListener("pointerdown", e => {
    if (e.pointerType !== "touch") return;
    moveTilt(e.clientX, e.clientY);
  });

  for (const end of ["pointerup", "pointercancel", "pointerleave"]) {
    photo.addEventListener(end, e => {
      if (e.pointerType === "touch") resetTilt();
    });
  }

  photo.addEventListener("pointerleave", resetTilt);

  photo.addEventListener("click", () => {
    photo.classList.add("flash");
    setTimeout(() => photo.classList.remove("flash"), 180);
  });

  photo.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      photo.click();
    }
  });

  // if the user turns on "reduce motion" mid-session, undo the tilt
  reduceMotion.addEventListener("change", e => {
    if (e.matches) resetTilt();
  });
}
/* CONTACT CARDS — spotlight that follows the cursor.
   The skills section is deliberately excluded: it is one continuous panel
   now, and a cursor sheen stretched across a whole sheet of rows reads as a
   smudge rather than a highlight. */
document.querySelectorAll(".contact-card").forEach(card => {
  function aimSpotlight(e) {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--card-glow-x", ((e.clientX - rect.left) / rect.width) * 100 + "%");
    card.style.setProperty("--card-glow-y", ((e.clientY - rect.top) / rect.height) * 100 + "%");
  }

  card.addEventListener("pointermove", e => {
    if (e.pointerType === "touch" || motionOff) return;
    aimSpotlight(e);
  });

  /* Same reasoning as the photo: touch has no hover, so the tap is what stands
     in for it. Without this the sheen never even appears on a phone. */
  card.addEventListener("pointerdown", e => {
    if (e.pointerType !== "touch" || motionOff) return;
    aimSpotlight(e);
  });
});

/* PERCENTAGE COUNTERS — count up alongside the bars */
document.querySelectorAll(".skill b").forEach(label => {
  const target = parseInt(label.textContent, 10);
  if (Number.isNaN(target)) return;

  if (reduceMotion.matches) return; // leave the real number as-is

  label.textContent = "0%";

  const countObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      countObserver.unobserve(entry.target);

      const startedAt = performance.now();
      const DURATION = 1100;

      function tick(now) {
        const elapsed = now - startedAt;
        const progress = Math.min(elapsed / DURATION, 1);
        // ease-out so it slows as it reaches the number
        const eased = 1 - Math.pow(1 - progress, 3);
        label.textContent = Math.round(target * eased) + "%";

        if (progress < 1) requestAnimationFrame(tick);
        else label.textContent = target + "%";
      }

      requestAnimationFrame(tick);
    });
  }, { threshold: 0.6 });

  countObserver.observe(label);
});

/* ------------------------------------------------------------------ */
/* PROJECT MODAL                                                       */
/* ------------------------------------------------------------------ */
/* The card markup is the single source of truth. Everything the modal  */
/* shows is read straight out of the card, so editing a card updates    */
/* the modal automatically and nothing is stored in two places.         */

const projectModal = document.getElementById("projectModal");

if (projectModal) {
  const PM = {
    img: document.getElementById("pmImg"),
    url: document.getElementById("pmUrl"),
    shot: document.getElementById("pmShot"),
    close: document.getElementById("pmClose"),
    closeFoot: document.getElementById("pmCloseFoot"),
    link: document.getElementById("pmLink"),
    title: document.getElementById("pmTitle"),
    lead: document.getElementById("pmLead"),
    tags: document.getElementById("pmTags"),
    aboutBlock: document.getElementById("pmAboutBlock"),
    about: document.getElementById("pmAbout")
  };

  const PM_FOCUSABLE =
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let pmReturnFocus = null;
  let pmLockY = 0;

  function openProject(card) {
    const shot = card.querySelector(".project-shot");
    const img = shot ? shot.querySelector("img") : null;
    const heading = card.querySelector(".project-body h3");
    const lead = card.querySelector(".project-body > p");
    const figma = card.querySelector(".figma-link");
    const title = heading ? heading.textContent.trim() : "";

    PM.img.src = img ? img.getAttribute("src") : "";
    PM.img.alt = img ? img.alt : "";
    PM.shot.hidden = !img;
    PM.url.textContent = card.dataset.url || "";

    PM.title.textContent = title;
    PM.lead.textContent = lead ? lead.textContent.trim() : "";

    PM.tags.textContent = "";
    card.querySelectorAll(".tags li").forEach(li => {
      const tag = document.createElement("span");
      tag.textContent = li.textContent.trim();
      PM.tags.appendChild(tag);
    });

    // copy the long-form paragraphs so the card's own copy is never disturbed
    PM.about.textContent = "";
    const paras = card.querySelectorAll(".details p");
    paras.forEach(p => {
      const clone = document.createElement("p");
      clone.textContent = p.textContent.trim();
      PM.about.appendChild(clone);
    });
    PM.aboutBlock.hidden = paras.length === 0;

    // Only the Figma work has somewhere real to send people. The three systems
    // are local builds, so the button is hidden rather than pointed at a URL
    // that does not exist.
    if (figma) {
      PM.link.href = figma.href;
      PM.link.textContent = "View project";
      PM.link.setAttribute("target", "_blank");
      PM.link.setAttribute("rel", "noopener noreferrer");
      PM.link.hidden = false;
    } else {
      PM.link.hidden = true;
    }

    pmReturnFocus = document.activeElement;
    pmLockY = window.scrollY;

    projectModal.classList.add("open");
    projectModal.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = -pmLockY + "px";
    document.body.style.width = "100%";

    requestAnimationFrame(() => PM.close.focus());
  }

  function closeProject() {
    projectModal.classList.remove("open");
    projectModal.setAttribute("aria-hidden", "true");

    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo(0, pmLockY);

    if (pmReturnFocus && pmReturnFocus.isConnected) pmReturnFocus.focus();
  }

  PM.close.addEventListener("click", closeProject);
  PM.closeFoot.addEventListener("click", closeProject);

  // clicking the backdrop (not the dialog) closes it
  projectModal.addEventListener("click", e => {
    if (e.target === projectModal) closeProject();
  });

  // the screenshot inside the modal still opens the full-size lightbox
  PM.shot.addEventListener("click", () => openLightbox(PM.shot));

  document.addEventListener("keydown", e => {
    if (!projectModal.classList.contains("open")) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeProject();
      return;
    }

    // keep Tab inside the dialog while it is open
    if (e.key === "Tab") {
      const items = [...projectModal.querySelectorAll(PM_FOCUSABLE)].filter(
        el => el.offsetParent !== null
      );
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* The whole card is a mouse affordance, but only the explicit controls
     carry button semantics — putting role="button" on the <article> would
     nest a link and a button inside another button. */
  document.querySelectorAll(".project").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest("a")) return; // let the Figma link open itself
      openProject(card);
    });

    const shot = card.querySelector(".project-shot");
    if (shot) {
      const heading = card.querySelector(".project-body h3");
      shot.setAttribute("tabindex", "0");
      shot.setAttribute("role", "button");

      /* WCAG 2.5.3 "Label in Name": the accessible name has to contain the text
         a sighted visitor actually reads on the control, otherwise someone
         using voice control says "click View" and nothing answers.

         The hint and the badge are built into the name in the order they
         appear on screen, so the visible run of text ("View Python · SQL")
         is contiguous at the front of the accessible name — the rule is
         checked as a substring match, and putting the project name in the
         middle would split that run and still fail it. All three strings are
         read off the card, so they cannot drift from what is displayed. */
      const hint = shot.querySelector(".shot-hint");
      const badge = shot.querySelector(".shot-badge");
      const name = heading ? heading.textContent.trim() : "";

      const visible = [];
      if (hint) visible.push(hint.textContent.trim());
      if (badge) visible.push(badge.textContent.trim().replace(/\s+/g, " "));

      let label = visible.length ? visible.join(" ") : "View";
      if (name) label += " — " + name;

      shot.setAttribute("aria-label", label);
      shot.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openProject(card);
        }
      });
    }

    const more = card.querySelector(".more");
    if (more) more.setAttribute("aria-haspopup", "dialog");
  });
}

/* PROJECT SCREENSHOT — open in a lightbox when clicked */
const lightbox = document.createElement("div");
lightbox.className = "lightbox";
lightbox.innerHTML = `
  <div class="lightbox-inner" role="dialog" aria-modal="true" aria-label="Project screenshot">
    <button class="lightbox-close" type="button" aria-label="Close screenshot">&#10005;</button>
    <img src="" alt="">
  </div>`;
document.body.appendChild(lightbox);

const lbImg = lightbox.querySelector("img");
const lbClose = lightbox.querySelector(".lightbox-close");
let lastFocused = null;

function openLightbox(shot) {
  const img = shot.querySelector("img");
  if (!img) return;

  lastFocused = document.activeElement;
  lbImg.src = img.src;
  lbImg.alt = img.alt;
  lightbox.classList.add("open");
  document.body.style.overflow = "hidden";
  lbClose.focus();
}

function closeLightbox() {
  lightbox.classList.remove("open");
  document.body.style.overflow = "";
  if (lastFocused) lastFocused.focus();
}

// The card no longer opens the lightbox directly — the project modal owns that
// click now, and its screenshot is what hands off to the lightbox.

lbClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", e => {
  // only close when the backdrop itself is clicked, not the image
  if (e.target === lightbox) closeLightbox();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && lightbox.classList.contains("open")) closeLightbox();
});

/* ------------------------------------------------------------------ */
/* EMAIL CARD — open a Gmail draft with the address already filled in  */
/* ------------------------------------------------------------------ */
/* Why not just a mailto: on the card? Because on a machine with no mail  */
/* app configured, clicking it silently does nothing. This tries Gmail     */
/* first (works for anyone signed into Google), and falls back to the     */
/* address on screen so it can still be copied by hand.                    */

const emailCard = document.getElementById("emailCard");

if (emailCard) {
  const EMAIL = emailCard.querySelector(".email-value").dataset.email;
  const GMAIL_COMPOSE =
    "https://mail.google.com/mail/?view=cm&fs=1&to=" +
    encodeURIComponent(EMAIL) +
    "&su=" + encodeURIComponent("Portfolio inquiry");

  let gmailFallbackTimer = null;

  function showEmailFallback() {
    clearTimeout(gmailFallbackTimer);

    const value = emailCard.querySelector(".email-value");
    emailCard.classList.add("is-fallback");
    value.textContent = "No mail app — copying " + EMAIL;

    // put the real address on the clipboard so it is one paste away
    const select = () => {
      const range = document.createRange();
      range.selectNodeContents(value);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };
    select();

    const legacyCopy = () => {
      const ta = document.createElement("textarea");
      ta.value = EMAIL;
      ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    };
    legacyCopy();

    gmailFallbackTimer = setTimeout(() => {
      emailCard.classList.remove("is-fallback");
      value.textContent = EMAIL;
    }, 5000);
  }

  emailCard.addEventListener("click", e => {
    // Cmd/Ctrl + click, or middle click, should behave like a normal link
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

    e.preventDefault();

    const win = window.open(GMAIL_COMPOSE, "_blank", "noopener,noreferrer");

    // window.open returns null when a popup blocker stops it, so the visitor
    // gets the address on screen instead of nothing happening
    if (!win) {
      showEmailFallback();
      return;
    }

    // if the tab is still blank after a moment, treat it as blocked
    let checks = 0;
    const poll = setInterval(() => {
      checks++;
      let blocked = false;
      try {
        blocked = win.closed || !win.location.href || win.location.href === "about:blank";
      } catch {
        // cross-origin: the tab did open, so it is not blocked
        clearInterval(poll);
        return;
      }
      if (blocked) {
        clearInterval(poll);
        showEmailFallback();
      } else if (checks > 12) {
        clearInterval(poll);
      }
    }, 150);
  });
}

/* ------------------------------------------------------------------ */
/* CHAT WIDGET                                                          */
/* ------------------------------------------------------------------ */
/* Scripted Q&A. Every answer below is real content from this site, so   */
/* nothing here can drift out of date without being edited on purpose.    */

const chat = document.getElementById("chat");
const chatPanel = document.getElementById("chatPanel");
const chatLauncher = document.getElementById("chatLauncher");
const chatLog = document.getElementById("chatLog");
const chatMin = document.getElementById("chatMin");
const chatBadge = document.getElementById("chatBadge");
const chatChips = document.getElementById("chatChips");

if (chat && chatPanel) {
  const ANSWERS = {
    who: {
      chip: "Who are you?",
      text:
        "Hi — I'm Keith Martin M. Saique, a web developer. I build clean, responsive, " +
        "easy-to-use websites, and I have basic knowledge of computer hardware from my " +
        "Computer System Servicing studies.",
      link: ["See my About", "#about"]
    },
    skills: {
      chip: "My Skills",
      text:
        "I work across web design, programming, and hardware. On the web side that's " +
        "HTML, CSS, JavaScript, Vue.js, Tailwind CSS and PHP. I also do computer assembly " +
        "and troubleshooting, and I'm comfortable with Microsoft Office and Adobe photo " +
        "and video editing.",
      link: ["View my skills", "#skills"]
    },
    stack: {
      chip: "Tech Stack",
      text:
        "It depends on the project. The Comic Book system is Python with SQL. " +
        "VeganBrew Coffee is PHP, HTML, CSS and JavaScript. Sunrise Enrollment is " +
        "Vue.js with Tailwind CSS and PHP. This portfolio itself is hand-written " +
        "HTML, CSS and JavaScript with no framework.",
      link: ["See the projects", "#projects"]
    },
    experience: {
      chip: "Experience",
      text:
        "In 2024 I started building simple websites and learning front-end fundamentals. " +
        "Through 2025 I worked on dashboards, portfolio pages and interactive pages. " +
        "Right now I'm focused on JavaScript, Vue.js and UI/UX so I can build full-stack " +
        "work that connects to real databases.",
      link: ["View my journey", "#experience"]
    },
    projects: {
      chip: "My Projects",
      text:
        "Three working systems and three Figma designs. The systems are a Comic Book " +
        "Management System, the VeganBrew Coffee site, and a Sunrise Enrollment site. " +
        "The Figma work covers a food-delivery page, a manga reader called FushiguKai, " +
        "and a cinema booking layout. Each card opens a bigger screenshot.",
      link: ["Browse the work", "#projects"]
    },
    contact: {
      chip: "Contact Me",
      text:
        "The fastest way is email: kitsaique@gmail.com. I'm also on Facebook as Keith " +
        "Martin Saique, and reachable on 0956 561 6199. There's a resume button on the " +
        "home page if you'd like the full details.",
      link: ["Open contact details", "#contact"]
    }
  };

  let chatTimer = null;
  let chatHideTimer = null;

  function addBubble(text, who, html) {
    const el = document.createElement("div");
    el.className = "bubble bubble--" + who;
    if (html) el.innerHTML = html;
    else el.textContent = text;
    chatLog.appendChild(el);
    chatLog.scrollTop = chatLog.scrollHeight;
    return el;
  }

  function showTyping() {
    const wrap = document.createElement("div");
    wrap.className = "bubble bubble--bot chat-typing";
    wrap.setAttribute("aria-label", "typing");
    wrap.innerHTML = "<span></span><span></span><span></span>";
    chatLog.appendChild(wrap);
    chatLog.scrollTop = chatLog.scrollHeight;
    return wrap;
  }

  function answer(key) {
    const data = ANSWERS[key];
    if (!data) return;

    // temporarily lock the chips so a second click cannot interleave replies
    Array.from(chatChips.children).forEach(b => (b.disabled = true));

    addBubble(data.chip, "user");

    const typing = showTyping();

    chatTimer = setTimeout(() => {
      typing.remove();

      const html =
        data.text +
        (data.link ? ' <a href="' + data.link[1] + '" data-chat-jump>' + data.link[0] + "</a>" : "");

      addBubble(null, "bot", html);

      Array.from(chatChips.children).forEach(b => (b.disabled = false));
    }, 620);
  }

  function openChat() {
    // cancel a close that is still playing, so a fast re-open does not get
    // hidden out from under the visitor
    clearTimeout(chatHideTimer);
    chatPanel.classList.remove("is-closing");

    chatPanel.hidden = false;
    chat.dataset.open = "true";
    chatLauncher.setAttribute("aria-expanded", "true");
    chatLauncher.setAttribute("aria-label", "Close chat");
    chatBadge.hidden = true;
    clearTimeout(chatTimer);

    if (!chatLog.childElementCount) {
      addBubble("Hi — I'm Keith. Pick a question and I'll answer it.", "bot");
    }

    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function closeChat() {
    if (chatPanel.hidden) return;

    chat.dataset.open = "false";
    chatLauncher.setAttribute("aria-expanded", "false");
    chatLauncher.setAttribute("aria-label", "Open chat");
    clearTimeout(chatTimer);
    Array.from(chatChips.children).forEach(b => (b.disabled = false));

    /* Play the exit animation first and only then hide the panel — setting
       [hidden] straight away would remove it from the render tree and the
       animation would never be seen. */
    const finish = () => {
      clearTimeout(chatHideTimer);
      chatPanel.classList.remove("is-closing");
      chatPanel.hidden = true;
      chatPanel.removeEventListener("animationend", finish);
    };

    chatPanel.addEventListener("animationend", finish);
    chatPanel.classList.add("is-closing");

    /* animationend never fires when the animation is disabled (reduced motion,
       or ?motion=off), and a stuck panel would be unclosable — so the timer
       hides it regardless. */
    chatHideTimer = setTimeout(finish, 260);
  }

  chatLauncher.addEventListener("click", () => {
    if (chat.dataset.open === "true") closeChat();
    else openChat();
  });

  chatMin.addEventListener("click", closeChat);

  // Close the panel when an in-answer link is used. The link is left alone —
  // the document-level smooth-scroll handler picks it up from there, so
  // re-dispatching a click here would just re-enter this listener.
  chatLog.addEventListener("click", e => {
    if (e.target.closest("[data-chat-jump]")) closeChat();
  });

  chatChips.addEventListener("click", e => {
    const chip = e.target.closest("button[data-q]");
    if (chip) answer(chip.dataset.q);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && chat.dataset.open === "true") closeChat();
  });

  // clicking anywhere outside the widget closes it
  document.addEventListener("click", e => {
    if (chat.dataset.open !== "true") return;
    if (chat.contains(e.target)) return;
    closeChat();
  });
}

/* ------------------------------------------------------------------ */
/* RESUME MODAL                                                         */
/* ------------------------------------------------------------------ */
/* Shows the PDF inside the page instead of bouncing the visitor to a  */
/* new tab, and inherits the site's light/dark theme automatically.     */

const resumeBtn = document.getElementById("resumeBtn");
const resumeModal = document.getElementById("resumeModal");
const resumeClose = document.getElementById("resumeClose");

if (resumeBtn && resumeModal) {
  /* Opened straight from the folder (file://) rather than a web server, the
     browser gives every file its own security origin and refuses to frame the
     local PDF — the console fills with "unsafe attempt to load URL" and the
     modal would just show an empty grey box. Detect that and offer a real
     link instead of leaving a blank panel. */
  if (location.protocol === "file:") {
    const frame = document.getElementById("resumeFrame");
    const fallback = document.getElementById("resumeFallback");
    if (frame) frame.hidden = true;
    if (fallback) fallback.hidden = false;
  }

  let resumeReturnFocus = null;
  let scrollLockY = 0;

  const FOCUSABLE =
    'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

  function openResume() {
    // remember the trigger BEFORE anything moves focus
    if (!resumeReturnFocus || !resumeModal.classList.contains("open")) {
      resumeReturnFocus = document.activeElement;
    }

    scrollLockY = window.scrollY;
    resumeModal.classList.add("open");
    resumeModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    // stop the page behind from scrolling on iOS
    document.body.style.position = "fixed";
    document.body.style.top = -scrollLockY + "px";
    document.body.style.width = "100%";

    // wait for the open transition so the button is visible before focusing
    requestAnimationFrame(() => resumeClose.focus());
  }

  function closeResume() {
    resumeModal.classList.remove("open");
    resumeModal.setAttribute("aria-hidden", "true");

    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo(0, scrollLockY);

    // hand focus back to whatever opened the dialog
    if (resumeReturnFocus && resumeReturnFocus.isConnected) {
      resumeReturnFocus.focus();
    }
  }

  resumeBtn.addEventListener("click", openResume);
  resumeClose.addEventListener("click", closeResume);

  // click on the backdrop (not the dialog) closes it
  resumeModal.addEventListener("click", e => {
    if (e.target === resumeModal) closeResume();
  });

  document.addEventListener("keydown", e => {
    if (!resumeModal.classList.contains("open")) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeResume();
      return;
    }

    // keep Tab inside the dialog while it is open
    if (e.key === "Tab") {
      const items = [...resumeModal.querySelectorAll(FOCUSABLE)].filter(
        el => el.offsetParent !== null
      );
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* SMOOTH SECTION SCROLL                                                */
/* ------------------------------------------------------------------ */
/* The browser's native smooth scroll is short and linear-ish, which    */
/* reads as a jolt on longer jumps. This runs a real easing curve and  */
/* yields immediately if the visitor decides to scroll by hand.        */

const reduceScrollMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const NAV_OFFSET = 76;

let scrollAnim = null;

/* Diagnostic: ?debug=1 prints why a nav click might not animate.
   Reduced motion is the usual culprit — Windows "Animation effects" being
   off sets this flag, and then scrolling is intentionally instant. */
if (new URLSearchParams(location.search).has("debug")) {
  console.log("[scroll] reduce-motion:", reduceScrollMotion.matches);
  window.addEventListener("load", () => {
    console.log("[scroll] rAF supported:", typeof requestAnimationFrame === "function");
  });
}

// easeInOutCubic — slow start, fast middle, gentle settle
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* Where an element actually sits in the document, in page pixels.
   `offsetTop` is measured from the nearest *positioned* ancestor, so it only
   happened to be a page coordinate while every section was a direct child of
   <body>. Now that the sections live inside a <main> landmark, anything that
   later gives <main> a position would silently shift every scroll target.
   Measuring the box and adding the current scroll is independent of that. */
function docTop(el) {
  return el.getBoundingClientRect().top + window.scrollY;
}

function stopScrollAnim() {
  if (scrollAnim) {
    cancelAnimationFrame(scrollAnim);
    scrollAnim = null;
  }
}

function animateScrollTo(targetY, onDone) {
  stopScrollAnim();

  const startY = window.scrollY;
  const maxY = document.documentElement.scrollHeight - window.innerHeight;
  const endY = Math.max(0, Math.min(targetY, maxY));
  const distance = endY - startY;

  // A nav click is deliberate, small, and expected — unlike ambient motion
  // (parallax, autoplay) that reduce-motion is meant to suppress. So this
  // scrolls even when that preference is on, just with a shorter, gentler
  // curve so it never feels like a long ride.
  if (Math.abs(distance) < 2) {
    window.scrollTo(0, endY);
    if (onDone) onDone();
    return;
  }

  // scale the duration with distance, but keep it within a comfortable band
  const duration = reduceScrollMotion.matches
    ? Math.min(500, Math.max(260, Math.abs(distance) * 0.3))
    : Math.min(1050, Math.max(420, Math.abs(distance) * 0.55));
  const startedAt = performance.now();

  function step() {
    const progress = Math.min((performance.now() - startedAt) / duration, 1);
    window.scrollTo(0, startY + distance * easeInOutCubic(progress));

    if (progress < 1) {
      scrollAnim = requestAnimationFrame(step);
    } else {
      scrollAnim = null;
      // land exactly on the target — rounding can leave it a pixel short
      window.scrollTo(0, endY);
      if (onDone) onDone();
    }
  }

  // paint the first frame immediately so there is no delay before motion starts
  step();
}

// A visitor grabbing the wheel or swiping should always win over the animation
["wheel", "touchstart", "keydown"].forEach(evt =>
  window.addEventListener(
    evt,
    e => {
      if (evt === "keydown" && ["Tab", "Shift"].includes(e.key)) return;
      stopScrollAnim();
    },
    { passive: true, capture: true }
  )
);

// Intercept every in-page anchor and scroll to it smoothly.
// Delegated on document rather than bound per-link, so anchors created later
// (the chat widget's "see my ..." links) scroll the same way as the nav.
document.addEventListener("click", e => {
  // don't hijack a modified click — those mean "open in new tab"
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

  const link = e.target.closest('a[href^="#"]');
  if (!link) return;

  const id = link.getAttribute("href");
  if (!id || id === "#") return;

  const target = document.querySelector(id);
  if (!target) return;

  e.preventDefault();

  // clicking the section you're already in takes you back to the top
  const sectionTop = docTop(target) - NAV_OFFSET;
  const alreadyThere = Math.abs(window.scrollY - sectionTop) < 24;
  const destination = alreadyThere ? 0 : sectionTop;

  animateScrollTo(destination, () => {
    // update the URL without the browser's own instant jump
    history.replaceState(null, "", id);
  });
});

/* ------------------------------------------------------------------ */
/* BACK TO TOP                                                          */
/* ------------------------------------------------------------------ */
const topBtn = document.getElementById("topBtn");
window.addEventListener("scroll", () => topBtn.classList.toggle("show", window.scrollY > 500), { passive: true });
topBtn.addEventListener("click", () => {
  animateScrollTo(0, () => history.replaceState(null, "", location.pathname));
});

// Fade sections in as they scroll into view
const revealTargets = document.querySelectorAll(
  ".section-heading, .about-panel, .skill-panel, .exp-item, .project, .contact-card"
);

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    entries => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        // small stagger so items cascade instead of popping at once
        entry.target.style.transitionDelay = `${Math.min(i * 70, 280)}ms`;
        entry.target.classList.add("in");
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  revealTargets.forEach(el => {
    el.classList.add("reveal");
    revealObserver.observe(el);
  });
} else {
  // no observer support: just show everything
  revealTargets.forEach(el => el.classList.add("in"));
}

/* BUTTON RIPPLE — spawns a circle from the click point */
document.querySelectorAll(".btn").forEach(btn => {
  btn.addEventListener("click", e => {
    if (motionOff) return;

    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement("span");
    ripple.className = "ripple";

    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = e.clientX - rect.left - size / 2 + "px";
    ripple.style.top = e.clientY - rect.top - size / 2 + "px";

    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  });
});

/* KEYBOARD USERS — let Enter/Space activate a focused logo link naturally */
document.querySelector(".logo").addEventListener("keydown", e => {
  if (e.key === "Enter") window.scrollTo({ top: 0, behavior: "smooth" });
});

/* LIVE CLOCK — the visitor's own locale and timezone, not a hardcoded one, so
   it is always correct for whoever is reading it. Deliberately NOT gated on
   ?motion: a clock is information, not decoration, so it runs either way. */
const clock = document.getElementById("liveClock");

if (clock) {
  /* The long form wraps onto three lines inside a 320px phone, which looks
     broken rather than compact. Below 560px the short form drops the weekday
     and year so it still fits on one line. */
  const WIDE = window.matchMedia("(min-width: 560px)");

  const longDate = new Intl.DateTimeFormat(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const shortDate = new Intl.DateTimeFormat(undefined, {
    weekday: "short", day: "numeric", month: "short",
  });
  const clockTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric", minute: "2-digit",
  });

  function renderClock() {
    const now = new Date();
    const date = WIDE.matches ? longDate : shortDate;
    clock.textContent = date.format(now) + " \u00B7 " + clockTime.format(now);
    clock.setAttribute("datetime", now.toISOString());
  }

  /* Re-queued against the wall clock instead of a flat 1000ms, so the display
     cannot slowly slide out of step with real time. */
  function tickClock() {
    renderClock();
    setTimeout(tickClock, 1000 - (Date.now() % 1000) + 10);
  }

  renderClock();
  tickClock();

  /* A backgrounded tab has its timers throttled to roughly once a minute, so
     on return the clock could be up to a minute stale. Re-render on the spot. */
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderClock();
  });

  /* Rotating a phone swaps between the long and short form. The query only
     fires on the crossing itself, so there is nothing to debounce. */
  const onWidthChange = () => renderClock();
  if (WIDE.addEventListener) WIDE.addEventListener("change", onWidthChange);
  else WIDE.addListener(onWidthChange);
}

/* The copyright year used to be typed by hand and would quietly go stale. */
const footYear = document.getElementById("footYear");
if (footYear) footYear.textContent = String(new Date().getFullYear());

// Highlight the nav link for the section currently in view
const navLinks = [...menu.querySelectorAll("a")];

// Only sections the nav actually links to. Without this filter any other
// element carrying an id (a dialog, a panel) would be picked up here and,
// because the loop keeps the *last* match, would win on every scroll.
const navTargets = new Set(navLinks.map(a => a.getAttribute("href").slice(1)));
const sections = [...document.querySelectorAll("section[id]")].filter(s =>
  navTargets.has(s.id)
);

function syncActiveNav() {
  const scrollY = window.scrollY;
  const offset = scrollY + window.innerHeight * 0.35;
  let current = sections[0] ? sections[0].id : "";

  sections.forEach(section => {
    if (docTop(section) <= offset) current = section.id;
  });

  // The final section is often too short to ever reach the 35% line, and there
  // is no page left below it to scroll into — so pin it once we hit the bottom,
  // otherwise the last nav link could never light up.
  const maxY = document.documentElement.scrollHeight - window.innerHeight;
  if (sections.length && maxY > 0 && scrollY >= maxY - 2) {
    current = sections[sections.length - 1].id;
  }

  navLinks.forEach(link => {
    link.classList.toggle("active", link.getAttribute("href") === `#${current}`);
  });
}

window.addEventListener("scroll", syncActiveNav, { passive: true });
window.addEventListener("resize", syncActiveNav);
syncActiveNav();