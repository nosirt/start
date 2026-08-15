# Setting up Global Chat (v01.08)

The chat itself needs **no setup** — text messages work immediately once
you deploy, since they just use the same Firestore project everything
else already uses. The two optional pieces below are only needed if you
turn on GIF search or image upload in the admin panel (both start **off**).

## Option A: GIF search (GIPHY) — recommended if you want media at all

1. Go to https://developers.giphy.com and create a free account
2. Click **Create an App** → choose **API** (not SDK)
3. Copy the key it gives you
4. Open `core.js`, find this line near the top:
   ```js
   const GIPHY_API_KEY = 'PASTE_YOUR_GIPHY_API_KEY_HERE';
   ```
   and paste your key in
5. Redeploy

New keys start "beta" (100 requests/hour) — plenty for a small chat.
No billing, no card required.

*(Why GIPHY and not Tenor: Tenor's API stopped accepting new signups in
Jan 2026 and shut down completely on June 30, 2026, so it's not an
option anymore.)*

## Option B: Image upload — read this before turning it on

This lets anyone in chat upload an arbitrary image file, with no login
and no review before it's visible to everyone. Two things to know:

**1. It needs Firebase Storage, which now requires a linked billing
card.** As of February 2026, Google requires every Firebase project —
even ones staying entirely within the free tier — to be on the
pay-as-you-go "Blaze" plan with a credit card on file before Cloud
Storage will work at all. You won't be charged as long as you stay under
the free quota (5GB stored, 100GB downloaded/month), but the card is a
hard requirement now, not optional.

To set that up:
1. Firebase console → your project → **Upgrade** (bottom left) → select
   **Blaze**
2. Link a billing/credit card when prompted
3. Firebase console → **Build → Storage** → click through to provision
   the default bucket if it isn't already
4. **Storage → Rules** tab → paste in the contents of `storage.rules`
   (included in this project) → **Publish**

**2. There's no moderation.** Once turned on, anything anyone uploads is
visible to every visitor immediately. The app enforces "must be an image
file, under 5MB" — that's it. There's no scanning for illegal or abusive
content. The 24h auto-cleanup (already built in) at least limits how
long anything stays up, and you as admin can delete any individual
message + its image from the admin-unlocked chat view, but that's manual
— you'd need to actually be watching.

If you want images without that exposure, GIF search (Option A) is the
safer default — GIPHY hosts and moderates the content, you're just
linking to it.

## Switching modes
Admin panel → unlock → **global chat media** section → pick "off", "GIF
search", or "image upload". Takes effect immediately for everyone, no
redeploy needed once the keys/Storage above are set up once.
