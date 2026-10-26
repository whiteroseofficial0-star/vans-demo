'use strict';
/*
 * Single-artist portfolio server. No npm packages needed: Node 18 or newer is enough.
 *   node server.js
 * Public site:  http://localhost:3000/
 * Admin panel:  http://localhost:3000/admin
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;

// Load .env (simple KEY=value lines). Real environment variables win.
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) { /* no .env file */ }

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const PUBLIC_DIR = path.join(ROOT, 'public');
const SEED_DIR = path.join(ROOT, 'seed');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'));
const SITE_FILE = path.join(DATA_DIR, 'site.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const CURRENCY = 'INR';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------- first-run seed ---------- */
if (!fs.existsSync(SITE_FILE)) fs.copyFileSync(path.join(SEED_DIR, 'site.json'), SITE_FILE);
if (fs.readdirSync(UPLOAD_DIR).length === 0) {
  const sd = path.join(SEED_DIR, 'uploads');
  if (fs.existsSync(sd)) for (const f of fs.readdirSync(sd)) fs.copyFileSync(path.join(sd, f), path.join(UPLOAD_DIR, f));
}

/* ---------- admin password ---------- */
let auth = null;
function hashPw(pw, salt) { return crypto.scryptSync(String(pw), salt, 64).toString('hex'); }
function setPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  auth = { salt, hash: hashPw(pw, salt) };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth), { mode: 0o600 });
}
function checkPassword(pw) {
  pw = String(pw || '');
  if (pw.length > 200) return false;
  const a = Buffer.from(hashPw(pw, auth.salt), 'hex');
  const b = Buffer.from(auth.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
try {
  auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
} catch (e) {
  let pw = process.env.ADMIN_PASSWORD;
  const generated = !pw;
  if (generated) pw = crypto.randomBytes(9).toString('base64url');
  setPassword(pw);
  if (generated) {
    console.log('\n  First run: your admin password is  ' + pw);
    console.log('  Log in at /admin and change it under "Password".\n');
  } else {
    console.log('\n  Admin password set from ADMIN_PASSWORD. Change it any time under "Password" in /admin.\n');
  }
}

/* ---------- sessions and login limits ---------- */
const SESSION_MS = 12 * 60 * 60 * 1000;
const sessions = new Map();
const attempts = new Map();

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function sessionToken(req) { return parseCookies(req).sid || ''; }
function isAuthed(req) {
  const t = sessionToken(req);
  const exp = sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
function clientIp(req) {
  if (TRUST_PROXY) {
    const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (f) return f;
  }
  return req.socket.remoteAddress || 'unknown';
}
function isHttps(req) {
  return !!req.socket.encrypted || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
}
function cookie(req, value, maxAgeSec) {
  return 'sid=' + value + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAgeSec + (isHttps(req) ? '; Secure' : '');
}

/* ---------- helpers ---------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
// Razorpay's checkout needs its script and frames, plus inline styles for the payment overlay.
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://*.razorpay.com; connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com; script-src 'self' https://checkout.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

function baseHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', CSP);
}
function send(res, status, obj, extra) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) }, extra || {}));
  res.end(body);
}
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, big = false;
    req.on('data', d => { size += d.length; if (size > max) big = true; else chunks.push(d); });
    req.on('end', () => big ? reject(Object.assign(new Error('That request is too large.'), { status: 413 })) : resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req, max) {
  if (!/application\/json/i.test(req.headers['content-type'] || '')) throw Object.assign(new Error('Send JSON.'), { status: 415 });
  const buf = await readBody(req, max);
  try { return JSON.parse(buf.toString('utf8')); } catch (e) { throw Object.assign(new Error('That request could not be read.'), { status: 400 }); }
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------- site data ---------- */
// Sections that get their own page instead of one long scrolling home page.
const PAGE_LABELS = { '/about': 'About', '/career': 'Career', '/recognition': 'Recognition', '/contact': 'Contact' };
const THEME_FONTS = {
  serif: '"Instrument Serif", Georgia, "Times New Roman", serif',
  sans: '"Figtree", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
};
function siteDefaults() {
  return {
    profile: { name: '', alias: '', tagline: '', location: '', lede: '', portraits: [], facts: [] },
    about: { heading: '', pull: '', bio: '' },
    works: [],
    career: [],
    recognition: [],
    contact: { email: '', phone: '', website: '', note: '' },
    footer: { left: '', right: '' },
    settings: {
      theme: { mode: 'auto', accent: '#b4552e', fonts: 'serif' },
      contact: { whatsapp: '', call: '', instagram: '' },
      sections: { work: true, about: true, career: true, record: true, contact: true }
    }
  };
}
// Fill in anything missing, so older data files and the admin panel always see the full shape.
function withDefaults(s) {
  const d = siteDefaults();
  s = s && typeof s === 'object' ? s : {};
  const out = Object.assign({}, d, s);
  out.profile = Object.assign({}, d.profile, s.profile || {});
  out.profile.portraits = portraitList(out.profile.portraits);
  out.about = Object.assign({}, d.about, s.about || {});
  out.contact = Object.assign({}, d.contact, s.contact || {});
  out.footer = Object.assign({}, d.footer, s.footer || {});
  const st = s.settings || {};
  out.settings = {
    theme: Object.assign({}, d.settings.theme, st.theme || {}),
    contact: Object.assign({}, d.settings.contact, st.contact || {}),
    sections: Object.assign({}, d.settings.sections, st.sections || {})
  };
  out.works = list(s.works, 60).map(w => Object.assign({ price: 0 }, w || {}));
  out.career = list(s.career, 60);
  out.recognition = list(s.recognition, 12);
  return out;
}
function readSite() { return withDefaults(JSON.parse(fs.readFileSync(SITE_FILE, 'utf8'))); }
function str(v, max) { return String(v == null ? '' : v).replace(/\r\n/g, '\n').slice(0, max); }
function list(v, max) { return Array.isArray(v) ? v.slice(0, max) : []; }
// Portrait photos shown on the home page: a list of { file, alt }.
function portraitList(v) {
  return list(v, 6).map(x => ({
    file: String((x && x.file) || '').trim(),
    alt: str(x && x.alt, 200)
  })).filter(x => /^\/uploads\/[A-Za-z0-9._-]+$/.test(x.file) && !x.file.includes('..'));
}
function priceOf(v) {
  const n = Math.round(Number(String(v == null ? '' : v).replace(/[^\d.]/g, '')));
  return Number.isFinite(n) && n > 0 ? Math.min(50000000, n) : 0;
}
function phoneOf(v, max) { return String(v == null ? '' : v).replace(/[^\d+]/g, '').slice(0, max); }
// Instagram is accepted as a handle (@vins) or as a profile link, and always stored as a full URL.
function instagramOf(v) {
  const s = String(v == null ? '' : v).trim().slice(0, 200);
  if (!s) return '';
  const link = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?$/i.exec(s);
  if (link) return 'https://instagram.com/' + link[1];
  const handle = s.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? 'https://instagram.com/' + handle : '';
}
function cleanSite(inp) {
  if (!inp || typeof inp !== 'object') throw Object.assign(new Error('The site data is not valid.'), { status: 400 });
  const p = inp.profile || {}, a = inp.about || {}, c = inp.contact || {}, f = inp.footer || {};
  const st = inp.settings || {}, th = st.theme || {}, cb = st.contact || {}, sec = st.sections || {};
  const accent = String(th.accent || '');
  const site = {
    profile: {
      name: str(p.name, 80).trim(), alias: str(p.alias, 80), tagline: str(p.tagline, 80), location: str(p.location, 80), lede: str(p.lede, 600),
      portraits: portraitList(p.portraits),
      facts: list(p.facts, 8).map(x => ({ label: str(x && x.label, 30), value: str(x && x.value, 80) }))
    },
    about: { heading: str(a.heading, 200), pull: str(a.pull, 300), bio: str(a.bio, 8000) },
    works: list(inp.works, 60).map(w => {
      w = w || {};
      const file = String(w.file || '');
      return {
        id: str(w.id, 40).replace(/[^A-Za-z0-9_-]/g, '') || crypto.randomBytes(4).toString('hex'),
        file: /^\/uploads\/[A-Za-z0-9._-]+$/.test(file) && !file.includes('..') ? file : '',
        title: str(w.title, 120), medium: str(w.medium, 120), dimensions: str(w.dimensions, 60), year: str(w.year, 20),
        alt: str(w.alt, 300), visible: w.visible !== false, price: priceOf(w.price)
      };
    }).filter(w => w.file),
    career: list(inp.career, 60).map(x => ({ year: str(x && x.year, 30), title: str(x && x.title, 160), text: str(x && x.text, 600) })),
    recognition: list(inp.recognition, 12).map(g => ({
      heading: str(g && g.heading, 60),
      items: list(g && g.items, 30).map(it => ({ title: str(it && it.title, 160), detail: str(it && it.detail, 200) }))
    })),
    contact: {
      email: str(c.email, 120), phone: str(c.phone, 40),
      website: /^https?:\/\//i.test(String(c.website || '')) ? str(c.website, 200) : '', note: str(c.note, 400)
    },
    footer: { left: str(f.left, 160), right: str(f.right, 200) },
    settings: {
      theme: {
        mode: ['auto', 'light', 'dark'].indexOf(th.mode) >= 0 ? th.mode : 'auto',
        accent: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#b4552e',
        fonts: Object.prototype.hasOwnProperty.call(THEME_FONTS, th.fonts) ? th.fonts : 'serif'
      },
      contact: { whatsapp: phoneOf(cb.whatsapp, 20), call: phoneOf(cb.call, 20), instagram: instagramOf(cb.instagram) },
      sections: {
        work: sec.work !== false, about: sec.about !== false, career: sec.career !== false,
        record: sec.record !== false, contact: sec.contact !== false
      }
    }
  };
  if (!site.profile.name) throw Object.assign(new Error('Add a name on the Profile tab.'), { status: 400 });
  return site;
}
function referencedFiles(site) {
  const files = (site.works || []).map(w => w.file);
  const portraits = (site.profile && site.profile.portraits) || [];
  return new Set(files.concat(portraits.map(p => p.file)).map(f => path.basename(f || '')));
}
function saveSite(site) {
  const old = readSite();
  const tmp = SITE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(site, null, 2));
  fs.renameSync(tmp, SITE_FILE);
  const keep = referencedFiles(site);
  for (const name of referencedFiles(old)) {
    if (!keep.has(name)) { try { fs.unlinkSync(path.join(UPLOAD_DIR, name)); } catch (e) { /* already gone */ } }
  }
}
// Remove uploads that were never saved into the site and are more than a day old.
function sweepUploads() {
  try {
    const keep = referencedFiles(readSite());
    for (const name of fs.readdirSync(UPLOAD_DIR)) {
      const full = path.join(UPLOAD_DIR, name);
      if (!keep.has(name) && Date.now() - fs.statSync(full).mtimeMs > 24 * 3600 * 1000) fs.unlinkSync(full);
    }
  } catch (e) { /* ignore */ }
}

/* ---------- uploads ---------- */
function saveImage(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw Object.assign(new Error('Upload a JPEG, PNG or WebP image.'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 6 * 1024 * 1024) throw Object.assign(new Error('The image must be under 6 MB.'), { status: 413 });
  if (buf.length < 100) throw Object.assign(new Error('That file is not a real image.'), { status: 400 });
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  const ext = isJpg ? '.jpg' : isPng ? '.png' : isWebp ? '.webp' : '';
  if (!ext) throw Object.assign(new Error('That file is not a real image.'), { status: 400 });
  const name = crypto.randomBytes(8).toString('hex') + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return '/uploads/' + name;
}

/* ---------- orders and payments ---------- */
const checkoutHits = new Map();
function hitLimit(map, ip, max, windowMs) {
  const now = Date.now();
  const rec = map.get(ip) || { n: 0, t: now };
  if (now - rec.t > windowMs) { rec.n = 0; rec.t = now; }
  rec.n += 1;
  map.set(ip, rec);
  return rec.n > max;
}
function readOrders() {
  try { const a = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function writeOrders(orders) {
  const tmp = ORDERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(orders, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, ORDERS_FILE);
}
function paymentsReady() { return !!(RZP_KEY_ID && RZP_KEY_SECRET); }

// Create a Razorpay order over the REST API. No npm package needed.
function razorpayApi(method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request({
      hostname: 'api.razorpay.com', path: route, method, timeout: 20000,
      headers: Object.assign({ Authorization: 'Basic ' + Buffer.from(RZP_KEY_ID + ':' + RZP_KEY_SECRET).toString('base64') },
        payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {})
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        let j = {};
        try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')) || {}; } catch (e) { /* not json */ }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(j);
        const desc = j && j.error && j.error.description ? String(j.error.description) : 'The payment provider refused the request.';
        reject(Object.assign(new Error(desc), { status: 502 }));
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('The payment provider did not answer. Try again.'), { status: 504 })));
    req.on('error', err => reject(Object.assign(new Error('Could not reach the payment provider. Check the connection and the Razorpay keys.'), { status: 502 })));
    if (payload) req.write(payload);
    req.end();
  });
}
// Razorpay signs order_id|payment_id with the key secret. Verify it before trusting anything.
function verifyPayment(orderId, paymentId, signature) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', RZP_KEY_SECRET).update(orderId + '|' + paymentId).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function orderLink(o) { return '/order?t=' + o.token; }

/* ---------- theme ---------- */
function mixWhite(hex, ratio) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => Math.round(c + (255 - c) * ratio));
  return '#' + ch.map(c => c.toString(16).padStart(2, '0')).join('');
}
function themeCss() {
  const t = readSite().settings.theme;
  const accent = t.accent, soft = mixWhite(accent, 0.45);
  const scheme = t.mode === 'dark' ? 'dark' : t.mode === 'light' ? 'light' : 'light dark';
  return ':root{--accent:' + accent + ';--font-display:' + THEME_FONTS[t.fonts] + ';color-scheme:' + scheme + '}\n' +
    '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--accent:' + soft + '}}\n' +
    ':root[data-theme="dark"]{--accent:' + soft + '}\n';
}

