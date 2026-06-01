/**
 * /api/new-lead
 * Public endpoint for receiving leads from:
 *   - Website contact forms
 *   - Direct API integrations
 *
 * Validates a shared secret (WEBHOOK_SECRET) to prevent abuse.
 * Then saves lead, triggers AI first response, and notifies agent.
 */

import { saveLead } from '../../lib/db';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Optional shared secret for public-facing endpoint security
  const secret = req.headers['x-webhook-secret'] || req.body.secret;
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { fname, lname, email, phone, property, message, source } = req.body;
  if (!email && !phone) return res.status(400).json({ error: 'email or phone required' });

  const id = uuidv4();
  const lead = {
    id,
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

  // Trigger AI first response asynchronously (don't block the response)
  triggerAIResponse(lead).catch(console.error);

  return res.status(200).json({ id, message: 'Lead received' });
}

async function triggerAIResponse(lead) {
  try {
    const systemPrompt = `You are ReplyFast, an AI real estate lead assistant working on behalf of ${process.env.AGENT_NAME || 'a real estate agent'}.

Lead details:
- Name: ${lead.fname} ${lead.lname}
- Email: ${lead.email}
- Phone: ${lead.phone || 'not provided'}
- Property: ${lead.property}
- Source: ${lead.source}

Respond warmly, reference the property, ask one qualifying question, keep it under 4 sentences. Sign off as "ReplyFast AI, on behalf of ${process.env.AGENT_NAME || 'your agent'}".`;

    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: lead.messages[0].text }],
    });

    const aiReply = resp.content?.[0]?.text || '';
    if (aiReply) {
      lead.messages.push({ role: 'ai', text: aiReply });
      lead.updatedAt = new Date().toISOString();
      await saveLead(lead);

      // Send SMS if phone provided
      if (lead.phone && process.env.TWILIO_ACCOUNT_SID) {
        await sendSMS(lead.phone, aiReply);
        lead.smsSent = true;
        await saveLead(lead);
      }

      // Send email if email provided
      if (lead.email && process.env.POSTMARK_SERVER_TOKEN) {
        await sendEmail(lead, aiReply);
      }
    }
  } catch (e) {
    console.error('AI trigger error:', e);
  }
}

async function sendSMS(to, body) {
  const twilio = (await import('twilio')).default;
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    to,
    from: process.env.TWILIO_PHONE_NUMBER,
    body: body.slice(0, 1600),
  });
}

async function sendEmail(lead, aiReply) {
  const postmark = await import('postmark');
  const client = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);
  await client.sendEmail({
    From: process.env.EMAIL_FROM || `ReplyFast <noreply@replyfast.com>`,
    To: lead.email,
    Subject: `Re: ${lead.property}`,
    TextBody: aiReply,
    HtmlBody: `<div style="font-family:sans-serif;max-width:600px;padding:1.5rem;">${aiReply.replace(/\n/g, '<br>')}</div>`,
  });
}
