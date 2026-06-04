/**
 * /api/inbound-email
 * Postmark inbound webhook — receives forwarded lead emails from Zillow,
 * Homes.com, Realtor.com etc. and creates a lead for the correct agent.
 *
 * Setup: In Postmark, set inbound webhook to:
 *   https://www.sayhelloleads.com/api/inbound-email
 * Each agent gets a unique inbound address like:
 *   <agentId>@inbound.postmarkapp.com
 * They forward their Zillow/Homes.com notification emails to that address.
 */

import { saveLead } from '../../lib/db';
import { getUserById } from '../../lib/users';
import { getAgentConfig } from '../../lib/agentConfig';
import { notifyAgentNewLead } from '../../lib/notify';
import { triggerAIResponse } from './new-lead';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const payload   = req.body;
  const toEmail   = payload?.To || payload?.ToFull?.[0]?.Email || '';
  const fromEmail = payload?.From || payload?.FromFull?.Email || '';
  const subject   = payload?.Subject || '';
  const textBody  = payload?.TextBody || payload?.StrippedTextReply || payload?.HtmlBody || '';

  // Derive agentId from the "To" address — agents use <agentId>@inbound.postmarkapp.com
  const agentId = extractAgentId(toEmail);
  if (!agentId) {
    console.warn('inbound-email: could not resolve agentId from', toEmail);
    return res.status(200).json({ message: 'ignored — no agent found' });
  }

  const agent = await getUserById(agentId).catch(() => null);
  const cfg   = await getAgentConfig(agentId);

  const lead = parseLeadEmail(fromEmail, subject, textBody, agentId);

  if (!lead.email && !lead.phone) {
    console.log('inbound-email: no contact info parsed from:', subject);
    return res.status(200).json({ message: 'ignored — not a lead email' });
  }

  lead.id        = uuidv4();
  lead.createdAt = new Date().toISOString();
  lead.updatedAt = new Date().toISOString();

  await saveLead(lead);

  // triggerAIResponse handles all AI reply, guardrails, scoring, and SMS/email
  try {
    await Promise.race([
      triggerAIResponse(lead, agent, cfg),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 25000)),
    ]);
  } catch (e) { console.error('inbound-email AI error:', e.message); }

  // Notify agent — fires after scoring so email shows HOT/WARM/COLD
  const agentEmail = agent?.notifyEmail || agent?.email;
  if (agentEmail) {
    const agentName = agent?.name || 'your agent';
    await notifyAgentNewLead(lead, agentEmail, agentName, cfg.resendKey)
      .catch(e => console.error('inbound-email notify error:', e.message));
  }

  return res.status(200).json({ id: lead.id, message: 'Lead captured' });
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function extractAgentId(toAddress) {
  const m1 = toAddress.match(/^([a-f0-9-]{36})@/i);
  if (m1) return m1[1];
  const m2 = toAddress.match(/inbound\+([^@]+)@/i);
  if (m2) return m2[1];
  return null;
}

/**
 * Strip characters that could be used for prompt injection from parsed strings.
 * Lead emails are untrusted input — names, property addresses, etc. are embedded
 * directly into AI prompts, so we sanitize before they get there.
 */
function sanitizeField(str, maxLen = 120) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/[`<>]/g, '')           // strip prompt-injection chars
    .replace(/\n|\r/g, ' ')          // collapse newlines
    .trim()
    .slice(0, maxLen);
}

function parseLeadEmail(fromEmail, subject, body, agentId) {
  const lead = {
    agentId,
    fname: '', lname: '', email: '', phone: '',
    property: '', source: 'Email',
    messages: [], score: null, summary: '', smsSent: false,
  };

  // Detect source from sender or subject
  const combined = (fromEmail + ' ' + subject + ' ' + body).toLowerCase();
  if (combined.includes('zillow'))           lead.source = 'Zillow';
  else if (combined.includes('homes.com'))   lead.source = 'Homes.com';
  else if (combined.includes('realtor.com')) lead.source = 'Realtor.com';
  else if (combined.includes('redfin'))      lead.source = 'Redfin';
  else if (combined.includes('trulia'))      lead.source = 'Trulia';

  // ── Name ──────────────────────────────────────────────────────────────────
  const namePatterns = [
    /(?:Name|Buyer|Lead|Contact|From)[:\s]+([A-Z][a-z]+)\s+([A-Z][a-z]+)/,
    /^([A-Z][a-z]+)\s+([A-Z][a-z]+)\s+(?:is interested|has inquired|sent you)/m,
    /New lead from\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)/i,
  ];
  for (const p of namePatterns) {
    const m = body.match(p) || subject.match(p);
    if (m) {
      lead.fname = sanitizeField(m[1], 50);
      lead.lname = sanitizeField(m[2], 50);
      break;
    }
  }

  // ── Email ──────────────────────────────────────────────────────────────────
  const emailMatch = body.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    const skip = ['zillow','homes.com','realtor.com','redfin','trulia','postmark','sayhelloleads'];
    if (!skip.some(s => emailMatch[0].includes(s))) lead.email = emailMatch[0].slice(0, 200);
  }

  // ── Phone ──────────────────────────────────────────────────────────────────
  const phoneMatch = body.match(/(?:\+?1[\s\-.]?)?\(?(\\d{3})\)?[\s\-.]?(\d{3})[\s\-.]?(\d{4})/);
  if (phoneMatch) lead.phone = phoneMatch[0].replace(/\s/g, '').slice(0, 20);

  // ── Property ───────────────────────────────────────────────────────────────
  const propPatterns = [
    /(?:property|address|listing|home)[:\s]+([^\n]{10,100})/i,
    /interested in\s+([^\n]{10,100})/i,
    /inquired about\s+([^\n]{10,100})/i,
    /(\d+\s+[A-Z][a-z]+\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl)[^\n]{0,60})/,
  ];
  for (const p of propPatterns) {
    const m = body.match(p) || subject.match(p);
    if (m) { lead.property = sanitizeField(m[1], 120); break; }
  }
  if (!lead.property) {
    lead.property = sanitizeField(subject.replace(/^(fwd|re|fw):\s*/i, ''), 80);
  }

  // ── Message ────────────────────────────────────────────────────────────────
  // Cap at 500 chars and strip injection chars — this goes directly into AI prompts
  const safeBody = body
    .replace(/[`<>]/g, '')
    .trim()
    .slice(0, 500);

  lead.messages = [{ role: 'lead', text: safeBody }];

  return lead;
}

export const config = {
  api: { bodyParser: { type: 'application/json' } },
};
