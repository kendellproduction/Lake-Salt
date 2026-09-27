/* ─────────────────────────────────────────────────────────────
   Lake Salt — motion & depth layer
   Progressive enhancement only: every page is complete without
   this file. Reveals share ONE IntersectionObserver; GSAP scrub is
   reserved for a handful of hero moments. Honors reduced motion.
───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  root.classList.add('ls-motion');

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function visible(el) { return !!el && getComputedStyle(el).display !== 'none'; }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html) n.innerHTML = html;
    n.setAttribute('aria-hidden', 'true');
    return n;
  }

  /* ── Line icons for the decorative emoji ───────────────────── */
  var ICONS = {
    cocktail: '<path d="M5 4h14l-7 8z"/><path d="M12 12v7"/><path d="M8 20h8"/><path d="M15.5 4 17.5 1.8"/>',
    flutes: '<path d="M6.5 3h4l-.4 5.6a1.6 1.6 0 0 1-3.2 0z"/><path d="M8.5 10.3V19"/><path d="M6 20h5"/><path d="M13.5 3h4l-.4 5.6a1.6 1.6 0 0 1-3.2 0z"/><path d="M15.5 10.3V19"/><path d="M13 20h5"/>',
    menu: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.6 2.6L16 9.6"/>',
    award: '<circle cx="12" cy="9" r="5.5"/><path d="m8.8 13.8-1.3 7 4.5-2.4 4.5 2.4-1.3-7"/>',
    utensils: '<path d="M7 3v7a2 2 0 0 0 2 2v9"/><path d="M11 3v7a2 2 0 0 1-2 2"/><path d="M9 3v5"/><path d="M17 21V3c-2 1.4-3 4-3 7v3h3"/>',
    shield: '<path d="M12 3 5 6v5c0 4.4 3 8 7 10 4-2 7-5.6 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    phone: '<path d="M5 4h3.5l2 5-2.4 1.5a11 11 0 0 0 5.4 5.4L15 13.5l5 2V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/><path d="M22 9v6"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.6"/>',
    facebook: '<path d="M14 21v-8h3l.5-3.5H14V7.6c0-1 .4-1.8 1.9-1.8H18V2.7c-.4-.1-1.6-.2-3-.2-3 0-4.7 1.8-4.7 5v2.1H7V13h3.3v8"/>'
  };
  var EMOJI = {
    '💍': 'cocktail', '🥂': 'flutes', '📋': 'menu', '✨': 'check',
    '🎓': 'award', '🍽': 'utensils', '🛡': 'shield',
    '📧': 'mail', '📞': 'phone', '📍': 'pin', '🕐': 'clock',
    '📸': 'instagram', '👍': 'facebook', '💬': 'chat'
  };
  function svg(name) {
    return '<svg class="ls-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';
  }
  function swapIcons() {
    $$('.wf-pillar .icon, .cert-icon, .ci-icon, .f-social a, .mobile-contact-bar a, .pillar .ico, .value-card .ico').forEach(function (node) {
      var text = (node.textContent || '').replace(/️/g, '').trim();
      var first = Array.from(text)[0] || '';
      var name = EMOJI[first];
      if (!name) return;
      if (node.closest('.ci-item, .contact-info') && first === '🎓') name = 'cap';
      var rest = text.slice(first.length).trim();
      node.innerHTML = svg(name) + (rest ? ' ' + rest : '');
    });
  }

  /* ── Decorative layers ─────────────────────────────────────── */
  function decorate() {
    if (!reduceMq.matches && window.innerWidth >= 900) document.body.appendChild(el('div', 'ls-grain'));

    var hero = $('.hero');
    if (hero && $('.hero-content', hero)) {
      hero.appendChild(el('div', 'ls-hero-veil'));
      hero.appendChild(el('div', 'ls-hero-glow'));
    }

    $$('.dry-hire, .menus-section, .contact-section').forEach(function (sec) {
      sec.insertBefore(el('div', 'ls-orb ls-orb-a'), sec.firstChild);
      sec.insertBefore(el('div', 'ls-orb ls-orb-b'), sec.firstChild);
    });

    var contact = $('.contact-section');
    if (contact) contact.insertBefore(el('div', 'ls-aurora', '<i></i><i></i><i></i>'), contact.firstChild);

    var steps = $('.dh-steps');
    if (steps && $$('.dh-step', steps).length > 1) steps.insertBefore(el('div', 'ls-steps-line', '<span></span>'), steps.firstChild);

    var flagship = $('.pp-flagship');
    if (flagship) flagship.appendChild(el('span', 'ls-shine'));

    swapIcons();
  }

  /* ── Pause perpetual CSS loops while they are off-screen ─────── */
  function pauseOffscreen() {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.classList.toggle('ls-paused', !e.isIntersecting); });
    });
    $$('.ls-aurora, .ls-shine').forEach(function (n) { io.observe(n); });
  }

  /* ── Reveals: one observer, staggered per batch ─────────────── */
  var REVEAL = [
    '.section-header', '.ii-wwd-eyebrow', '.ii-wwd-title', '.ii-wwd-lead', '.ii-wwd-grid li', '.ii-wwd-foot',
    '.ii-header', '.ii-feature',
    '.wf-content > *', '.dh-content > *:not(.dh-steps)', '.dh-step', '.dh-visual',
    '.service-card', '.pp-card', '#pricing-packages .section-inner > *:not(.section-header):not(.pp-grid)',
    '.menus-caption', '.t-carousel', '.meet-us-card', '.stat-item', '.faq-item', '.faq-img',
    '.contact-section .section-header', '.contact-info > *', '.contact-form',
    /* /weddings + /about */
    '.pillar', '.review', '.faq details', '.story > *', '.value-card', '.cta', 'section.block > img'
  ].join(',');

  function initReveals() {
    var targets = $$(REVEAL).filter(function (n) {
      return !n.closest('#onboarding, .hero, .corporate-editorial, .menus-grid-inner, .wf-images');
    });
    if (reduceMq.matches || !('IntersectionObserver' in window)) return;
    var vh = window.innerHeight;
    var io = new IntersectionObserver(function (entries) {
      var batch = entries.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; });
      batch.sort(function (a, b) { return a.compareDocumentPosition(b) & 2 ? 1 : -1; });
      batch.forEach(function (node, i) {
        io.unobserve(node);
        node.style.transitionDelay = Math.min(i * 70, 280) + 'ms';
        node.classList.add('ls-in');
        // Hand the element back to its own styles once it has arrived.
        setTimeout(function () {
          node.classList.remove('ls-rv', 'ls-rv-clip', 'ls-in');
          node.style.transitionDelay = '';
        }, 1100 + Math.min(i * 70, 280));
      });
    }, { rootMargin: '0px 0px 6% 0px', threshold: 0 });

    targets.forEach(function (node) {
      if (node.getBoundingClientRect().top < vh * 0.92) return; // already on screen: leave it alone
      node.classList.add('ls-rv');
      io.observe(node);
    });
    $$('.g-item').forEach(function (node) {
      if (node.getBoundingClientRect().top < vh * 0.92) return;
      node.classList.add('ls-rv', 'ls-rv-clip');
      io.observe(node);
    });
  }

  /* ── Scroll-linked moments (GSAP + ScrollTrigger) ───────────── */
  function initScroll() {
    var gsap = window.gsap, ST = window.ScrollTrigger;
    if (!gsap || !ST) return;
    gsap.registerPlugin(ST);

    var mm = gsap.matchMedia();
    mm.add({
      desktop: '(min-width: 900px) and (prefers-reduced-motion: no-preference)',
      mobile: '(max-width: 899px) and (prefers-reduced-motion: no-preference)'
    }, function (ctx) {
      var desk = ctx.conditions.desktop;
      var amp = desk ? 1 : 0.55;

      /* Hero — content lifts away, the photo drifts, a veil falls, and on
         desktop the hero holds still so the video section slides over it. */
      var hero = $('.hero');
      var editorial = $('.corporate-editorial');
      if (hero && $('.hero-content', hero)) {
        var heroTl = gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
        heroTl
          .to($('.hero-content', hero), { yPercent: -22, scale: 0.94, opacity: 0, ease: 'none' }, 0)
          .to($$('.hero-bg, .hero-corporate-video', hero), { yPercent: 10, scale: 1.1, ease: 'none' }, 0)
          .to($('.ls-hero-veil', hero), { opacity: 0.6, ease: 'none' }, 0)
          .to($('.ls-hero-glow', hero), { yPercent: -30, opacity: 0.4, ease: 'none' }, 0);
        if (desk && visible(editorial)) {
          ST.create({ trigger: hero, start: 'top top', end: 'bottom top', pin: true, pinSpacing: false });
        }
      }

      /* Video — opens from an inset, rounded frame to full-bleed as it arrives. */
      if (visible(editorial)) {
        var media = $('.corporate-editorial-media', editorial);
        var clipTarget = desk ? editorial : media;
        var inset = desk ? 'inset(0% 6% 0% 6% round 40px)' : 'inset(0% 5% 0% 5% round 26px)';
        gsap.fromTo(clipTarget, { clipPath: inset }, {
          clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
          scrollTrigger: { trigger: editorial, start: 'top bottom', end: 'top 12%', scrub: true }
        });
        gsap.fromTo(media, { scale: 1.22, yPercent: -4 }, {
          scale: 1, yPercent: 4, ease: 'none',
          scrollTrigger: { trigger: editorial, start: 'top bottom', end: 'bottom top', scrub: true }
        });
        var copy = $$('.corporate-editorial-copy > *', editorial);
        if (copy.length) {
          gsap.from(copy, {
            y: 46, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12,
            scrollTrigger: { trigger: editorial, start: 'top 45%', once: true }
          });
        }
      }

      /* Marquee — speeds up with scroll velocity, then eases back. */
      var marquee = $('.marquee-inner');
      if (marquee && marquee.getAnimations) {
        var anims = marquee.getAnimations({ subtree: true });
        if (anims.length) {
          var rate = 1, target = 1;
          ST.create({ trigger: marquee, start: 'top bottom', end: 'bottom top',
            onUpdate: function (self) { target = 1 + Math.min(Math.abs(self.getVelocity()) / 350, 5); } });
          gsap.ticker.add(function () {
            if (Math.abs(target - 1) < 0.01 && Math.abs(rate - 1) < 0.01) return;
            rate += (target - rate) * 0.1;
            target += (1 - target) * 0.06;
            anims.forEach(function (a) { a.playbackRate = rate; });
          });
        }
      }

      /* The Knot badge turns gently as it passes. */
      var knot = $('.knot-strip-inline .knot-badge img');
      if (knot) {
        gsap.fromTo(knot, { rotation: -14 }, { rotation: 14, ease: 'none',
          scrollTrigger: { trigger: knot, start: 'top bottom', end: 'bottom top', scrub: true } });
      }

      /* Wedding feature — the three images sit at three depths. */
      var wf = $('.wf-images');
      if (visible(wf)) {
        var wfST = { trigger: wf, start: 'top bottom', end: 'bottom top', scrub: true };
        gsap.fromTo($('.wf-img-main', wf), { y: 36 * amp }, { y: -36 * amp, ease: 'none', scrollTrigger: wfST });
        gsap.fromTo($('.wf-img-accent', wf), { y: 120 * amp, rotation: -7 }, { y: -80 * amp, rotation: 3, ease: 'none', scrollTrigger: wfST });
        gsap.fromTo($('.wf-label-float', wf), { y: 70 * amp }, { y: -60 * amp, ease: 'none', scrollTrigger: wfST });
      }

      /* Dry hire — a line pours down the steps and lights each one. */
      var steps = $('.dh-steps');
      var line = $('.ls-steps-line span', steps || document);
      if (steps && line) {
        var stepEls = $$('.dh-step', steps);
        // Span the line from the first step number's centre to the last one's.
        var placeLine = function () {
          var nums = $$('.step-num', steps);
          if (nums.length < 2) return;
          // offsetTop ignores the reveal transforms, so this is stable mid-animation.
          var within = function (n) {
            var x = 0, y = 0;
            while (n && n !== steps) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
            return { x: x, y: y };
          };
          var first = nums[0], last = nums[nums.length - 1];
          var a = within(first), b = within(last);
          var track = line.parentNode;
          track.style.left = (a.x + first.offsetWidth / 2 - 1) + 'px';
          track.style.top = (a.y + first.offsetHeight / 2) + 'px';
          track.style.bottom = 'auto';
          track.style.height = (b.y - a.y) + 'px';
        };
        placeLine();
        ST.addEventListener('refreshInit', placeLine);
        gsap.to(line, {
          scaleY: 1, ease: 'none',
          scrollTrigger: {
            trigger: steps, start: 'top 72%', end: 'bottom 55%', scrub: 0.4,
            onUpdate: function (self) {
              stepEls.forEach(function (s, i) {
                s.classList.toggle('ls-lit', self.progress >= (i / Math.max(stepEls.length - 1, 1)) - 0.02);
              });
            }
          }
        });
      }
      var dhImg = $('.dh-img');
      if (dhImg) {
        gsap.fromTo(dhImg, { yPercent: -6, scale: 1.08 }, { yPercent: 6, scale: 1, ease: 'none',
          scrollTrigger: { trigger: dhImg, start: 'top bottom', end: 'bottom top', scrub: true } });
      }
      var dhStat = $('.dh-stat-float');
      if (dhStat) {
        gsap.from(dhStat, { scale: 0.6, opacity: 0, rotation: -8, duration: 0.9, ease: 'back.out(1.8)',
          scrollTrigger: { trigger: dhStat, start: 'top 88%', once: true } });
      }

      /* Service + gallery photos drift inside their frames. */
      $$('.sc-image img, .g-item img').forEach(function (img) {
        gsap.fromTo(img, { yPercent: -12 }, { yPercent: 0, ease: 'none',
          scrollTrigger: { trigger: img.parentNode, start: 'top bottom', end: 'bottom top', scrub: true } });
      });

      /* Pricing — the starting prices count up once. */
      $$('.pp-card').forEach(function (card) {
        var walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        var node;
        while ((node = walker.nextNode())) {
          var m = /^\s*\$(\d{3,4})\s*$/.exec(node.nodeValue);
          if (!m) continue;
          (function (textNode, value) {
            var counter = { v: 0 };
            ST.create({ trigger: card, start: 'top 85%', once: true, onEnter: function () {
              gsap.to(counter, { v: value, duration: 1.4, ease: 'power3.out',
                onUpdate: function () { textNode.nodeValue = '$' + Math.round(counter.v); } });
            } });
          })(node, parseInt(m[1], 10));
        }
      });

      /* Menus — the three cards deal out from a stacked deck. */
      var menus = $$('.menus-grid-inner .menu-card');
      if (desk && menus.length === 3) {
        var spread = menus[1].getBoundingClientRect().left - menus[0].getBoundingClientRect().left;
        var deal = { trigger: '.menus-grid-inner', start: 'top 92%', end: 'top 30%', scrub: 0.6 };
        gsap.fromTo(menus[0], { x: spread * 0.8, rotation: -11, y: 40 }, { x: 0, rotation: -3, y: 0, ease: 'power1.out', scrollTrigger: deal });
        gsap.fromTo(menus[2], { x: -spread * 0.8, rotation: 11, y: 40 }, { x: 0, rotation: 3, y: 0, ease: 'power1.out', scrollTrigger: deal });
        gsap.fromTo(menus[1], { y: 70, scale: 0.94 }, { y: -12, scale: 1, ease: 'power1.out', scrollTrigger: deal });
      }

      /* Light orbs in the dark sections move slower than the page. */
      $$('.ls-orb').forEach(function (orb, i) {
        gsap.fromTo(orb, { yPercent: i % 2 ? -30 : 30 }, { yPercent: i % 2 ? 30 : -30, ease: 'none',
          scrollTrigger: { trigger: orb.parentNode, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
    });

    // Images and fonts change section heights; re-measure once they settle.
    window.addEventListener('load', function () { ST.refresh(); }, { once: true });
  }

  function start() {
    decorate();
    pauseOffscreen();
    initReveals();
    if (!reduceMq.matches) initScroll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
