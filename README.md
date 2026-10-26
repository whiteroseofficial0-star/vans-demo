# Artist portfolio with admin panel and artwork sales

A portfolio website for one artist, with an admin panel where the artist (or you) controls everything on the page. It comes filled with the content for Vins (Vijay Narain Seth), the cartoonist, and his five artworks.

People can buy an artwork from the site: they pay online through Razorpay, the order lands in the admin panel, and only after you approve it does the buyer's private order page unlock the download.

There are no packages to install. You only need **Node.js 18 or newer** (https://nodejs.org).

## Run it

```
node server.js
```

- Website: http://localhost:3000/
- Admin panel: http://localhost:3000/admin

On the very first start the terminal prints an admin password. Log in at `/admin` and change it under the **Password** tab. To pick the first password yourself, copy `.env.example` to `.env` and fill in `ADMIN_PASSWORD` before the first start.

The first-run password is read in this order: the `ADMIN_PASSWORD` environment variable on the host, then a `seed/.env` file bundled with the project, then a random password printed in the server log. That means the documented default in `.env.example` (`ADMIN_PASSWORD=admin123@#`) is usable as-is on a fresh deploy, and you can still override it with the host's environment variable or by editing `seed/.env`. Change it any time under **Password** in `/admin`.
The admin panel is never linked from the public site, and `robots.txt` keeps it (and the order pages) out of search engines. The address is still `/admin`, so protect it with a strong password. If you want to keep the path itself secret, change the `/admin` route in `server.js`.

## What the admin panel controls

| Tab | What you can change |
| --- | --- |
| Orders | See paid orders, the buyer's name, email and phone, and approve or decline each one. Approving unlocks the buyer's download. |
| Profile | Name, other name, what they do, city, introduction, portrait photos shown on the home page, quick facts |
| Artworks | Upload, replace, reorder, hide or delete artworks. Each has a title, medium, size, year, price and a description for screen readers |
| About | Heading, highlighted line, full biography |
| Career | Timeline entries with year, title and details |
| Recognition | Groups such as Awards, Collections, Exhibitions, each with its own items |
| Contact and footer | Email, phone, website, note and footer text. Contact shows on the site only when filled in |
| Appearance | Colour mode (light, dark or match the device), accent colour, headings font, the side panel buttons (WhatsApp number, call number, Instagram), and switches to turn site sections on or off |
| Password | Change the admin password |

Changes go live when you select **Save changes**. Orders are handled right away, without saving. Uploaded images are scaled down to 1600 px, so large phone photos are fine.

A contact side panel floats at the right edge of the site: WhatsApp, Call and Instagram buttons, in that order. All three are always shown, so the panel keeps its shape; each stays dimmed and inactive until its value is filled in under **Appearance**, then becomes a working button. The WhatsApp button opens a chat at `wa.me`, the call button starts a phone call, and Instagram accepts a handle such as `@vinscartoons` or a full profile link. On narrow screens the panel turns into a bar along the bottom edge.

## Selling artworks

1. Create a Razorpay account (https://razorpay.com) and complete their activation steps.
2. In the Razorpay dashboard go to **Account & Settings → API keys** and generate a key.
3. Copy `.env.example` to `.env` and set:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
   ```
   Start with the **test** keys and Razorpay's test cards. Switch to live keys when you are ready.
4. In **Artworks**, give an artwork a **Price in ₹**. Leave the price blank for artworks that are not for sale.
5. Save, open the site, click an artwork and press **Buy this artwork**.

What happens next:

- The buyer enters name, email and phone, then pays in the Razorpay window (cards, UPI, netbanking and wallets, depending on your Razorpay account).
- The server verifies Razorpay's payment signature before recording the order, so a faked browser response cannot create a paid order.
- The buyer sees a private order link (`/order?t=…`). Keep it: it shows the status and the download button.
- The order appears in **Orders** in the admin panel with a count next to the tab name. **Approve** unlocks the download, **Decline** keeps it locked. Both can be changed later.
- The buyer refreshes their order page and downloads the image.

Refunds, receipts and payouts are handled in the Razorpay dashboard, not on this site. The download is the image stored in `uploads/`, which is up to 1600 px on its longest side because uploads are scaled.

If `RAZORPAY_KEY_ID` or `RAZORPAY_KEY_SECRET` is missing the site still works normally; the Buy button reports that payments are not set up. The server must be able to reach `api.razorpay.com` over HTTPS.

## Where things are stored

| Folder | Holds |
| --- | --- |
| `data/site.json` | All the text, prices and appearance settings on the site |
| `data/orders.json` | Orders, buyer contact details, payment ids and private order links |
| `data/auth.json` | The admin password (stored as a salted hash, never as plain text) |
| `uploads/` | The artwork images |

`data/orders.json` contains personal details and the buyers' private download links, so keep it as safe as `data/auth.json`. To back up the site, copy `data/` and `uploads/`. To start over with the original Vins content, stop the server and delete both folders.

## Put it online

Any host that can run Node.js works. Three things matter:

1. **The disk must persist.** If the host wipes files on each restart, orders, edits and uploads are lost. Use a host that offers a persistent volume and point `DATA_DIR` and `UPLOAD_DIR` (in `.env`) at it, or use a small VPS. Check the host's current free-tier terms before choosing.
2. **Set `TRUST_PROXY=1`** when the host puts HTTPS in front of the site, so login cookies are marked secure and the login limit sees real visitor addresses.
3. **Set the Razorpay keys** if you sell artworks, and use HTTPS everywhere so buyer details are not sent in the clear.

Start command: `node server.js`. The server reads the `PORT` environment variable that most hosts set.

## Security notes

- The admin login is limited to 8 wrong tries per 15 minutes for each address.
- Sessions last 12 hours and use a cookie that scripts cannot read.
- The admin panel is not linked anywhere on the public site and is blocked in `robots.txt`. Order pages carry `noindex`.
- Uploads must be real JPEG, PNG or WebP files under 6 MB.
- Payment signatures are checked on the server with the Razorpay key secret; the amount charged always comes from the saved artwork price, never from the browser.
- A buyer can only download after you approve their order. The order link is a long random token.
- All text is escaped before it is shown, and the server sends a strict content security policy (which allows Razorpay's checkout script and frames).
- Use HTTPS in production and a password that is not used anywhere else.

## Files

```
server.js          the whole server (no dependencies)
public/            website, order page and admin page
                   (index.html, order.html, admin.html, site.css, admin.css, site.js, order.js, admin.js, robots.txt)
seed/              the starting content and images, copied to data/ and uploads/ on first run
.env.example       settings you can copy to .env
```

## Using this for another artist

Log in to `/admin`, replace the text and swap the artworks. Or delete `data/` and `uploads/`, then edit `seed/site.json` and the images in `seed/uploads/` so a fresh start shows the new artist.
