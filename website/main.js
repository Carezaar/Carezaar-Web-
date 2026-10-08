// Carezaar landing page — motion layer. The HTML/CSS render every section finished;
// this file adds the scroll story on top. If GSAP is missing, it fails visible.
(() => {
  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  const { gsap, ScrollTrigger } = window;

  if (!gsap || !ScrollTrigger) { root.classList.remove("js"); return; }
  const plugins = [ScrollTrigger, window.MorphSVGPlugin, window.DrawSVGPlugin].filter(Boolean);
  gsap.registerPlugin(...plugins);
  const canMorph = !!window.MorphSVGPlugin;

  // ------------------------------------------------------------------ helpers
  /** Samples a path so we can look up length by y (or x) without per-frame DOM work. */
  function sampler(path, step = 6) {
    const L = path.getTotalLength();
    const n = Math.max(2, Math.ceil(L / step));
    const pts = [];
    for (let i = 0; i <= n; i++) { const l = (L * i) / n; const p = path.getPointAtLength(l); pts.push({ l, x: p.x, y: p.y }); }
    const search = (key, v) => {
      if (v <= pts[0][key]) return 0;
      if (v >= pts[n][key]) return L;
      let lo = 0, hi = n;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][key] < v) lo = mid; else hi = mid; }
      const a = pts[lo], b = pts[hi], t = (v - a[key]) / (b[key] - a[key] || 1);
      return a.l + (b.l - a.l) * t;
    };
    const at = (l) => { const i = Math.min(n, Math.max(0, Math.round((l / L) * n))); return pts[i]; };
    return { L, at, lenAtY: (y) => search("y", y), lenAtX: (x) => search("x", x) };
  }

  // ------------------------------------------------------------------ signed-in visitors: "Open app"
  try {
    if (localStorage.getItem("carezaar.accessToken")) $$("[data-signed-in-href]").forEach((a) => {
      a.setAttribute("href", a.dataset.signedInHref); a.textContent = a.dataset.signedInText;
    });
  } catch { /* storage blocked: keep "Sign in" */ }

  // ------------------------------------------------------------------ in-page links (native smooth scrolling)
  const scrollToY = (y) => scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
  $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    const target = id.length > 1 && $(id);
    if (!target) return;
    e.preventDefault();
    scrollToY(target.getBoundingClientRect().top + scrollY - (id === "#top" ? 0 : 70));
  }));

  // ------------------------------------------------------------------ nav: frosted after scroll + sliding section indicator
  const nav = $(".nav");
  ScrollTrigger.create({ start: 24, end: "max", onToggle: (s) => nav.classList.toggle("is-scrolled", s.isActive) });
  const navLinks = $$(".nav__links a");
  const navThumb = $(".nav__thumb");
  const active = new Set();
  const paintNav = () => {
    const a = navLinks.filter((l) => active.has(l)).pop();
    navLinks.forEach((l) => l.classList.toggle("is-active", l === a));
    if (!a) { navThumb.style.opacity = 0; return; }
    navThumb.style.opacity = 1;
    navThumb.style.width = `${a.offsetWidth}px`;
    navThumb.style.transform = `translateX(${a.offsetLeft}px)`;
  };
  navLinks.forEach((a) => ScrollTrigger.create({
    trigger: $(a.getAttribute("href")), start: "top 45%", end: "bottom 45%",
    onToggle: (s) => { s.isActive ? active.add(a) : active.delete(a); paintNav(); },
  }));

  // ------------------------------------------------------------------ buttons lean toward the pointer a little
  if (fine && !reduced) {
    $$("[data-magnetic]").forEach((b) => {
      const bx = gsap.quickTo(b, "x", { duration: 0.5, ease: "power3" });
      const by = gsap.quickTo(b, "y", { duration: 0.5, ease: "power3" });
      b.addEventListener("pointermove", (e) => { const r = b.getBoundingClientRect(); bx((e.clientX - r.left - r.width / 2) * 0.22); by((e.clientY - r.top - r.height / 2) * 0.32); });
      b.addEventListener("pointerleave", () => { bx(0); by(0); });
    });
  }

  // ------------------------------------------------------------------ hero: role switch
  const hero = $(".hero");
  const roleBtns = $$(".role button");
  const roleThumb = $(".role__thumb");
  const homeIcon = $(".home__icon");
  const HOME_D = homeIcon.getAttribute("d");
  const HEART_D = "M260 272 C 252 266 245 261 245 255 C 245 250.5 248.5 248 252 248 C 255 248 258 250 260 253 C 262 250 265 248 268 248 C 271.5 248 275 250.5 275 255 C 275 261 268 266 260 272 Z";
  const placeRoleThumb = () => {
    const b = roleBtns.find((x) => x.getAttribute("aria-checked") === "true");
    roleThumb.style.width = `${b.offsetWidth}px`;
    roleThumb.style.transform = `translateX(${b.offsetLeft}px)`;
  };
  const setRole = (role) => {
    if (hero.dataset.role === role) return;
    hero.dataset.role = role;
    roleBtns.forEach((b) => { const on = b.dataset.role === role; b.setAttribute("aria-checked", on); b.tabIndex = on ? 0 : -1; });
    $(".swap__a").setAttribute("aria-hidden", role !== "family");
    $(".swap__b").setAttribute("aria-hidden", role !== "caregiver");
    $$(".hero .for-family").forEach((el) => el.setAttribute("aria-hidden", role !== "family"));
    $$(".hero .for-caregiver").forEach((el) => el.setAttribute("aria-hidden", role !== "caregiver"));
    placeRoleThumb();
    $(".hero__start").setAttribute("href", role === "caregiver" ? "/sign-up/caregiver" : "/sign-up/client");
    const d = role === "caregiver" ? HEART_D : HOME_D;
    if (canMorph && !reduced) gsap.to(homeIcon, { morphSVG: d, duration: 0.8, ease: "expo.inOut" });
    else homeIcon.setAttribute("d", d);
  };
  roleBtns.forEach((b) => {
    b.addEventListener("click", () => setRole(b.dataset.role));
    b.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      const next = roleBtns.find((x) => x !== b);
      setRole(next.dataset.role); next.focus();
    });
  });

  // Constellation leans toward the pointer; nearer layers move further.
  if (fine && !reduced) {
    const q = (sel, prop) => gsap.quickTo(sel, prop, { duration: 0.9, ease: "power3" });
    const tiltY = q(".c-tilt", "rotationY"), tiltX = q(".c-tilt", "rotationX");
    const rx = q(".layer-rings", "x"), ry = q(".layer-rings", "y"), nx = q(".layer-nodes", "x"), ny = q(".layer-nodes", "y");
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      tiltY(x * 12); tiltX(-y * 10); rx(x * 8); ry(y * 8); nx(x * 20); ny(y * 20);
    });
    hero.addEventListener("pointerleave", () => { tiltY(0); tiltX(0); rx(0); ry(0); nx(0); ny(0); });
  }

  // ------------------------------------------------------------------ try-it controls (chips and week)
  const paintWeek = () => $$(".week__d").forEach((d) => d.classList.toggle("is-on", $$(`.week button[data-col="${d.dataset.col}"][aria-pressed="true"]`).length > 0));
  $$(".chips, .week").forEach((group) => {
    let touched = false;
    group.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      touched = true;
      b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true");
      paintWeek();
    });
    // First time it scrolls into view, show what tapping does.
    ScrollTrigger.create({
      trigger: group, start: "top 78%", once: true,
      onEnter: () => $$("[data-auto]", group).forEach((b, i) => gsap.delayedCall(reduced ? 0 : 0.3 + i * 0.22, () => {
        if (touched) return; b.setAttribute("aria-pressed", "true"); paintWeek();
      })),
    });
  });

  // ------------------------------------------------------------------ reveals
  ScrollTrigger.batch("[data-reveal]", {
    start: "top 88%", once: true,
    onEnter: (els) => els.forEach((el, i) => { el.style.transitionDelay = `${i * 80}ms`; el.classList.add("is-in"); }),
  });

  // ------------------------------------------------------------------ how it works: steps drive the phone
  const steps = $$(".step"), screens = $$(".screen"), sats = $$(".sat");
  let cur = 0, wasTimer;
  const show = (i) => {
    if (i === cur) return;
    const prev = cur; cur = i;
    clearTimeout(wasTimer);
    screens.forEach((s, k) => { s.classList.toggle("was-active", k === prev); s.classList.toggle("is-active", k === i); });
    wasTimer = setTimeout(() => screens[prev].classList.remove("was-active"), 900);
    steps.forEach((s, k) => s.classList.toggle("is-current", k === i));
    sats.forEach((s, k) => s.classList.toggle("is-on", k === i));
  };
  steps[0].classList.add("is-current");
  sats[0].classList.add("is-on");

  // ------------------------------------------------------------------ lifeline
  const care = $(".care");
  const lifeLine = $(".life__line");
  const lifeBead = $(".life__bead");
  const stations = $$(".station");
  const panels = $$(".life__panel");
  const wave = (x) => 110 + 16 * Math.sin((x - 20) / 80);
  const ST_X = [80, 170, 490, 850];
  const SEGS = [[20, 80], [80, 260], [260, 730], [730, 980]];
  const segG = $(".life__segs");
  SEGS.forEach(([a, b]) => {
    let d = `M${a} ${wave(a).toFixed(1)}`;
    for (let x = a + 6; x <= b; x += 6) d += ` L${x} ${wave(x).toFixed(1)}`;
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d); segG.appendChild(p);
  });
  const segs = $$("path", segG);
  const LS = sampler(lifeLine, 4);
  lifeLine.style.strokeDasharray = `${LS.L} ${LS.L}`;
  let lifeActive = -1;
  const setLife = (i) => {
    if (i === lifeActive) return;
    lifeActive = i;
    stations.forEach((s, k) => { s.classList.toggle("is-active", k === i); s.setAttribute("aria-selected", k === i); });
    panels.forEach((p, k) => p.classList.toggle("is-active", k === i));
    segs.forEach((s, k) => s.classList.toggle("is-on", k === i));
    if (window.DrawSVGPlugin && !reduced) gsap.fromTo($$(".life__icon > *", panels[i]), { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.1, ease: "power2.inOut", stagger: 0.12 });
  };
  const beadX = { x: 80 };
  const paintLife = (drawAll) => {
    const x = beadX.x;
    lifeLine.style.strokeDashoffset = drawAll ? 0 : LS.L - LS.lenAtX(x);
    lifeBead.setAttribute("transform", `translate(${x.toFixed(1)} ${wave(x).toFixed(1)})`);
    let i = 0; ST_X.forEach((sx, k) => { if (x >= sx - 24) i = k; });
    setLife(i);
  };
  setLife(0);

  // ------------------------------------------------------------------ gates
  const gatePath = $("#gatePath");
  const gatesLit = $(".gates__lit");
  const token = $(".token");
  const gates = $$(".gate");
  const gateLabels = $$(".gate-label");
  const notes = $$(".gates__notes li");
  const homeEnd = $(".gates__end--home");
  const GL = gatePath.getTotalLength();
  const LOCK_D = gates[0].querySelector(".gate__icon").getAttribute("d");
  const CHECK_D = "M-8 1 L-2.5 6.5 L9 -5.5";
  gatesLit.style.strokeDasharray = `${GL} ${GL}`;
  const gateOpen = gates.map(() => false);
  const setGate = (i, open) => {
    if (gateOpen[i] === open) return;
    gateOpen[i] = open;
    gates[i].classList.toggle("is-open", open);
    gateLabels[i].classList.toggle("is-lit", open);
    notes[i].classList.toggle("is-lit", open);
    const icon = gates[i].querySelector(".gate__icon");
    if (canMorph && !reduced) gsap.to(icon, { morphSVG: open ? CHECK_D : LOCK_D, duration: 0.55, ease: "expo.out" });
    else icon.setAttribute("d", open ? CHECK_D : LOCK_D);
  };
  const tokenP = { p: 0 };
  const paintGates = () => {
    const p = tokenP.p;
    const pt = gatePath.getPointAtLength(p * GL);
    token.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${(pt.y - 22).toFixed(1)})`);
    token.style.opacity = p > 0.005 && p < 0.985 ? 1 : 0;
    gatesLit.style.strokeDashoffset = GL * (1 - p);
    // Each gate sits at an equal share of the path's length (see the markup).
    gates.forEach((_, i) => setGate(i, p >= (i + 1) / (gates.length + 1)));
    homeEnd.classList.toggle("is-arrived", p >= 0.985);
  };
  paintGates();

  // ------------------------------------------------------------------ languages: word bubble + sliding chip
  const WORDS = [["en", "Care"], ["es", "Cuidado"], ["fr", "Soin"], ["ru", "Забота"], ["ar", "رعاية"], ["fa", "مراقبت"], ["hi", "देखभाल"], ["zh", "关怀"]];
  const bWord = $(".say__word"), bClip = $(".say__clip"), bMeasure = $(".say__measure");
  const langBtns = $$(".langs__list button"), langThumb = $(".langs__thumb");
  let li = 0, langHold = 0, langVisible = false;
  const measure = (text, lang) => { bMeasure.lang = lang; bMeasure.textContent = text; return bMeasure.getBoundingClientRect().width; };
  const placeLangThumb = (animate) => {
    const b = langBtns[li];
    const vars = { x: b.offsetLeft, y: b.offsetTop, width: b.offsetWidth, height: b.offsetHeight };
    animate && !reduced ? gsap.to(langThumb, { ...vars, duration: 0.6, ease: "expo.out" }) : gsap.set(langThumb, vars);
  };
  const setLang = (k) => {
    if (k === li) return;
    li = k;
    const [lang, text] = WORDS[k];
    const rtl = lang === "ar" || lang === "fa";
    langBtns.forEach((b, i) => b.setAttribute("aria-pressed", i === k));
    placeLangThumb(true);
    const width = measure(text, lang);
    if (reduced) { bWord.textContent = text; bWord.lang = lang; bClip.style.width = `${width}px`; return; }
    gsap.timeline()
      .to(bWord, { autoAlpha: 0, y: -12, filter: "blur(6px)", duration: 0.28, ease: "power2.in" })
      .add(() => { bWord.textContent = text; bWord.lang = lang; bWord.dir = rtl ? "rtl" : "ltr"; })
      .to(bClip, { width, duration: 0.6, ease: "expo.out" }, 0.18)
      .fromTo(bWord, { autoAlpha: 0, x: rtl ? 34 : -34, y: 0, filter: "blur(6px)" }, { autoAlpha: 1, x: 0, filter: "blur(0px)", duration: 0.6, ease: "expo.out" }, 0.3);
  };
  const tickLang = () => { if (langVisible && Date.now() > langHold) setLang((li + 1) % WORDS.length); };
  langBtns.forEach((b, i) => b.addEventListener("click", () => { langHold = Date.now() + 9000; setLang(i); }));
  ScrollTrigger.create({ trigger: ".langs", start: "top 85%", end: "bottom 15%", onToggle: (s) => { langVisible = s.isActive; } });
  if (!reduced) setInterval(tickLang, 2600);

  // ------------------------------------------------------------------ the care thread
  const shell = $(".shell");
  const threadSvg = $(".thread");
  const tRoute = $(".thread__route"), tLine = $(".thread__line"), tGlow = $(".thread__glow"), tHead = $(".thread__head");
  const finalShape = $(".final__shape");
  const HEART_SMALL = finalShape.getAttribute("d");
  const DOT = "M-4.5 0 A4.5 4.5 0 1 0 4.5 0 A4.5 4.5 0 1 0 -4.5 0 Z";
  let T = null, joined = null;

  // Built only when animating: its first tween hides the heart until the thread arrives.
  const heartTl = reduced ? null : gsap.timeline({ paused: true })
    .fromTo(".final__stem", { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.35, ease: "power1.in" })
    .fromTo(finalShape, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.25, ease: "power2.out" }, 0.3)
    .to(finalShape, { morphSVG: canMorph ? HEART_SMALL : undefined, duration: 0.7, ease: "expo.inOut" }, 0.35)
    .to(finalShape, { scale: 1.3, duration: 0.2, ease: "power2.out" }, 0.9)
    .to(finalShape, { scale: 1, duration: 0.6, ease: "power3.out" }, 1.1)
    .fromTo(".final__ring", { scale: 0.8, autoAlpha: 0.8 }, { scale: 3, autoAlpha: 0, duration: 1.1, ease: "power2.out" }, 0.9);

  const anchors = () => {
    const S = shell.getBoundingClientRect();
    // When the shell fills the viewport, keep the bead's halo on screen.
    const railX = S.width - (S.right >= innerWidth - 1 ? 16 : 0.5);
    const c = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - S.left + r.width / 2, y: r.top - S.top + r.height / 2 }; };
    const r = (el) => { const b = el.getBoundingClientRect(); return { top: b.top - S.top, bottom: b.bottom - S.top, cx: b.left - S.left + b.width / 2 }; };
    const home = c($(".home > circle"));
    const heroR = r(hero), grid = r($(".how__grid")), phoneCol = r(innerWidth > 1020 ? $(".phone-wrap") : $(".phone"));
    const heart = c($(".final__heart"));
    const cardTop = r($(".final__card")).top;
    const phoneTop = innerWidth > 1020 ? grid.top + 40 : phoneCol.top + 30;
    const phoneBottom = innerWidth > 1020 ? grid.bottom - 40 : phoneCol.bottom - 30;
    return [
      home,
      { x: railX, y: heroR.bottom - 20 },
      { x: railX, y: phoneTop - 110 },
      { x: phoneCol.cx, y: phoneTop },
      { x: phoneCol.cx, y: phoneBottom },
      { x: railX, y: phoneBottom + 90 },
      { x: railX, y: cardTop - 150 },
      { x: heart.x, y: cardTop + 1 },
    ];
  };
  const buildThread = () => {
    const w = shell.clientWidth, h = shell.scrollHeight;
    threadSvg.setAttribute("width", w); threadSvg.setAttribute("height", h); threadSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const p = anchors();
    let d = `M${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}`;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], dy = (b.y - a.y) * 0.5;
      d += ` C${a.x.toFixed(1)} ${(a.y + dy).toFixed(1)} ${b.x.toFixed(1)} ${(b.y - dy).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    [tRoute, tLine, tGlow].forEach((el) => el.setAttribute("d", d));
    T = sampler(tLine, 6);
    tLine.style.strokeDasharray = tGlow.style.strokeDasharray = `${T.L} ${T.L}`;
    threadLen.len = targetLen();
    drawThread();
  };
  const threadLen = { len: 0 };
  const targetLen = () => {
    const y = scrollY + innerHeight * 0.62 - (shell.getBoundingClientRect().top + scrollY);
    return T.lenAtY(y);
  };
  const setJoined = (on) => {
    if (on === joined) return;
    joined = on;
    if (reduced) return;
    on ? heartTl.play() : heartTl.reverse();
  };
  const drawThread = () => {
    if (!T) return;
    const l = threadLen.len;
    tLine.style.strokeDashoffset = tGlow.style.strokeDashoffset = T.L - l;
    const pt = T.at(l);
    tHead.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
    const end = l >= T.L - 3;
    tHead.style.opacity = l < 2 || end ? 0 : 1;
    setJoined(end);
  };
  const lenTo = gsap.quickTo(threadLen, "len", { duration: 0.7, ease: "power3", onUpdate: drawThread });

  // ------------------------------------------------------------------ motion by media query (cleaned up automatically on change)
  const mm = gsap.matchMedia();
  mm.add({
    desk: "(min-width: 1021px)",
    tall: "(min-height: 680px)",
    reduce: "(prefers-reduced-motion: reduce)",
  }, (ctx) => {
    const { desk, tall, reduce } = ctx.conditions;
    const scrolly = desk && tall && !reduce;

    // How it works
    if (desk) {
      steps.forEach((s, i) => ScrollTrigger.create({ trigger: s, start: "top 60%", end: "bottom 60%", onToggle: (st) => st.isActive && show(i) }));
      if (!reduce) gsap.fromTo(".phone", { rotationY: -14, rotationX: 6 }, { rotationY: 10, rotationX: -3, ease: "none", scrollTrigger: { trigger: ".how__grid", start: "top bottom", end: "bottom top", scrub: 1 } });
    } else {
      let cycle = 0;
      const startCycle = () => { if (!reduce && !cycle) cycle = setInterval(() => show((cur + 1) % screens.length), 3800); };
      const stopCycle = () => { clearInterval(cycle); cycle = 0; };
      const onStep = (e) => { const s = e.currentTarget; stopCycle(); show(Number(s.dataset.step)); startCycle(); };
      steps.forEach((s) => s.addEventListener("click", onStep));
      ScrollTrigger.create({ trigger: ".phone", start: "top 80%", end: "bottom 20%", onToggle: (st) => (st.isActive ? startCycle() : stopCycle()) });
      ctx.add(() => () => { stopCycle(); steps.forEach((s) => s.removeEventListener("click", onStep)); });
    }

    // Lifeline: scroll-driven on large screens, tap-driven elsewhere
    care.classList.toggle("is-scrolly", scrolly);
    const onStation = (e) => {
      const i = Number(e.currentTarget.dataset.i);
      if (scrolly) {
        const st = ScrollTrigger.getById("life");
        const p = (ST_X[i] - 20) / 960 + 0.015;
        scrollToY(st.start + (st.end - st.start) * p);
      } else {
        gsap.to(beadX, { x: ST_X[i], duration: reduce ? 0 : 0.9, ease: "expo.inOut", onUpdate: () => paintLife(true) });
      }
    };
    stations.forEach((s) => s.addEventListener("click", onStation));
    if (scrolly) {
      const bx = gsap.quickTo(beadX, "x", { duration: 0.5, ease: "power3", onUpdate: () => paintLife(false) });
      ScrollTrigger.create({ id: "life", trigger: ".care__track", start: "top top", end: "bottom bottom", onUpdate: (s) => bx(20 + Math.min(1, s.progress * 1.12) * 960) });
      beadX.x = 20; paintLife(false);
    } else {
      beadX.x = ST_X[lifeActive]; paintLife(true);
      if (!reduce) {
        let auto = 0;
        ScrollTrigger.create({ trigger: ".life", start: "top 80%", end: "bottom 10%", onToggle: (st) => {
          clearInterval(auto); auto = 0;
          if (st.isActive) auto = setInterval(() => { const i = (lifeActive + 1) % ST_X.length; gsap.to(beadX, { x: ST_X[i], duration: 0.9, ease: "expo.inOut", onUpdate: () => paintLife(true) }); }, 3600);
        } });
        const stopAuto = () => clearInterval(auto);
        stations.forEach((s) => s.addEventListener("pointerdown", stopAuto));
        ctx.add(() => () => clearInterval(auto));
      }
    }
    ctx.add(() => () => stations.forEach((s) => s.removeEventListener("click", onStation)));

    // Gates: the message travels as you scroll (large screens) or plays once (elsewhere)
    const trust = $(".trust");
    trust.classList.toggle("is-scrolly", scrolly);
    if (reduce) { tokenP.p = 1; paintGates(); }
    else if (scrolly) {
      const tp = gsap.quickTo(tokenP, "p", { duration: 0.5, ease: "power3", onUpdate: paintGates });
      ScrollTrigger.create({ trigger: ".trust__track", start: "top top", end: "bottom bottom", onUpdate: (s) => tp(gsap.utils.clamp(0, 1, (s.progress - 0.08) / 0.8)) });
    } else {
      tokenP.p = 0; paintGates();
      ScrollTrigger.create({ trigger: ".gates", start: "top 75%", once: true, onEnter: () => gsap.to(tokenP, { p: 1, duration: 4.2, ease: "power1.inOut", onUpdate: paintGates }) });
    }
  });

  // Thread: rebuilt after every layout refresh, follows scroll with a short lag.
  if (reduced) {
    tHead.style.display = "none";
  }
  ScrollTrigger.addEventListener("refresh", () => {
    buildThread();
    if (reduced) { tLine.style.strokeDashoffset = tGlow.style.strokeDashoffset = 0; }
    placeRoleThumb(); placeLangThumb(false);
    const [lang, text] = WORDS[li]; bClip.style.width = `${measure(text, lang)}px`;
    paintNav();
  });
  if (!reduced) ScrollTrigger.create({ start: 0, end: "max", onUpdate: () => T && lenTo(targetLen()) });

  // Pause CSS loops in sections nobody can see.
  $$("main > section, .constellation, .phone-stage, .life, .gates, .drift, .final__card").forEach((s) => {
    s.classList.add("is-offscreen");
    ScrollTrigger.create({ trigger: s, start: "top bottom", end: "bottom top", onToggle: (st) => s.classList.toggle("is-offscreen", !st.isActive) });
  });

  // ------------------------------------------------------------------ intro (after fonts, so lines measure right)
  const intro = () => {
    if (root.classList.contains("is-ready")) return;
    if (canMorph && !reduced) finalShape.setAttribute("d", DOT);
    if (reduced) { root.classList.add("is-ready"); ScrollTrigger.refresh(); return; }
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.from(".layer-rings", { scale: 0.55, autoAlpha: 0, svgOrigin: "260 260", duration: 1.8 }, 0)
      .from(".home", { scale: 0, svgOrigin: "260 260", duration: 1.3 }, 0.15)
      .from(".layer-nodes", { scale: 0.8, autoAlpha: 0, svgOrigin: "260 260", duration: 1.8 }, 0.35)
      .from(".hero__title .line > *", { yPercent: 110, duration: 1.2, stagger: 0.07 }, 0.25)
      .from(".hero [data-intro]", { autoAlpha: 0, y: 18, duration: 1, stagger: 0.08 }, 0.55);
    root.classList.add("is-ready");
    ScrollTrigger.refresh();
  };
  Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 900))]).then(intro);

  // Layout can change after images/fonts settle; keep the thread and pins in step.
  let rt;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => ScrollTrigger.refresh(), 200); }).observe(shell);
})();
