/**
 * lib/agentConfig.js
 *
 * Resolves config for an agent.
 *
 * BUSINESS MODEL RULES:
 *   - ANTHROPIC_API_KEY and RESEND_API_KEY are ALWAYS from env vars (owner's keys).
 *     Agents never set these — AI and email alerts are included in their subscription.
 *   - Twilio, Postmark, webhookSecret come from the agent's own saved credentials.
 *   - displayName comes from the agent's Profile page — what leads see as the sender.
 */

import { getAgentCredentials } from '../pages/api/credentials';
import { getUserById } from './users';

export async function getAgentConfig(agentId) {
  let creds = {};
  let agent = null;
  try {
    if (agentId) {
      [creds, agent] = await Promise.all([
        getAgentCredentials(agentId),
        getUserById(agentId),
      ]);
    }
  } catch (e) {
    console.error('getAgentConfig error:', e);
  }

  return {
    // ── Owner-level keys (subscription-included, never agent-settable) ──
    anthropicKey:  process.env.ANTHROPIC_API_KEY  || '',
    resendKey:     process.env.RESEND_API_KEY      || '',

    // ── Agent-level credentials (set per agent in Integrations page) ──
    twilioSid:     creds.twilioSid     || process.env.TWILIO_ACCOUNT_SID   || '',
    twilioToken:   creds.twilioToken   || process.env.TWILIO_AUTH_TOKEN    || '',
    twilioPhone:   creds.twilioPhone   || process.env.TWILIO_PHONE_NUMBER  || '',
    postmarkToken: creds.postmarkToken || process.env.POSTMARK_SERVER_TOKEN || '',
    emailFrom:     creds.emailFrom     || process.env.EMAIL_FROM           || '',
    webhookSecret: creds.webhookSecret || process.env.WEBHOOK_SECRET       || '',
    calendlyUrl:   creds.calendlyUrl   || process.env.CALENDLY_URL         || '',

    // ── Display name — set in Profile, used as email sender name ──
    // Falls back to agent's full name, then a generic default.
    displayName:   agent?.displayName  || agent?.name || 'Your Agent',
  };
}