/* ---------- routes ---------- */
async function api(req, res, p, u) {
  const m = req.method;
  if (p === '/api/site' && m === 'GET') return send(res, 200, readSite());
  if (p === '/api/me' && m === 'GET') return send(res, 200, { admin: isAuthed(req) });

  if (p === '/api/login' && m === 'POST') {
    const ip = clientIp(req), now = Date.now();
    const rec = attempts.get(ip) || { n: 0, t: now };
    if (now - rec.t > 15 * 60 * 1000) { rec.n = 0; rec.t = now; }
    if (rec.n >= 8) return send(res, 429, { error: 'Too many attempts. Wait 15 minutes and try again.' });
    const body = await readJson(req, 4096);
    if (!checkPassword(body && body.password)) {
      rec.n += 1; attempts.set(ip, rec);
      return send(res, 401, { error: 'That password is not correct.' });
    }
    attempts.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_MS);
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, token, SESSION_MS / 1000) });
  }
  if (p === '/api/logout' && m === 'POST') {
    sessions.delete(sessionToken(req));
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
  }

  /* Public buying flow. Choose an artwork, pay through Razorpay, then wait for approval. */
  if (p === '/api/checkout' && m === 'POST') {
    if (!paymentsReady()) return send(res, 503, { error: 'Payments are not set up yet. Add the Razorpay keys to the .env file.' });
    if (hitLimit(checkoutHits, clientIp(req), 20, 15 * 60 * 1000)) return send(res, 429, { error: 'Too many attempts. Wait a few minutes and try again.' });
    const body = await readJson(req, 8192);
    const site = readSite();
    const work = (site.works || []).find(w => w.id === str(body && body.workId, 40));
    if (!work || !work.price || !work.file || work.visible === false) {
      return send(res, 400, { error: 'That artwork is not for sale.' });
    }
    const buyer = {
      name: str(body && body.name, 80).trim(),
      email: str(body && body.email, 120).trim(),
      phone: str(body && body.phone, 30).trim()
    };
    if (!buyer.name) return send(res, 400, { error: 'Add your name.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyer.email)) return send(res, 400, { error: 'Add a valid email address.' });
    const amount = work.price * 100;
    const rzp = await razorpayApi('POST', '/v1/orders', {
      amount, currency: CURRENCY, receipt: 'rcpt_' + crypto.randomBytes(6).toString('hex'),
      notes: { artwork: work.title || work.id }
    });
    if (!rzp || !rzp.id) throw new Error('The payment provider did not return an order id.');
    const order = {
      id: 'ord_' + crypto.randomBytes(8).toString('hex'),
      token: crypto.randomBytes(24).toString('hex'),
      workId: work.id, title: work.title || 'Untitled', file: work.file,
      amount, currency: CURRENCY, status: 'created',
      razorpayOrderId: String(rzp.id), paymentId: '',
      buyer, createdAt: new Date().toISOString(), paidAt: '', decidedAt: '', downloads: 0
    };
    const orders = readOrders();
    orders.push(order);
    writeOrders(orders);
    return send(res, 200, {
      razorpayOrderId: order.razorpayOrderId, amount, currency: CURRENCY,
      keyId: RZP_KEY_ID, siteName: site.profile.name || 'Portfolio',
      workTitle: order.title, accent: site.settings.theme.accent
    });
  }
  if (p === '/api/checkout/verify' && m === 'POST') {
    if (!paymentsReady()) return send(res, 503, { error: 'Payments are not set up yet.' });
    const body = await readJson(req, 8192);
    const orderId = str(body && body.razorpay_order_id, 120);
    const paymentId = str(body && body.razorpay_payment_id, 120);
    const signature = str(body && body.razorpay_signature, 200);
    if (!verifyPayment(orderId, paymentId, signature)) return send(res, 400, { error: 'That payment could not be verified.' });
    const orders = readOrders();
    const order = orders.find(o => o.razorpayOrderId === orderId);
    if (!order) return send(res, 404, { error: 'That order was not found.' });
    if (order.status === 'created') {
      order.status = 'awaiting_approval';
      order.paymentId = paymentId;
      order.paidAt = new Date().toISOString();
      writeOrders(orders);
    }
    return send(res, 200, { token: order.token, status: order.status, url: orderLink(order) });
  }
  if (p === '/api/order' && m === 'GET') {
    const order = readOrders().find(o => o.token === str(u.searchParams.get('t'), 100));
    if (!order) return send(res, 404, { error: 'That order link is not valid.' });
    return send(res, 200, {
      status: order.status, title: order.title, amount: order.amount, currency: order.currency,
      name: order.buyer.name, createdAt: order.createdAt, decidedAt: order.decidedAt, downloads: order.downloads || 0,
      download: order.status === 'approved' ? '/api/order/download?t=' + order.token : ''
    });
  }
  if (p === '/api/order/download' && m === 'GET') {
    const order = readOrders().find(o => o.token === str(u.searchParams.get('t'), 100));
    if (!order) return send(res, 404, { error: 'That order link is not valid.' });
    if (order.status !== 'approved') return send(res, 403, { error: 'The download opens once the artist approves the order.' });
    const base = path.basename(order.file || '');
    const full = path.join(UPLOAD_DIR, base);
    if (!base || !fs.existsSync(full)) return send(res, 404, { error: 'That image is no longer available. Contact the artist.' });
    const st = fs.statSync(full);
    const ext = path.extname(full).toLowerCase();
    const name = String(order.title || '').replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'artwork';
    try {
      const orders = readOrders();
      const row = orders.find(o => o.token === order.token);
      if (row) { row.downloads = (row.downloads || 0) + 1; writeOrders(orders); }
    } catch (e) { /* counting is best effort */ }
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="' + name + ext + '"'
    });
    return fs.createReadStream(full).pipe(res);
  }

  if (!isAuthed(req)) return send(res, 401, { error: 'Please log in.' });

  if (p === '/api/orders' && m === 'GET') return send(res, 200, readOrders().slice().reverse());
  if (p === '/api/orders/decision' && m === 'POST') {
    const body = await readJson(req, 4096);
    const action = body && body.action === 'approve' ? 'approved' : body && body.action === 'reject' ? 'rejected' : '';
    if (!action) return send(res, 400, { error: 'Say approve or reject.' });
    const orders = readOrders();
    const order = orders.find(o => o.id === str(body && body.id, 60));
    if (!order) return send(res, 404, { error: 'That order was not found.' });
    if (order.status === 'created') return send(res, 409, { error: 'That order has not been paid yet.' });
    order.status = action;
    order.decidedAt = new Date().toISOString();
    writeOrders(orders);
    return send(res, 200, orders.slice().reverse());
  }

  if (p === '/api/site' && m === 'PUT') {
    const site = cleanSite(await readJson(req, 1024 * 1024));
    saveSite(site);
    return send(res, 200, site);
  }
  if (p === '/api/upload' && m === 'POST') {
    const body = await readJson(req, 9 * 1024 * 1024);
    return send(res, 200, { file: saveImage(body && body.dataUrl) });
  }
  if (p === '/api/password' && m === 'POST') {
    const body = await readJson(req, 4096);
    if (!checkPassword(body && body.current)) return send(res, 403, { error: 'The current password is not correct.' });
    const next = String((body && body.next) || '');
    if (next.length < 8 || next.length > 200) return send(res, 400, { error: 'The new password must be 8 to 200 characters.' });
    setPassword(next);
    const mine = sessionToken(req);
    for (const t of [...sessions.keys()]) if (t !== mine) sessions.delete(t);
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'Not found' });
}

