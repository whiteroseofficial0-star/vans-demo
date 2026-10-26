(function () {
  "use strict";
  var site = document.getElementById("site");
  var data = null;

  // One section per page. Home keeps the hero and the gallery; everything else has its own URL.
  var PAGE = (function () {
    var p = location.pathname.replace(/\/+$/, "").toLowerCase();
    var m = /^\/(about|career|recognition|contact)(?:\.html)?$/.exec(p);
    if (!m) return "home";
    return m[1] === "recognition" ? "record" : m[1];
  })();

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  // The big name is split into letters so each one can rise in with a small delay.
  function letters(t) {
    return String(t == null ? "" : t).split("").map(function (ch, i) {
      return '<span class="ln" aria-hidden="true" style="--i:' + i + '">' + (ch === " " ? "&nbsp;" : esc(ch)) + '</span>';
    }).join("");
  }
  function shown(d) { return (d.works || []).filter(function (w) { return w.file && w.visible !== false; }); }
  function money(paise) { return "₹" + (Math.round(Number(paise || 0) / 100)).toLocaleString("en-IN"); }
  function sections(d) {
    var s = (d.settings || {}).sections || {};
    return { work: s.work !== false, about: s.about !== false, career: s.career !== false, record: s.record !== false, contact: s.contact !== false };
  }
  function pageMissing(label) {
    return '<section><div class="sec-head"><h2>' + esc(label) + '</h2></div><p class="sec-note">This page is not part of the site right now. <a href="/">Back to the start</a>.</p></section>';
  }

  function render(d) {
    var p = d.profile || {}, ab = d.about || {}, ws = sections(d).work ? shown(d) : [], lead = ws[0];
    var sec = sections(d);
    var career = sec.career ? (d.career || []) : [];
    var rec = sec.record ? (d.recognition || []).filter(function (g) { return (g.items || []).length; }) : [];
    var ct = d.contact || {}, hasContact = sec.contact && (ct.email || ct.phone || ct.website || ct.note);
    var hasAbout = sec.about && (ab.bio || ab.heading);
    var forSale = ws.filter(function (w) { return w.price > 0; });
    var links = [];
    if (ws.length) links.push(["work", "Work", "/"]);
    if (hasAbout) links.push(["about", "About", "/about"]);
    if (career.length) links.push(["career", "Career", "/career"]);
    if (rec.length) links.push(["record", "Recognition", "/recognition"]);
    if (hasContact) links.push(["contact", "Contact", "/contact"]);

    var nav = '<header class="nav"><a class="brand" href="/">' + esc(p.name || "Portfolio") + '</a><ul>' +
      links.map(function (l) {
        return '<li><a class="lnk" href="' + l[2] + '"' + (PAGE === l[0] ? ' aria-current="page"' : "") + '>' + l[1] + '</a></li>';
      }).join("") + '</ul></header>';

    var facts = (p.facts || []).filter(function (f) { return f.label || f.value; }).map(function (f) { return '<li><b>' + esc(f.label) + '</b> ' + esc(f.value) + '</li>'; }).join("");
    var eyebrow = [p.tagline, p.location].filter(Boolean).join(" · ");
    var portraits = (p.portraits || []).filter(function (x) { return x && x.file; });
    var heroText = (eyebrow ? '<p class="eyebrow">' + esc(eyebrow) + '</p>' : "") +
      '<h1 aria-label="' + esc(p.name || "") + '">' + letters(p.name || "") + '</h1>' +
      (p.alias ? '<p class="real-name">' + esc(p.alias) + '</p>' : "") +
      (facts ? '<ul class="facts">' + facts + '</ul>' : "");
    var hero;
    if (portraits.length) {
      // One figure holds every portrait: the photo fades from one to the next and the text stays beside it.
      var slides = portraits.map(function (pt, i) {
        return '<img class="' + (i === 0 ? "is-on" : "") + '" alt="' + esc(pt.alt || ("Portrait of " + (p.alias || p.name || "the artist"))) +
          '" src="' + esc(pt.file) + '">';
      }).join("");
      hero = '<div class="hero-band"><div class="hero"><div>' + heroText + '</div><figure class="hero-portrait">' + slides + '</figure></div></div>';
    } else {
      var plate = lead ? '<figure class="lead-plate"><button type="button" data-act="lb" data-i="0" aria-label="Open plate 1 in the viewer"><img alt="' + esc(lead.alt || lead.title || "Lead artwork") + '" src="' + esc(lead.file) + '"></button><figcaption class="cap">Plate 1' + (lead.medium ? " · " + esc(lead.medium) : "") + '</figcaption></figure>' : "";
      hero = '<div class="hero' + (plate ? "" : " solo") + '"><div>' + heroText + '</div>' + plate + '</div>';
    }

    var work = ws.length ? '<section id="work"><div class="sec-head"><h2>Selected work</h2><p class="sec-note">' + ws.length + (ws.length === 1 ? " plate" : " plates") +
      (forSale.length ? " · " + forSale.length + (forSale.length === 1 ? " for sale" : " for sale") : "") + ' · select a plate to view details</p></div><div class="wall">' +
      ws.map(function (w, i) {
        return '<figure class="plate"><button type="button" data-act="lb" data-i="' + i + '" aria-label="Open plate ' + (i + 1) + ' in the viewer"><img loading="lazy" alt="' + esc(w.alt || w.title || "Artwork") + '" src="' + esc(w.file) + '"></button><figcaption><span><b>Plate ' + (i + 1) + '</b>' + (w.title ? " · " + esc(w.title) : "") + '</span><span>' + [w.price > 0 ? money(w.price * 100) : "", w.dimensions || ""].filter(Boolean).map(esc).join(" · ") + '</span></figcaption></figure>';
      }).join("") + '</div></section>' : "";

    var paras = String(ab.bio || "").split(/\n{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
    var aboutPortrait = portraits.length ? '<figure class="portrait about-portrait"><div class="portrait-frame"><img class="is-on" alt="' + esc(portraits[0].alt || ("Portrait of " + (p.alias || p.name || "the artist"))) + '" src="' + esc(portraits[0].file) + '"></div><figcaption class="cap">' + esc(p.alias || p.name || "Portrait") + '</figcaption></figure>' : "";
    var about = hasAbout ? '<section id="about"><div class="sec-head"><h2>About the artist</h2></div><div class="about"><div>' + (ab.heading ? '<h3>' + esc(ab.heading) + '</h3>' : "") + aboutPortrait + '</div><div>' +
      (ab.pull ? '<p class="pull">' + esc(ab.pull) + '</p>' : "") + paras.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join("") + '</div></div></section>' : "";

    var car = career.length ? '<section id="career"><div class="sec-head"><h2>Career</h2></div><ol class="timeline">' + career.map(function (c) {
      return '<li><span class="yr">' + esc(c.year) + '</span><div><h4>' + esc(c.title) + '</h4>' + (c.text ? '<p>' + esc(c.text) + '</p>' : "") + '</div></li>';
    }).join("") + '</ol></section>' : "";

    var recH = rec.length ? '<section id="record"><div class="sec-head"><h2>Recognition</h2></div><div class="record">' + rec.map(function (g) {
      return '<div><h3>' + esc(g.heading) + '</h3><ul>' + g.items.map(function (it) { return '<li>' + esc(it.title) + (it.detail ? '<span>' + esc(it.detail) + '</span>' : "") + '</li>'; }).join("") + '</ul></div>';
    }).join("") + '</div></section>' : "";

    var cont = "";
    if (hasContact) {
      var dl = "";
      if (ct.email) dl += '<div><dt>Email</dt><dd><span>' + esc(ct.email) + '</span><button type="button" class="btn sm" data-act="copy" data-v="' + esc(ct.email) + '">Copy</button></dd></div>';
      if (ct.phone) dl += '<div><dt>Phone</dt><dd><span>' + esc(ct.phone) + '</span><button type="button" class="btn sm" data-act="copy" data-v="' + esc(ct.phone) + '">Copy</button></dd></div>';
      if (ct.website && /^https?:\/\//i.test(ct.website)) dl += '<div><dt>Website</dt><dd><a href="' + esc(ct.website) + '" target="_blank" rel="noopener noreferrer">' + esc(ct.website) + '</a></dd></div>';
      cont = '<section id="contact"><div class="sec-head"><h2>Contact</h2></div><dl class="contact">' + dl + '</dl>' + (ct.note ? '<p>' + esc(ct.note) + '</p>' : "") + '</section>';
    }
    var f = d.footer || {};
    var body = PAGE === "about" ? (hasAbout ? about : pageMissing("About"))
      : PAGE === "career" ? (car || pageMissing("Career"))
      : PAGE === "record" ? (recH || pageMissing("Recognition"))
      : PAGE === "contact" ? (cont || pageMissing("Contact"))
      : hero + work;
    site.innerHTML = nav + body + '<footer><span>' + esc(f.left || "") + '</span><span>' + esc(f.right || "") + '</span></footer>';

    renderRail(d);
    startPortraits();
    data.shownWorks = ws;
  }

  /* the hero photos fade from one to the next inside the same figure, so the layout never shifts */
  var portraitTimer = null;
  function startPortraits() {
    if (portraitTimer) { clearInterval(portraitTimer); portraitTimer = null; }
    var imgs = site.querySelectorAll(".hero-portrait img");
    var n = imgs.length;
    if (n < 2) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var at = 0;
    var FADE = 1400;
    portraitTimer = setInterval(function () {
      var prev = at;
      at = (at + 1) % n;
      var incoming = imgs[at], outgoing = imgs[prev];
      incoming.classList.remove("is-out");
      incoming.classList.add("is-on", "is-in");
      if (outgoing !== incoming) outgoing.classList.add("is-out");
      setTimeout(function () {
        // the new photo is fully painted now: settle it, then let the old one fade away beneath it
        incoming.classList.remove("is-in");
        if (outgoing !== incoming) outgoing.classList.remove("is-on", "is-out");
      }, FADE);
    }, 7000);
  }

  /* side panel: WhatsApp, call and Instagram buttons, always shown, each inactive until it has a value */
  var RAIL_ICONS = {
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.04 2C6.58 2 2.14 6.44 2.14 11.9c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0 0 12.04 2Zm0 18.05h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.23 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.64 4.19 3.7.58.25 1.04.4 1.4.51.59.19 1.13.16 1.55.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z"/></svg>',
    call: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6.6 3h2.9l1.3 3.8-2 1.4a12.4 12.4 0 0 0 6.9 6.9l1.4-2 3.8 1.3v2.9a2.7 2.7 0 0 1-3 2.7C11.1 22.5 1.5 12.9 1.4 6.3A2.7 2.7 0 0 1 4.1 3h2.5Z"/></svg>',
    insta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5.2"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>'
  };
  function railLink(kind, href, label, external) {
    return '<a class="rail-btn ' + kind + '" href="' + esc(href) + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"' +
      (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + RAIL_ICONS[kind] +
      '<span class="rail-label" aria-hidden="true">' + esc(label) + '</span></a>';
  }
  // No value set yet: keep the button in place so the rail never shifts, but give it nothing to open.
  function railOff(kind, label) {
    return '<span class="rail-btn ' + kind + ' is-off" role="link" aria-disabled="true" title="' + esc(label) + ' not set">' +
      RAIL_ICONS[kind] + '<span class="rail-label" aria-hidden="true">' + esc(label) + ' not set</span></span>';
  }
  function renderRail(d) {
    var el = document.getElementById("rail");
    if (!el) return;
    var c = ((d.settings || {}).contact) || {};
    var wa = String(c.whatsapp || "").replace(/\D/g, "");
    var call = String(c.call || "").replace(/[^\d+]/g, "");
    var insta = String(c.instagram || "");
    var out = "";
    out += wa ? railLink("wa", "https://wa.me/" + wa, "WhatsApp", true) : railOff("wa", "WhatsApp");
    out += call ? railLink("call", "tel:" + call, "Call", false) : railOff("call", "Call");
    out += /^https:\/\/instagram\.com\/[A-Za-z0-9._]{1,30}$/.test(insta)
      ? railLink("insta", insta, "Instagram", true)
      : railOff("insta", "Instagram");
    el.innerHTML = out;
    el.hidden = false;
  }

  /* lightbox */
  var lb = document.getElementById("lb"), lbImg = document.getElementById("lb-img"), cur = 0, opener = null;
  function shownNow() { return (data && data.shownWorks) || shown(data || {}); }
  function showLb(i) {
    var ws = shownNow(); if (!ws.length) return;
    cur = (i + ws.length) % ws.length;
    var w = ws[cur];
    lbImg.src = w.file; lbImg.alt = w.alt || w.title || "Artwork";
    document.getElementById("lb-eyebrow").textContent = "Plate " + (cur + 1) + " of " + ws.length;
    document.getElementById("lb-title").textContent = w.title || "Untitled";
    document.getElementById("lb-medium").textContent = w.medium || "Not recorded";
    document.getElementById("lb-dim").textContent = w.dimensions || "Not recorded";
    document.getElementById("lb-year").textContent = w.year || "Not recorded";
    var buyRow = document.getElementById("lb-buy");
    document.getElementById("lb-price").textContent = w.price > 0 ? money(w.price * 100) + " · downloadable copy after approval" : "";
    buyRow.hidden = !(w.price > 0);
  }
  function openLb(i, el) { opener = el; showLb(i); lb.hidden = false; lb.classList.add("open"); document.getElementById("lb-close").focus(); }
  function closeLb() { lb.classList.remove("open"); lb.hidden = true; if (opener && document.contains(opener)) opener.focus(); }
  document.getElementById("lb-close").addEventListener("click", closeLb);
  document.getElementById("lb-prev").addEventListener("click", function () { showLb(cur - 1); });
  document.getElementById("lb-next").addEventListener("click", function () { showLb(cur + 1); });
  lb.addEventListener("click", function (e) { if (e.target === lb || e.target.classList.contains("lb-stage")) closeLb(); });

  /* buy dialog */
  var buy = document.getElementById("buy"), buyWork = null, buyOpener = null, buyBusy = false;
  function buyMsg(t) { var m = document.getElementById("buy-msg"); if (m) m.textContent = t || ""; }
  function openBuy(i, el) {
    var ws = shownNow();
    var w = ws[i];
    if (!w || !(w.price > 0)) return;
    buyWork = w; buyOpener = el || null;
    document.getElementById("buy-h").textContent = w.title || "Plate " + (i + 1);
    document.getElementById("buy-price").textContent = money(w.price * 100) + " · " + (w.medium || "original artwork");
    var form = document.getElementById("buy-form"), done = document.getElementById("buy-done");
    form.hidden = false; done.hidden = true;
    document.getElementById("buy-pay").disabled = false;
    buyMsg("");
    buy.hidden = false;
    buy.classList.add("open");
    document.getElementById("buy-name").focus();
  }
  function closeBuy() {
    if (buyBusy) return;
    buy.classList.remove("open"); buy.hidden = true;
    if (buyOpener && document.contains(buyOpener)) buyOpener.focus();
  }
  document.getElementById("lb-buy-btn").addEventListener("click", function () {
    closeLb(); openBuy(cur, null);
  });
  document.getElementById("buy-close").addEventListener("click", closeBuy);
  document.getElementById("buy-cancel").addEventListener("click", closeBuy);
  buy.addEventListener("click", function (e) { if (e.target === buy) closeBuy(); });

  function postJson(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || "That did not go through.");
        return j;
      });
    });
  }
  function loadRazorpay() {
    if (window.Razorpay) return Promise.resolve(window.Razorpay);
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = function () { window.Razorpay ? res(window.Razorpay) : rej(new Error("The payment window could not load.")); };
      s.onerror = function () { rej(new Error("The payment window could not load. Check the internet connection.")); };
      document.head.appendChild(s);
    });
  }
  function verifyPayment(r) {
    buyMsg("Confirming the payment…");
    postJson("/api/checkout/verify", r).then(function (o) {
      buyBusy = false;
      var url = location.origin + o.url;
      var link = document.getElementById("buy-link");
      link.href = url; link.dataset.url = url;
      document.getElementById("buy-form").hidden = true;
      document.getElementById("buy-done").hidden = false;
      document.getElementById("buy-pay").disabled = false;
      document.getElementById("buy-copy").textContent = "Copy order link";
    }).catch(function (err) {
      buyBusy = false;
      document.getElementById("buy-pay").disabled = false;
      buyMsg(err.message);
    });
  }
  document.getElementById("buy-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!buyWork) return;
    var name = document.getElementById("buy-name").value.trim();
    var email = document.getElementById("buy-email").value.trim();
    var phone = document.getElementById("buy-phone").value.trim();
    if (!name) { buyMsg("Add your name."); document.getElementById("buy-name").focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { buyMsg("Add a valid email address."); document.getElementById("buy-email").focus(); return; }
    buyBusy = true;
    var pay = document.getElementById("buy-pay");
    pay.disabled = true;
    buyMsg("Opening secure payment…");
    postJson("/api/checkout", { workId: buyWork.id, name: name, email: email, phone: phone }).then(function (o) {
      return loadRazorpay().then(function (Razorpay) {
        var rzp = new Razorpay({
          key: o.keyId, amount: o.amount, currency: o.currency, order_id: o.razorpayOrderId,
          name: o.siteName, description: o.workTitle,
          prefill: { name: name, email: email, contact: phone },
          theme: { color: o.accent || "#1f6f8b" },
          handler: function (r) { verifyPayment(r); },
          modal: { ondismiss: function () { buyBusy = false; pay.disabled = false; buyMsg("Payment window closed. Nothing has been charged."); } }
        });
        rzp.on("payment.failed", function (r) {
          buyBusy = false; pay.disabled = false;
          buyMsg((r.error && r.error.description) || "The payment did not go through. Try again.");
        });
        rzp.open();
      });
    }).catch(function (err) {
      buyBusy = false; pay.disabled = false; buyMsg(err.message);
    });
  });
  document.getElementById("buy-copy").addEventListener("click", function () {
    var link = document.getElementById("buy-link"), btn = this;
    var url = link.dataset.url || link.href;
    try {
      navigator.clipboard.writeText(url).then(function () { btn.textContent = "Copied"; }, function () { btn.textContent = "Copy failed"; });
    } catch (err) { btn.textContent = "Copy failed"; }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!buy.hidden) { closeBuy(); return; }
      if (!lb.hidden) { closeLb(); return; }
    }
    if (lb.hidden) return;
    if (e.key === "ArrowLeft") showLb(cur - 1);
    if (e.key === "ArrowRight") showLb(cur + 1);
  });
  site.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]"); if (!t) return;
    if (t.dataset.act === "lb") openLb(+t.dataset.i, t);
    else if (t.dataset.act === "copy") {
      try { navigator.clipboard.writeText(t.dataset.v).then(function () { t.textContent = "Copied"; }, function () {}); } catch (err) { /* clipboard blocked */ }
    }
  });

  fetch("/api/site", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("load"); return r.json(); }).then(function (d) {
    data = d; render(d);
  }).catch(function () {
    site.innerHTML = '<p class="empty">The portfolio could not be loaded. Refresh the page to try again.</p>';
  });
})();
