/**
 * /api/inbound-sms
 * Twilio webhook — receives incoming SMS, creates/updates lead, AI responds.
 * Set this as the Twilio number's "Incoming Message Webhook URL".
 */

import { saveLead, getAllLeads } from '../../lib/db';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Twilio sends form-encoded data
  const from = req.body?.From || '';
  const body = req.body?.Body || '';
  
  if (!from || !body) {
    return res.status(400).send('Missing From or Body');
  }

  // Find existing lead with this phone or create new one
  const allLeads = await getAllLeads({ limit: 500 });
  let lead = allLeads.find(l => l.phone === from);

  if (!lead) {
    lead = {
      id: uuidv4(),
      fname: 'SMS',
      lname: 'Lead',
      email: '',
      phone: from,
      property: 'SMS inquiry',
      source: 'SMS / Text',
      messages: [],
      score: null,
      summary: '',
      smsSent: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  lead.messages.push({ role: 'lead', text: body });
  lead.updatedAt = new Date().toISOString();
  await saveLead(lead);

  // Build conversation history for Claude
  const history = lead.messages.map(m => ({
    role: m.role === 'ai' ? 'assistant' : 'user',
    content: m.text,
  }));

  const systemPrompt = `You are ReplyFast, an AI real estate lead assistant for ${process.env.AGENT_NAME || 'a real estate agent'}. You're texting with a lead.

Keep responses SHORT (1-2 sentences) — this is SMS. Be warm, helpful, qualify the lead.
If they ask about a property, get their timeline and budget.
Sign off as "- ReplyFast AI" only on the first message.`;

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: systemPrompt,
      messages: history,
    });

    const aiReply = resp.content?.[0]?.text || "Thanks for reaching out! What property are you interested in?";

    // Update lead with AI reply
    lead.messages.push({ role: 'ai', text: aiReply });
    await saveLead(lead);

    // Respond via Twilio TwiML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(aiReply.slice(0, 1600))}</Message>
</Response>`;

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml);
  } catch (e) {
    console.error('Inbound SMS error:', e);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thanks for reaching out! We'll get back to you shortly.</Message>
</Response>`;
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml);
  }
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const config = {
  api: { bodyParser: { type: 'application/x-www-form-urlencoded' } },
};