function serveFile(req, res, base, rel, maxAge) {
  let decoded;
  try { decoded = decodeURIComponent(rel); } catch (e) { return send(res, 400, { error: 'Bad request' }); }
  if (decoded.includes('\0')) return send(res, 400, { error: 'Bad request' });
  const full = path.resolve(base, decoded);
  if (!full.startsWith(base + path.sep)) return send(res, 404, { error: 'Not found' });
  let st;
  try { st = fs.statSync(full); } catch (e) { return send(res, 404, { error: 'Not found' }); }
  if (!st.isFile()) return send(res, 404, { error: 'Not found' });
  const ext = path.extname(full).toLowerCase();
  const type = TYPES[ext] || 'application/octet-stream';
  // Styles and scripts are edited often, so make browsers revalidate them instead of holding a stale copy.
  const cache = (ext === '.css' || ext === '.js') ? 'no-cache' : 'public, max-age=' + maxAge;
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': cache });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(full).pipe(res);
}

function page(req, res, file, inject, label) {
  let html = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
  if (inject) {
    const s = readSite();
    const name = s.profile.name || 'Portfolio';
    const title = label ? label + ' · ' + name : s.profile.tagline ? name + ' · ' + s.profile.tagline : name;
    const desc = s.profile.lede || title;
    const lead = (s.works || []).find(w => w.visible !== false);
    const proto = isHttps(req) ? 'https' : 'http';
    const origin = proto + '://' + String(req.headers.host || 'localhost').replace(/[^A-Za-z0-9.:-]/g, '');
    const mode = s.settings.theme.mode;
    html = html.replace(/__TITLE__/g, esc(title)).replace(/__DESC__/g, esc(desc.slice(0, 200)))
      .replace(/__IMAGE__/g, lead ? esc(origin + lead.file) : '')
      .replace(/__THEME__/g, mode === 'dark' ? ' data-theme="dark"' : mode === 'light' ? ' data-theme="light"' : '');
  }
  // Stamp local stylesheet/script links with the file's mtime, so an edited file is fetched straight away
  // even if the browser still holds an older cached copy.
  html = html.replace(/(href|src)="\/([\w.-]+\.(?:css|js))"/g, (match, attr, name) => {
    try {
      const t = Math.round(fs.statSync(path.join(PUBLIC_DIR, name)).mtimeMs);
      return attr + '="/' + name + '?v=' + t + '"';
    } catch (e) {
      return match;
    }
  });
  const buf = Buffer.from(html, 'utf8');
  res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Content-Length': buf.length, 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : buf);
}

