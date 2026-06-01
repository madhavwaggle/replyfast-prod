# ReplyFast — AI Lead Response for Real Estate

Respond to every lead in under 60 seconds. ReplyFast uses Claude AI to instantly engage, qualify, and brief you on real estate leads from Zillow, Homes.com, SMS, and your website.

## What's included

- **Authentication** — Secure login with email/password or magic link (NextAuth.js)
- **Secure AI proxy** — Claude API key never exposed to browser (server-side only)
- **Lead persistence** — All leads saved to Vercel KV (Redis) across sessions
- **Real SMS** — Two-way texting via Twilio (inbound + outbound)
- **Real email** — Lead email parsing and auto-replies via Postmark
- **Zillow/Homes.com integration** — Forward lead notification emails to Postmark webhook
- **Rate limiting** — 60 AI requests/hour per session
- **Dashboard** — Filter leads by HOT/WARM/COLD, full conversation history, AI briefings

## Quick Deploy

### 1. Fork & deploy

```bash
git clone https://github.com/YOUR/replyfast.git
cd replyfast
npm install
```

Import to Vercel: https://vercel.com/new

### 2. Required environment variables

Set these in Vercel → Settings → Environment Variables:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `NEXTAUTH_SECRET` | Run: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your Vercel URL e.g. `https://replyfast.vercel.app` |
| `ADMIN_EMAIL` | Your login email |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of your password — use https://bcrypt-generator.com (rounds=10) |
| `KV_URL` | From Vercel Storage → KV |
| `KV_REST_API_URL` | From Vercel Storage → KV |
| `KV_REST_API_TOKEN` | From Vercel Storage → KV |
| `KV_REST_API_READ_ONLY_TOKEN` | From Vercel Storage → KV |

### 3. Vercel KV setup (lead persistence)

1. Go to Vercel Dashboard → Storage
2. Create a KV database
3. Copy the 4 KV env vars to your project

### 4. Twilio SMS (optional but recommended)

1. Sign up at https://twilio.com ($15 free credit)
2. Buy a local phone number (~$1/mo)
3. Set incoming message webhook: `https://YOUR-APP.vercel.app/api/inbound-sms`
4. Add env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

### 5. Postmark email + Zillow/Homes.com (optional)

1. Create account at https://postmarkapp.com
2. Server → Inbound → copy your `@inbound.postmarkapp.com` address
3. Set inbound webhook: `https://YOUR-APP.vercel.app/api/inbound-email`
4. In Zillow Premier Agent: Settings → forward lead notifications to your Postmark address
5. Add env var: `POSTMARK_SERVER_TOKEN`

### 6. Website contact form

```javascript
fetch('https://YOUR-APP.vercel.app/api/new-lead', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-webhook-secret': 'YOUR_WEBHOOK_SECRET'  // add WEBHOOK_SECRET to Vercel env
  },
  body: JSON.stringify({ fname, lname, email, phone, property, message, source: 'Website' })
})
```

## Local development

```bash
cp .env.example .env.local
# Fill in .env.local with your values (at minimum ANTHROPIC_API_KEY and NEXTAUTH_SECRET)
npm run dev
# Open http://localhost:3000
```

For local dev without KV, leads are stored in memory (lost on restart). That's fine for testing.

## API Routes

| Route | Auth | Description |
|---|---|---|
| `POST /api/chat` | Required | Secure Claude AI proxy |
| `GET /api/leads` | Required | List all leads |
| `POST /api/leads` | Required | Save/update a lead |
| `GET /api/leads/[id]` | Required | Get single lead |
| `PUT /api/leads/[id]` | Required | Update lead |
| `DELETE /api/leads/[id]` | Required | Delete lead |
| `POST /api/new-lead` | Webhook secret | Public intake (website forms) |
| `POST /api/inbound-sms` | Twilio sig | Twilio SMS webhook |
| `POST /api/inbound-email` | None (Postmark) | Postmark email webhook |
| `POST /api/send-sms` | Required | Send SMS to lead |

## Tech stack

- **Next.js 14** — App + API routes
- **NextAuth.js** — Authentication
- **Vercel KV** — Redis persistence
- **Anthropic Claude** — AI responses + lead scoring
- **Twilio** — SMS (inbound + outbound)
- **Postmark** — Email parsing and sending

## Architecture

```
Browser → /api/chat (auth check + rate limit) → Anthropic API
Lead → /api/inbound-sms or /api/inbound-email → Claude → Twilio/Postmark reply
Dashboard → /api/leads → Vercel KV
```
