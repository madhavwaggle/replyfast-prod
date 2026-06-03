# Say HelloLeads — AI Lead Response for Real Estate

Respond to every lead in under 60 seconds. Say Hello Leads uses Claude AI to instantly engage, qualify, and brief you on real estate leads from Zillow, Homes.com, SMS, and your website.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in your keys
npm run dev
```

## Deploy

Push to GitHub → import at vercel.com → add env vars → done.

## Required env vars

| Key | Description |
|-----|-------------|
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your domain e.g. `https://www.sayhelloleads.com` |
| `KV_REST_API_URL` | Auto-injected by Vercel after creating Upstash for Redis |
| `KV_REST_API_TOKEN` | Auto-injected by Vercel |
| `RESEND_API_KEY` | From resend.com (free tier, no domain needed) |

## Optional env vars

| Key | Description |
|-----|-------------|
| `TWILIO_ACCOUNT_SID` | For SMS responses |
| `TWILIO_AUTH_TOKEN` | For SMS responses |
| `TWILIO_PHONE_NUMBER` | Your Twilio number |
| `POSTMARK_SERVER_TOKEN` | For email lead forwarding |

## Architecture

- **Next.js 14** — frontend + API routes
- **Upstash Redis** — lead + user storage
- **NextAuth** — multi-agent auth
- **Claude (Sonnet)** — AI responses + lead scoring
- **Resend** — agent email notifications
- **Twilio** — inbound/outbound SMS
