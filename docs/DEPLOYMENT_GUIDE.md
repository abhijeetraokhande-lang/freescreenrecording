# Deployment Guide — FreeScreenRecording

## What you're deploying
- `index.html` — the site itself (recording, download, library, comments, timers — all free, all client-side)
- `netlify/functions/` — three server-side functions:
  - `create-checkout-session.js` — creates a Razorpay Order for the AI Summary unlock
  - `verify-session.js` — verifies Razorpay's payment signature, issues an unlock token
  - `summarize.js` — the AI call via OpenRouter, only runs if a valid unlock token is presented
- Accounts/sync (Supabase) — powers "Sign in" and the "Your account" dashboard

Free recording/download works with zero setup. AI Summary needs Razorpay + OpenRouter keys. Accounts need Supabase. Until each is configured, that specific feature shows a friendly message instead of erroring.

## 1. Push this to Netlify (Git-connected, not Drop)
Netlify Drop (drag-and-drop) only serves static files — functions won't run. This repo should already be Git-connected per your setup notes (GitHub repo `freescreenrecording`, branch `main`, auto-deploy on push). If starting fresh:
1. Push this folder to a GitHub repo.
2. Netlify → **Add new site → Import an existing project → GitHub** → select the repo.
3. Build command blank, publish directory `.` — `netlify.toml` handles the rest (including pinning `NODE_VERSION=20`, which avoids Netlify trying to compile Node from source).

## 2. Set up Razorpay
1. Create an account at [razorpay.com](https://razorpay.com) — India-based businesses can activate directly, no invite needed (unlike Stripe).
2. Stay in **Test Mode** (toggle top-left of the Razorpay dashboard) while setting up.
3. Go to **Settings → API Keys → Generate Test Key**. Copy the **Key ID** and **Key Secret**.
4. No separate "product" needs creating — the order amount is set directly in `create-checkout-session.js` via the `UNLOCK_PRICE_INR` env var (defaults to ₹399 if unset).

### Test payment — current correct test cards
Razorpay's checkout currently rejects the commonly-cited generic test card `4111 1111 1111 1111` with "International cards are not supported," even though older docs list it as domestic. Use one of these instead (confirmed against Razorpay's live docs):
- **Visa**: `4386 2894 0766 0153`
- **Mastercard**: `5104 0155 5555 5558`

Any future expiry, any CVV. After card entry, Razorpay's test mode simulates an OTP step — enter `1234` or `123456` to complete it.

## 3. Set up OpenRouter (AI summaries)
1. Create an account at [openrouter.ai](https://openrouter.ai).
2. Go to **Keys** → create a new API key.
3. This project uses `google/gemini-2.0-flash-exp:free` by default (set in `summarize.js`) — free tier, no cost per call at time of writing, but confirm current pricing/limits on OpenRouter's model page since free-tier terms change.

## 4. Set environment variables in Netlify
**Site configuration → Environment variables.** Two things worth being explicit about since they've caused issues before:
- Use **"Same value for all deploy contexts"** unless you deliberately want different keys for preview vs. production deploys.
- Add each variable one at a time — Netlify's UI can be easy to mis-click into per-context values by accident.

| Key | Value |
|---|---|
| `RAZORPAY_KEY_ID` | from Razorpay → API Keys |
| `RAZORPAY_KEY_SECRET` | from Razorpay → API Keys |
| `UNLOCK_PRICE_INR` | `399` (or your chosen price — whole rupees, no decimals) |
| `OPENROUTER_API_KEY` | from OpenRouter → Keys |
| `SITE_URL` | `https://freescreenrecording.net` (or your current live URL) |
| `UNLOCK_TOKEN_SECRET` | any long random string — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Delete any leftover `STRIPE_*` or `ANTHROPIC_API_KEY` variables from earlier testing — they're no longer used and just add confusion later.

Redeploy after adding/changing env vars — Netlify doesn't pick up new values on already-running deploys.

## 5. Test the payment + AI flow end to end
1. Record something with speech captured (so a transcript exists).
2. Click **Unlock AI Summaries** — the Razorpay popup should open showing your business name and the price in ₹.
3. Enter one of the test cards above, then `1234` at the OTP step.
4. Confirm: does the popup close and the page show "unlocked"? Does clicking **Generate** return an actual summary (not an error)? This is the exact point the previous session left off — report back what you see and we'll debug from there if it doesn't complete cleanly.

## 6. Set up accounts + cloud-saved recordings (Supabase)
This powers the "Sign in" button and the "Your account" dashboard section — this piece existed in an earlier version of this project but was missing from the package you most recently uploaded, so it's freshly merged back in here.

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste in the full contents of `docs/supabase-schema.sql` → **Run**. Creates the `recordings` table, a private storage bucket, and Row Level Security policies so each user only ever sees their own data.
3. **Project Settings → API** → copy the **Project URL** and **anon public** key.
4. Open `index.html`, find near the top of the main `<script>` block:
   ```js
   const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
   ```
   Replace both. (The anon key is safe to expose in frontend code — Row Level Security is what actually protects data, not secrecy of this key.)
5. **Authentication → Providers → Email** → toggle **Confirm email** off for easier testing (turn back on later if you want email verification in production).
6. Commit and push `index.html` to GitHub — Netlify will auto-deploy.
7. Test: sign up, record something, refresh the page, confirm it still shows under "Your account."

## 7. Point your domain at Netlify
`freescreenrecording.net` was purchased on GoDaddy but isn't connected yet.
1. In Netlify: your site → **Domain management** → **Add a domain** → enter `freescreenrecording.net`.
2. Netlify shows either nameservers or A/CNAME records — copy whichever it gives you.
3. In GoDaddy: your domain → **DNS** (or **Manage DNS**) → paste in what Netlify gave you (nameservers under "Change nameservers," or edit the A/CNAME records directly).
4. Wait 15 minutes to a few hours for DNS to propagate. Netlify auto-issues free HTTPS once it resolves.

## 8. Sanity-check privacy.html / terms.html
These should reference Razorpay and OpenRouter, not Stripe/Anthropic — worth a quick read-through on GitHub to confirm an old version wasn't accidentally re-uploaded, per your note about this happening once already.

## 9. Go live (when ready to accept real payments)
Razorpay Live Mode requires full KYC/business verification (your Udyam registration helps here). Once approved, swap `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` for the Live versions in Netlify env vars. Test cards stop working in Live mode — only real cards will be charged.

## Hardening this later (not needed for launch)
- **AI unlock**: currently a signed token in `localStorage`, tied to a browser not an account. Fine for v1; if it grows, tie unlock status to the Supabase user record instead so it survives clearing browser storage.
- **Accounts**: email/password only right now, no password reset flow built. Supabase supports magic-link and OAuth if you want to add those later without much extra work.
