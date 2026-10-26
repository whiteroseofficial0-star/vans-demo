(function () {
  "use strict";
  var root = document.getElementById("order-root");
  var token = "";
  try { token = new URLSearchParams(location.search).get("t") || ""; } catch (e) { token = ""; }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(paise) { return "₹" + Math.round(Number(paise || 0) / 100).toLocaleString("en-IN"); }

  var LABELS = {
    created: "Payment not confirmed",
    awaiting_approval: "Waiting for approval",
    approved: "Approved",
    rejected: "Declined"
  };

  function wrap(inner) {
    root.innerHTML = '<a class="order-back" href="/">← Back to the gallery</a>' +
      '<div class="order-card">' + inner + '</div>';
  }

  function showBad(o) {
    var status = o.status;
    wrap('<p class="eyebrow">Your order</p><h1 class="order-h">' + esc(o.title) + '</h1>' +
      '<p class="order-meta">' + money(o.amount) + ' · ' + esc(LABELS[status] || status) + '</p>' +
      '<p class="badge ' + esc(status) + '">' + esc(LABELS[status] || status) + '</p>' +
      (status === "approved"
        ? '<p>Your payment is received and the artist has approved this order. Download your copy below.</p>' +
          '<p><a class="btn primary" href="' + esc(o.download) + '">Download the artwork</a></p>' +
          '<p class="hint">Keep this page bookmarked. Approvals are manual, so allow the artist a little time if the button is not there yet.</p>'
        : status === "rejected"
          ? '<p>This order was declined by the artist. If you have already paid, contact the artist with the order details and they can sort it out.</p>'
          : status === "created"
            ? '<p>No confirmed payment has reached the server for this order yet. If you completed the payment, refresh this page in a moment. If it still shows this message, contact the artist with your payment reference.</p>'
            : '<p>Your payment is received. The artist reviews each order by hand, so the download stays locked for a short while.</p>' +
              '<p class="hint">Refresh this page later. Approving the order unlocks the download automatically.</p>') +
      '<div class="order-ctl"><button type="button" class="btn" id="order-refresh">Check status again</button></div>');
    var r = document.getElementById("order-refresh");
    if (r) r.addEventListener("click", load);
  }

  function load() {
    if (!token) {
      wrap('<p class="eyebrow">Your order</p><h1 class="order-h">Order not found</h1><p>This page needs the private link that was shown after payment. Open that link, or contact the artist.</p>');
      return;
    }
    root.innerHTML = '<a class="order-back" href="/">← Back to the gallery</a><div class="order-card"><p class="hint">Checking your order…</p></div>';
    fetch("/api/order?t=" + encodeURIComponent(token), { cache: "no-store" }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || "That order link is not valid.");
        return j;
      });
    }).then(showBad).catch(function (err) {
      wrap('<p class="eyebrow">Your order</p><h1 class="order-h">Order not found</h1><p>' + esc(err.message) + '</p>' +
        '<p class="hint">Use the private link that was shown after payment.</p>');
    });
  }

  load();
})();
