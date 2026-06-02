/**
 * /api/new-lead
 * Public endpoint — receives leads from website forms / integrations.
 * Requires WEBHOOK_SECRET + AGENT_ID headers to route to the right agent.
 */

import { saveLead, getAllLeads } from '../../lib/db';
import { getUserById } from '../../lib/users';
import { notifyAgentNewLead } from '../../lib/notify';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = req.headers['x-webhook-secret'] || req.body.secret;
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // agentId must be passed so we know whose account this lead belongs to
  const agentId = req.headers['x-agent-id'] || req.body.agentId || process.env.DEFAULT_AGENT_ID;
  if (!agentId) return res.status(400).json({ error: 'agentId required' });

  const { fname, lname, email, phone, property, message, source } = req.body;
  if (!email && !phone) return res.status(400).json({ error: 'email or phone required' });

  const agent = await getUserById(agentId).catch(() => null);

  const id = uuidv4();
  const lead = {
    id,
    agentId,
    fname: fname || 'Unknown',
    lname: lname || '',
    email: email || '',
    phone: phone || '',
    property: property || 'property inquiry',
    source: source || 'Website',
    messages: [{ role: 'lead', text: message || 'Inquiry received' }],
    score: null,
    summary: '',
    smsSent: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveLead(lead);

  // Trigger AI response async — don't block the HTTP response
  triggerAIResponse(lead, agent).catch(console.error);

  return res.status(200).json({ id, message: 'Lead received' });
}

async function triggerAIResponse(lead, agent) {
  const agentName = agent?.name || process.env.AGENT_NAME || 'your agent';
  const agencyName = agent?.agencyName || '';

  const systemPrompt = `You are a Say Hello Leads AI real estate lead assistant working on behalf of ${agentName}${agencyName ? ` at ${agencyName}` : ''}.

Lead details:
- Name: ${lead.fname} ${lead.lname}
- Email: ${lead.email}
- Phone: ${lead.phone || 'not provided'}
- Property: ${lead.property}
- Source: ${lead.source}

Respond warmly, reference the property they asked about, ask one qualifying question (timeline, budget, or pre-approval status). Keep it under 4 sentences. Sign off as "Say Hello Leads AI, on behalf of ${agentName}".`;

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: lead.messages[0].text }],
    });

    const aiReply = resp.content?.[0]?.text || '';
    if (!aiReply) return;

    lead.messages.push({ role: 'ai', text: aiReply });
    lead.updatedAt = new Date().toISOString();

    // Score the lead immediately
    const scoreResp = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      system: 'You are a lead scoring assistant. Respond ONLY with valid JSON, no markdown.',
      messages: [{ role: 'user', content: `Score this real estate lead. HOT=ready <30 days with budget. WARM=interested but vague. COLD=just browsing.\n\nLead: ${lead.fname} ${lead.lname}\nMessage: ${lead.messages[0].text}\nProperty: ${lead.property}\n\nRespond: {"score":"HOT","summary":"2-sentence agent briefing with name, what they want, and next action."}` }],
    });
    try {
      const parsed = JSON.parse(scoreResp.content?.[0]?.text?.replace(/```json|```/g, '').trim());
      lead.score = parsed.score || 'WARM';
      lead.summary = parsed.summary || '';
    } catch {
      lead.score = 'WARM';
      lead.summary = `${lead.fname} inquired about ${lead.property}. Follow up to schedule a showing.`;
    }

    await saveLead(lead);

    // SMS the lead if phone available
    if (lead.phone && process.env.TWILIO_ACCOUNT_SID) {
      await sendSMS(lead.phone, aiReply).catch(console.error);
      lead.smsSent = true;
      await saveLead(lead);
    }

    // Email the lead if email available
    if (lead.email && process.env.POSTMARK_SERVER_TOKEN) {
      await sendEmailToLead(lead, aiReply, agentName).catch(console.error);
    }

    // Notify the agent
    const agentEmail = agent?.email || process.env.AGENT_EMAIL;
    if (agentEmail) {
      await notifyAgentNewLead(lead, agentEmail, agentName).catch(console.error);
    }
  } catch (e) {
    console.error('AI trigger error:', e);
  }
}

async function sendSMS(to, body) {
  const twilio = (await import('twilio')).default;
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({ to, from: process.env.TWILIO_PHONE_NUMBER, body: body.slice(0, 1600) });
}

async function sendEmailToLead(lead, aiReply, agentName) {
  const postmark = await import('postmark');
  const client = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);
  await client.sendEmail({
    From: process.env.EMAIL_FROM || `${agentName} via Say Hello Leads <noreply@sayhelloleads.com>`,
    To: lead.email,
    Subject: `Re: ${lead.property}`,
    TextBody: aiReply,
    HtmlBody: `<div style="font-family:sans-serif;max-width:600px;padding:1.5rem;">${aiReply.replace(/\n/g, '<br>')}</div>`,
  });
}
