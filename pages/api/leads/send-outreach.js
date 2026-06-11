/**
 * /api/leads/send-outreach
 * POST { leadId, message, channel: 'email' | 'sms' | 'both' }
 *
 * Called when agent approves (and optionally edits) the AI draft.
 * Sends the message via the chosen channel and kicks off the full
 * triggerAIResponse pipeline so the lead enters the same automated
 * conversation loop as Zillow/Homes.com leads.
 */
import { getServerSession }   from 'next-auth/next';
import { authOptions }        from '../../lib/auth';
import { getLead, saveLead }  from '../../lib/db';
import { getUserById }        from '../../lib/users';
import { getAgentConfig }     from '../../lib/agentConfig';
import { triggerAIResponse }  from '../new-lead';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const agentId = session.user.id;
  const { leadId, message, channel } = req.body || {};

  if (!leadId)  return res.status(400).json({ error: 'leadId required' });
  if (!message) return res.status(400).json({ error: 'message required' });
  if (!['email','sms','both'].includes(channel)) return res.status(400).json({ error: 'channel must be email, sms, or both' });

  // Load the lead and verify it belongs to this agent
  const lead = await getLead(leadId).catch(() => null);
  if (!lead)               return res.status(404).json({ error: 'Lead not found' });
  if (lead.agentId !== agentId) return res.status(403).json({ error: 'Forbidden' });

  const cfg   = await getAgentConfig(agentId);
  const agent = await getUserById(agentId);

  // Replace the AI draft note with the approved message as the first AI turn
  // This primes the conversation correctly for follow-up exchanges
  lead.messages = [
    // Keep the agent's original note if present (role: lead)
    ...(lead.messages || []).filter(m => m.role === 'lead'),
    { role: 'ai', text: message },
  ];
  lead.outreachPending = false;
  lead.outreachSentAt  = new Date().toISOString();
  lead.outreachChannel = channel;
  lead.updatedAt       = new Date().toISOString();

  // ── Send via chosen channel ───────────────────────────────────────────────

  const errors = [];

  // EMAIL
  if ((channel === 'email' || channel === 'both') && lead.email) {
    try {
      if (cfg.postmarkToken) {
        const { ServerClient } = await import('postmark');
        const client = new ServerClient(cfg.postmarkToken);
        const agentName = agent?.name || 'Your Agent';
        await client.sendEmail({
          From:     cfg.emailFrom || `${agentName} <noreply@sayhelloleads.com>`,
          To:       lead.email,
          Subject:  lead.property ? `Re: ${lead.property}` : 'Following up from your inquiry',
          TextBody: message,
          HtmlBody: `<div style="font-family:sans-serif;max-width:600px;line-height:1.6;">${message.replace(/\n/g, '<br>')}</div>`,
        });
        lead.emailSent = true;
      } else {
        errors.push('Email not sent — Postmark not configured. Agent can copy the message and send manually.');
      }
    } catch (e) {
      console.error('[send-outreach] email error:', e.message);
      errors.push(`Email failed: ${e.message}`);
    }
  }

  // SMS
  if ((channel === 'sms' || channel === 'both') && lead.phone) {
    try {
      if (cfg.twilioSid && cfg.twilioPhone) {
        const twilio = (await import('twilio')).default;
        await twilio(cfg.twilioSid, cfg.twilioToken).messages.create({
          to:   lead.phone,
          from: cfg.twilioPhone,
          body: message.slice(0, 1600),
        });
        lead.smsSent = true;
      } else {
        errors.push('SMS not sent — Twilio not configured.');
      }
    } catch (e) {
      console.error('[send-outreach] SMS error:', e.message);
      errors.push(`SMS failed: ${e.message}`);
    }
  }

  await saveLead(lead);

  // ── Kick off the full AI conversation pipeline ────────────────────────────
  // This is the same call Zillow/Homes.com leads go through.
  // It will: score → save → notify agent → set up conversation loop.
  // We fire it in the background so the API response is fast.
  triggerAIResponse(lead, agent, cfg).catch(e =>
    console.error('[send-outreach] triggerAIResponse error:', e.message)
  );

  return res.status(200).json({
    ok: true,
    emailSent: !!lead.emailSent,
    smsSent:   !!lead.smsSent,
    errors,    // non-fatal warnings the UI can display
  });
}
