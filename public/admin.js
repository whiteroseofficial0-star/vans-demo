(function () {
  "use strict";
  var root = document.getElementById("root");
  var saved = null, draft = null, tab = "orders", msg = "", msgErr = false, delWork = null, delTimer = null, busy = false;
  var orders = [], ordersLoaded = false, ordersError = "";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function getPath(o, path) { return path.split(".").reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function setPath(o, path, v) { var ks = path.split("."), last = ks.pop(); ks.reduce(function (a, k) { return a[k]; }, o)[last] = v; }
  function newId() { return "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function dirty() { return JSON.stringify(draft) !== JSON.stringify(saved); }

  function api(method, url, body) {
    return fetch(url, { method: method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || "That did not go through."); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  /* ---------- login ---------- */
  function showLogin(note) {
    root.innerHTML = '<form class="login" id="login-form"><h1>Site admin</h1><p>Enter the admin password to edit the portfolio.</p>' +
      '<label for="pw">Password<input id="pw" type="password" autocomplete="current-password" required><button type="button" id="pw-show" class="inln" aria-pressed="false">Show</button></label>' +
      '<p class="msg err" id="login-msg" role="status">' + esc(note || "") + '</p>' +
      '<div class="ctl"><button type="submit" class="btn primary">Log in</button></div></form>';
    document.getElementById("pw").focus();
    (function () {
      var pw = document.getElementById("pw");
      var show = document.getElementById("pw-show");
      var visible = false;
      function apply() {
        pw.type = visible ? "text" : "password";
        show.setAttribute("aria-pressed", String(visible));
        show.textContent = visible ? "Hide" : "Show";
      }
      show.addEventListener("click", function () { visible = !visible; apply(); });
      apply();
    })();

    document.getElementById("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var m = document.getElementById("login-msg"); m.textContent = "";
      api("POST", "/api/login", { password: document.getElementById("pw").value }).then(load).catch(function (err) { m.textContent = err.message; });
    });
  }

  function load() {
    return api("GET", "/api/site").then(function (s) { saved = s; draft = clone(s); render(); loadOrders(); }).catch(function (err) { showLogin(err.message); });
  }
  function loadOrders() {
    return api("GET", "/api/orders").then(function (list) {
      orders = list || []; ordersLoaded = true; ordersError = "";
      if (tab === "orders") render(); else updateOrderTab();
    }).catch(function (err) {
      ordersLoaded = true; ordersError = err.message;
      if (tab === "orders") render();
    });
  }
  function updateOrderTab() {
    var b = root.querySelector('[data-op="tab"][data-tab="orders"]');
    if (b) b.textContent = tabLabel("orders", "Orders");
  }
  function tabLabel(key, label) {
    if (key !== "orders") return label;
    var n = orders.filter(function (o) { return o.status === "awaiting_approval"; }).length;
    return n ? "Orders (" + n + ")" : "Orders";
  }
  function money(paise) { return "₹" + Math.round(Number(paise || 0) / 100).toLocaleString("en-IN"); }
  var ORDER_STATE = { created: "Not paid", awaiting_approval: "Waiting for approval", approved: "Approved", rejected: "Declined" };

  /* ---------- editor ---------- */
  var TABS = [["orders", "Orders"], ["profile", "Profile"], ["works", "Artworks"], ["about", "About"], ["career", "Career"], ["record", "Recognition"], ["contact", "Contact and footer"], ["look", "Appearance"], ["password", "Password"]];
  var TEMPLATES = { "profile.facts": { label: "", value: "" }, career: { year: "", title: "", text: "" }, recognition: { heading: "New group", items: [] } };

  function fld(label, path, val, o) {
    o = o || {};
    var id = "f-" + path.replace(/\./g, "-");
    var inner = o.area ? '<textarea id="' + id + '" data-bind="' + path + '" rows="' + (o.rows || 4) + '">' + esc(val) + '</textarea>'
      : '<input id="' + id + '" type="text" data-bind="' + path + '" value="' + esc(val) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : "") + '>';
    return '<label for="' + id + '">' + esc(label) + inner + (o.hint ? '<span class="hint">' + esc(o.hint) + '</span>' : "") + '</label>';
  }
  function sel(label, path, val, opts) {
    var id = "f-" + path.replace(/\./g, "-");
    return '<label for="' + id + '">' + esc(label) + '<select id="' + id + '" data-bind="' + path + '">' +
      opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === val ? " selected" : "") + '>' + esc(o[1]) + '</option>'; }).join("") +
      '</select></label>';
  }
  function chk(label, path, val, hint) {
    var id = "f-" + path.replace(/\./g, "-");
    return '<label class="check" for="' + id + '"><input id="' + id + '" type="checkbox" data-bind="' + path + '"' + (val !== false ? " checked" : "") + '> ' + esc(label) + '</label>' +
      (hint ? '<p class="hint">' + esc(hint) + '</p>' : "");
  }
  function ctl(arr, i, n) {
    return '<span class="ctl"><button type="button" class="btn sm" data-op="move" data-arr="' + arr + '" data-i="' + i + '" data-d="-1"' + (i === 0 ? " disabled" : "") + '>Up</button>' +
      '<button type="button" class="btn sm" data-op="move" data-arr="' + arr + '" data-i="' + i + '" data-d="1"' + (i === n - 1 ? " disabled" : "") + '>Down</button>' +
      '<button type="button" class="btn sm danger" data-op="remove" data-arr="' + arr + '" data-i="' + i + '">Remove</button></span>';
  }

  function portraitPanel(p) {
    var list = p.portraits || [];
    var h = '<h3>Portrait photos on the home page</h3>' +
      '<p class="hint">They crossfade slowly, in this order. The first photo shows first.</p>';
    list.forEach(function (pt, i) {
      h += '<div class="item"><div class="wk"><img class="thumb" alt="" src="' + esc(pt.file) + '"><div><strong>Photo ' + (i + 1) + '</strong></div></div>' +
        fld("Description for screen readers", "profile.portraits." + i + ".alt", pt.alt, { area: true, rows: 2 }) +
        '<div class="item-head"><label for="pup-' + i + '">Replace image<input id="pup-' + i + '" type="file" accept="image/jpeg,image/png,image/webp" data-upload="portrait-' + i + '"></label>' +
        ctl("profile.portraits", i, list.length) + '</div></div>';
    });
    h += '<label for="up-portrait">Add a portrait photo<input id="up-portrait" type="file" accept="image/jpeg,image/png,image/webp" data-upload="portrait-new"><span class="hint">JPEG, PNG or WebP. Select Save changes afterwards. With no photos, the home page shows the first artwork instead.</span></label>';
    return h;
  }

  function panelHtml() {
    var d = draft, h = "";
    if (tab === "orders") {
      h += '<p class="msg">A buyer pays on the site, then the order waits here. Approve it to unlock the download, or decline it if the payment should not be accepted.</p>' +
        '<div><button type="button" class="btn sm" data-op="reloadorders">Reload orders</button></div>';
      if (!ordersLoaded) h += '<p class="msg">Loading orders…</p>';
      else if (ordersError) h += '<p class="msg err">' + esc(ordersError) + '</p>';
      else if (!orders.length) h += '<p class="msg">No orders yet.</p>';
      else h += orders.map(function (o) {
        var when = o.createdAt ? new Date(o.createdAt).toLocaleString() : "";
        var btns = "";
        if (o.status !== "created") {
          btns = '<span class="ctl">' +
            (o.status === "approved" ? "" : '<button type="button" class="btn sm" data-op="order" data-action="approve" data-id="' + esc(o.id) + '">Approve</button>') +
            (o.status === "rejected" ? "" : '<button type="button" class="btn sm danger" data-op="order" data-action="reject" data-id="' + esc(o.id) + '">' + (o.status === "approved" ? "Revoke access" : "Decline") + '</button>') +
            '</span>';
        }
        return '<div class="item order-row"><div class="item-head"><div><strong>' + esc(o.title) + '</strong>' +
          '<div class="hint">' + esc(money(o.amount)) + ' · ' + esc(when) + '</div></div>' +
          '<span class="badge ' + esc(o.status) + '">' + esc(ORDER_STATE[o.status] || o.status) + '</span></div>' +
          '<dl class="order-who">' +
          '<div><dt>Buyer</dt><dd>' + esc(o.buyer.name) + '</dd></div>' +
          '<div><dt>Email</dt><dd><a href="mailto:' + esc(o.buyer.email) + '">' + esc(o.buyer.email) + '</a></dd></div>' +
          (o.buyer.phone ? '<div><dt>Phone</dt><dd>' + esc(o.buyer.phone) + '</dd></div>' : '') +
          (o.paymentId ? '<div><dt>Payment id</dt><dd>' + esc(o.paymentId) + '</dd></div>' : '') +
          '<div><dt>Buyer page</dt><dd><a href="/order?t=' + esc(o.token) + '" target="_blank" rel="noopener">Open</a></dd></div>' +
          '</dl>' + (o.status === "created" ? '<p class="hint">The buyer has not completed the payment yet.</p>' : '') +
          (btns ? '<div class="item-head">' + btns + '</div>' : '') + '</div>';
      }).join("");
    } else if (tab === "profile") {
      var p = d.profile;
      h += fld("Name shown on the site", "profile.name", p.name) + fld("Full name or also known as", "profile.alias", p.alias) +
        '<div class="row2">' + fld("What they do", "profile.tagline", p.tagline, { ph: "Cartoonist and illustrator" }) + fld("Based in", "profile.location", p.location) + '</div>' +
        fld("Introduction under the name", "profile.lede", p.lede, { area: true, rows: 4 }) + portraitPanel(p) + '<h3>Quick facts</h3>';
      (p.facts || []).forEach(function (f, i) {
        h += '<div class="item"><div class="row2">' + fld("Label", "profile.facts." + i + ".label", f.label, { ph: "Born" }) + fld("Value", "profile.facts." + i + ".value", f.value) + '</div>' + ctl("profile.facts", i, p.facts.length) + '</div>';
      });
      h += '<div><button type="button" class="btn" data-op="add" data-arr="profile.facts">Add a fact</button></div>';
    } else if (tab === "works") {
      h += '<label for="up-new">Add artwork<input id="up-new" type="file" accept="image/jpeg,image/png,image/webp" data-upload="new"><span class="hint">JPEG, PNG or WebP. Large images are scaled to 1600 px. Select Save changes afterwards to put it on the site.</span></label>';
      (d.works || []).forEach(function (w, i) {
        h += '<div class="item"><div class="wk"><img class="thumb" alt="" src="' + esc(w.file) + '"><div><strong>Plate ' + (i + 1) + '</strong><br><span class="hint">' + (w.visible === false ? "Hidden from the site" : "Shown on the site") + '</span></div></div>' +
          fld("Title", "works." + i + ".title", w.title, { ph: "Leave blank for Untitled" }) +
          '<div class="row2">' + fld("Medium", "works." + i + ".medium", w.medium) + fld("Dimensions", "works." + i + ".dimensions", w.dimensions, { ph: "17.6 × 13 cm" }) + '</div>' +
          fld("Year", "works." + i + ".year", w.year, { ph: "Not recorded if blank" }) +
          fld("Price in ₹", "works." + i + ".price", w.price || "", { ph: "15000", hint: "Leave blank if it is not for sale. Buyers pay online, then you approve the order before the download opens." }) +
          fld("Image description for screen readers", "works." + i + ".alt", w.alt, { area: true, rows: 2 }) +
          '<label class="check" for="vis-' + i + '"><input id="vis-' + i + '" type="checkbox" data-bind="works.' + i + '.visible"' + (w.visible === false ? "" : " checked") + '> Show on the site</label>' +
          '<div class="item-head"><label for="rep-' + i + '">Replace image<input id="rep-' + i + '" type="file" accept="image/jpeg,image/png,image/webp" data-upload="' + i + '"></label>' +
          '<span class="ctl"><button type="button" class="btn sm" data-op="move" data-arr="works" data-i="' + i + '" data-d="-1"' + (i === 0 ? " disabled" : "") + '>Up</button><button type="button" class="btn sm" data-op="move" data-arr="works" data-i="' + i + '" data-d="1"' + (i === d.works.length - 1 ? " disabled" : "") + '>Down</button>' +
          (delWork === w.id ? '<button type="button" class="btn sm danger" data-op="remove" data-arr="works" data-i="' + i + '">Confirm delete</button>' : '<button type="button" class="btn sm danger" data-op="askdel" data-i="' + i + '">Delete</button>') + '</span></div></div>';
      });
    } else if (tab === "about") {
      var a = d.about;
      h += fld("Heading", "about.heading", a.heading) + fld("Highlighted line", "about.pull", a.pull, { area: true, rows: 2 }) +
        fld("Biography", "about.bio", a.bio, { area: true, rows: 14, hint: "Separate paragraphs with a blank line." });
    } else if (tab === "career") {
      (d.career || []).forEach(function (c, i) {
        h += '<div class="item"><div class="row2">' + fld("Year", "career." + i + ".year", c.year, { ph: "1976" }) + fld("Title", "career." + i + ".title", c.title) + '</div>' +
          fld("Details", "career." + i + ".text", c.text, { area: true, rows: 3 }) + ctl("career", i, d.career.length) + '</div>';
      });
      h += '<div><button type="button" class="btn" data-op="add" data-arr="career">Add a career entry</button></div>';
    } else if (tab === "record") {
      (d.recognition || []).forEach(function (g, gi) {
        h += '<div class="item">' + fld("Group heading", "recognition." + gi + ".heading", g.heading, { ph: "Awards" });
        (g.items || []).forEach(function (it, ii) {
          h += '<div class="item">' + fld("Title", "recognition." + gi + ".items." + ii + ".title", it.title) + fld("Detail", "recognition." + gi + ".items." + ii + ".detail", it.detail) + ctl("recognition." + gi + ".items", ii, g.items.length) + '</div>';
        });
        h += '<div class="item-head"><button type="button" class="btn sm" data-op="add" data-arr="recognition.' + gi + '.items">Add an item</button>' + ctl("recognition", gi, d.recognition.length) + '</div></div>';
      });
      h += '<div><button type="button" class="btn" data-op="add" data-arr="recognition">Add a group</button></div>';
    } else if (tab === "contact") {
      var c = d.contact, f = d.footer;
      h += '<p class="msg">Contact details appear on the site only when they are filled in.</p>' +
        fld("Email", "contact.email", c.email) + fld("Phone", "contact.phone", c.phone) +
        fld("Website", "contact.website", c.website, { ph: "https://", hint: "Must start with https:// or http://" }) +
        fld("Note", "contact.note", c.note, { area: true, rows: 3 }) + '<h3>Footer</h3>' +
        fld("Left text", "footer.left", f.left) + fld("Right text", "footer.right", f.right);
    } else if (tab === "look") {
      var st = d.settings;
      h += '<p class="msg">These change the public site. Select Save changes to apply them.</p>' +
        '<h3>Colour and type</h3>' +
        sel("Colour mode", "settings.theme.mode", st.theme.mode, [["auto", "Match each visitor's device"], ["light", "Always light"], ["dark", "Always dark"]]) +
        '<label for="f-accent">Accent colour<input id="f-accent" type="color" data-bind="settings.theme.accent" value="' + esc(st.theme.accent) + '"></label>' +
        sel("Headings font", "settings.theme.fonts", st.theme.fonts, [["serif", "Serif · Instrument Serif"], ["sans", "Sans · Figtree"], ["mono", "Mono · DM Mono"]]) +
        '<h3>Side panel buttons</h3>' +
        fld("WhatsApp number", "settings.contact.whatsapp", st.contact.whatsapp, { ph: "+91 98765 43210", hint: "Include the country code. Without a number the button is shown, dimmed and inactive." }) +
        fld("Call number", "settings.contact.call", st.contact.call, { ph: "+91 98765 43210", hint: "Include the country code. Without a number the button is shown, dimmed and inactive." }) +
        fld("Instagram", "settings.contact.instagram", st.contact.instagram, { ph: "@vinscartoons or a profile link", hint: "A handle or a full instagram.com link. Without it the button is shown, dimmed and inactive." }) +
        '<h3>Sections on the site</h3>' +
        chk("Artworks", "settings.sections.work", st.sections.work, "The work section and the lead plate in the header.") +
        chk("About", "settings.sections.about", st.sections.about) +
        chk("Career", "settings.sections.career", st.sections.career) +
        chk("Recognition", "settings.sections.record", st.sections.record) +
        chk("Contact", "settings.sections.contact", st.sections.contact, "The side panel buttons stay either way.");
    } else if (tab === "password") {
      h += '<p class="msg">Changing the password signs out every other session.</p>' +
        '<label for="pw-cur">Current password<input id="pw-cur" type="password" autocomplete="current-password"></label>' +
        '<label for="pw-new">New password<input id="pw-new" type="password" autocomplete="new-password"><span class="hint">At least 8 characters.</span></label>' +
        '<label for="pw-new2">New password again<input id="pw-new2" type="password" autocomplete="new-password"></label>' +
        '<div><button type="button" class="btn primary" data-op="changepw">Change password</button></div>';
    }
    return h;
  }

  function render() {
    var y = window.scrollY;
    var x = dirty();
    root.innerHTML = '<div class="bar"><h1>Site admin</h1><span class="ctl"><a class="btn" href="/" target="_blank" rel="noopener">View site</a>' +
      '<button type="button" class="btn primary" data-op="save"' + (x && !busy ? "" : " disabled") + '>Save changes</button>' +
      '<button type="button" class="btn" data-op="logout">Log out</button></span>' +
      '<p class="state' + (x ? " dirty" : "") + '" id="state">' + (x ? "Unsaved changes. Visitors still see the last saved version." : "All changes saved.") + '</p></div>' +
      '<div class="tabs" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" aria-selected="' + (tab === t[0]) + '" data-op="tab" data-tab="' + t[0] + '">' + tabLabel(t[0], t[1]) + '</button>'; }).join("") + '</div>' +
      '<div class="panel">' + panelHtml() + '</div>' +
      '<p class="msg' + (msgErr ? " err" : "") + '" id="msg" role="status">' + esc(msg) + '</p>';
    window.scrollTo(0, y);
  }
  function refreshState() {
    var s = document.getElementById("state"), b = root.querySelector('[data-op="save"]'), x = dirty();
    if (s) { s.textContent = x ? "Unsaved changes. Visitors still see the last saved version." : "All changes saved."; s.classList.toggle("dirty", x); }
    if (b) b.disabled = !x || busy;
  }
  function setMsg(t, err) { msg = t; msgErr = !!err; var m = document.getElementById("msg"); if (m) { m.textContent = t; m.classList.toggle("err", !!err); } }

  root.addEventListener("input", function (e) {
    var t = e.target;
    if (!t.dataset || !t.dataset.bind || !draft) return;
    setPath(draft, t.dataset.bind, t.type === "checkbox" ? t.checked : t.value);
    if (t.type === "checkbox") render(); else refreshState();
  });

  function shrink(file) {
    return createImageBitmap(file).then(function (bmp) {
      var r = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(bmp.width * r)); c.height = Math.max(1, Math.round(bmp.height * r));
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error("That image could not be read.")); }, "image/jpeg", 0.85); });
    }).then(function (b) {
      return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(new Error("That image could not be read.")); }; fr.readAsDataURL(b); });
    });
  }
  root.addEventListener("change", function (e) {
    var t = e.target;
    if (!t.dataset || t.dataset.upload === undefined) return;
    var file = t.files && t.files[0]; if (!file) return;
    setMsg("Uploading image.", false);
    shrink(file).then(function (url) { return api("POST", "/api/upload", { dataUrl: url }); }).then(function (r) {
      var up = t.dataset.upload;
      if (up === "new") draft.works.push({ id: newId(), file: r.file, title: "", medium: "", dimensions: "", year: "", alt: "", visible: true });
      else if (up === "portrait-new") { draft.profile.portraits = draft.profile.portraits || []; draft.profile.portraits.push({ file: r.file, alt: "" }); }
      else if (/^portrait-\d+$/.test(up)) draft.profile.portraits[+up.slice(8)].file = r.file;
      else draft.works[+up].file = r.file;
      msg = "Image uploaded. Select Save changes to put it on the site."; msgErr = false; render();
    }).catch(function (err) { if (err.status === 401) return showLogin("Your session ended. Log in again."); setMsg(err.message, true); });
  });

  function cleanDraft() {
    var d = clone(draft);
    d.works = (d.works || []).map(function (w) {
      var n = Math.round(Number(String(w.price == null ? "" : w.price).replace(/[^\d.]/g, "")));
      w.price = Number.isFinite(n) && n > 0 ? Math.min(50000000, n) : 0;
      return w;
    });
    d.career = (d.career || []).filter(function (c) { return c.year || c.title || c.text; });
    d.profile.facts = (d.profile.facts || []).filter(function (f) { return f.label || f.value; });
    d.profile.portraits = (d.profile.portraits || []).filter(function (x) { return x && x.file; });
    d.recognition = (d.recognition || []).map(function (g) { g.items = (g.items || []).filter(function (it) { return it.title || it.detail; }); return g; }).filter(function (g) { return g.heading || g.items.length; });
    return d;
  }
  function save() {
    var d = cleanDraft();
    if (!d.profile.name) { setMsg("Add a name on the Profile tab before saving.", true); return; }
    if (d.contact.website && !/^https?:\/\//i.test(d.contact.website)) { setMsg("The website must start with https:// or http://", true); return; }
    busy = true; refreshState(); setMsg("Saving.", false);
    api("PUT", "/api/site", d).then(function (s) { saved = s; draft = clone(s); busy = false; msg = "Saved. The site is updated."; msgErr = false; render(); })
      .catch(function (err) { busy = false; if (err.status === 401) return showLogin("Your session ended. Log in again. Unsaved edits on this page are lost."); refreshState(); setMsg(err.message, true); });
  }

  root.addEventListener("click", function (e) {
    var t = e.target.closest("[data-op]"); if (!t) return;
    var op = t.dataset.op;
    if (op === "tab") { tab = t.dataset.tab; delWork = null; msg = ""; render(); return; }
    if (op === "save") { save(); return; }
    if (op === "logout") { api("POST", "/api/logout").then(function () { showLogin(""); }); return; }
    if (op === "move") {
      var arr = getPath(draft, t.dataset.arr), i = +t.dataset.i, j = i + (+t.dataset.d);
      if (j < 0 || j >= arr.length) return;
      var x = arr[i]; arr[i] = arr[j]; arr[j] = x; render(); return;
    }
    if (op === "add") {
      var key = /^recognition\.\d+\.items$/.test(t.dataset.arr) ? "item" : t.dataset.arr;
      getPath(draft, t.dataset.arr).push(key === "item" ? { title: "", detail: "" } : clone(TEMPLATES[key])); render(); return;
    }
    if (op === "askdel") {
      delWork = draft.works[+t.dataset.i].id; clearTimeout(delTimer);
      delTimer = setTimeout(function () { delWork = null; if (tab === "works" && draft) render(); }, 5000);
      render(); return;
    }
    if (op === "remove") { getPath(draft, t.dataset.arr).splice(+t.dataset.i, 1); delWork = null; render(); return; }
    if (op === "reloadorders") {
      loadOrders().then(function () { setMsg("Orders reloaded.", false); });
      return;
    }
    if (op === "order") {
      var action = t.dataset.action === "approve" ? "approve" : "reject";
      t.disabled = true;
      api("POST", "/api/orders/decision", { id: t.dataset.id, action: action }).then(function (list) {
        orders = list || []; ordersError = "";
        setMsg(action === "approve" ? "Order approved. The buyer can download now." : "Order declined.", false);
        render();
      }).catch(function (err) { t.disabled = false; setMsg(err.message, true); });
      return;
    }
    if (op === "changepw") {
      var cur = document.getElementById("pw-cur").value, n1 = document.getElementById("pw-new").value, n2 = document.getElementById("pw-new2").value;
      if (n1 !== n2) { setMsg("The two new passwords do not match.", true); return; }
      if (n1.length < 8) { setMsg("The new password must be at least 8 characters.", true); return; }
      api("POST", "/api/password", { current: cur, next: n1 }).then(function () { msg = "Password changed."; msgErr = false; render(); })
        .catch(function (err) { setMsg(err.message, true); });
    }
  });

  window.addEventListener("beforeunload", function (e) { if (draft && dirty()) { e.preventDefault(); e.returnValue = ""; } });

  api("GET", "/api/me").then(function (r) { if (r.admin) load(); else showLogin(""); }).catch(function () { showLogin("The server could not be reached."); });
})();