const server = http.createServer(async (req, res) => {
  try {
    baseHeaders(res);
    const u = new URL(req.url, 'http://localhost');
    const p = u.pathname;
    if (p.startsWith('/api/')) return await api(req, res, p, u);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    if (p === '/' || p === '/index.html') return page(req, res, 'index.html', true);
    // Each section of the site is its own page: /about, /career, /recognition, /contact.
    const pageLabel = PAGE_LABELS[p.replace(/\/+$/, '')];
    if (pageLabel) return page(req, res, 'index.html', true, pageLabel);
    if (p === '/admin' || p === '/admin/') return page(req, res, 'admin.html', false);
    if (p === '/order' || p === '/order/' || p === '/order.html') return page(req, res, 'order.html', true);
    if (p === '/theme.css') {
      const css = themeCss();
      res.writeHead(200, { 'Content-Type': TYPES['.css'], 'Content-Length': Buffer.byteLength(css), 'Cache-Control': 'no-cache' });
      return res.end(req.method === 'HEAD' ? undefined : css);
    }
    if (p.startsWith('/uploads/')) return serveFile(req, res, UPLOAD_DIR, p.slice(9), 86400);
    return serveFile(req, res, PUBLIC_DIR, p.slice(1), 300);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Something went wrong on the server.' : e.message });
    else res.end();
  }
});

sweepUploads();
server.listen(PORT, HOST, () => {
  console.log('Portfolio running on http://localhost:' + PORT + '  (admin: /admin)');
});
