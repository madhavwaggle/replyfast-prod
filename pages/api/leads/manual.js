/**
 * /api/leads/manual
 * POST — create a lead manually (referral, open house, sign call, etc.)
 *
 * Flow (Option B):
 *   1. Save lead
 *   2. AI scores it using the agent's note as context
 *   3. AI drafts a first outreach message
 *   4. Return lead + draft to the UI — agent reviews and approves before sending
 *   5. Agent clicks "Send email" or "Send SMS" → hits /api/leads/send-outreach
 *      which calls triggerAIResponse (same pipeline as Zillow/Homes.com)
 *
 * No message is sent automatically — agent has full control.
 */
import { getServerSession }  from 'next-auth/next';
import { authOptions }       from '../../../lib/auth';
import { saveLead }          from '../../../lib/db';
import { getUserById }       from '../../../lib/users';
import { getAgentConfig }    from '../../../lib/agentConfig';
import { buildScoringPrompt, parseScoreResponse } from '../../../lib/aiPrompts';
import { validateScore }     from '../../../lib/guardrails';
import { v4 as uuidv4 }      from 'uuid';
import Anthropic             from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const agentId = session.user.id;
  const { fname, lname, email, phone, property, note, source } = req.body || {};

  if (!fname) return res.status(400).json({ error: 'First name is required' });
  if (!email && !phone) return res.status(400).json({ error: 'Email or phone is required' });

  const lead = {
    id:        uuidv4(),
    agentId,
    fname:     fname.trim(),
    lname:     (lname || '').trim(),
    email:     (email || '').toLowerCase().trim(),
    phone:     (phone || '').trim(),
    property:  (property || '').trim(),
    source:    source || 'Referral',
    manual:    true,
    outreachPending: true, // flag: agent hasn't approved outreach yet
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages:  note?.trim() ? [{ role: 'lead', text: note.trim() }] : [],
  };

  // ── AI scoring + draft ────────────────────────────────────────────────────
  let suggestedOutreach = null;
  let twilioReady = false;

  try {
    const cfg      = await getAgentConfig(agentId);
    const agent    = await getUserById(agentId);
    const agentName  = agent?.name || session.user.name || 'your agent';
    const agencyName = agent?.agencyName || '';

    twilioReady = !!(cfg.twilioSid && cfg.twilioPhone && lead.phone);

    if (cfg?.anthropicKey) {
      const anthropic = new Anthropic({ apiKey: cfg.anthropicKey });

      // 1. Score
      const scorePrompt = buildScoringPrompt({ lead });
      const scoreResp   = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system:     scorePrompt.system,
        messages:   scorePrompt.messages,
      });
      const scored = parseScoreResponse(scoreResp.content?.[0]?.text);
      if (validateScore(scored)) {
        lead.score      = scored.score;
        lead.confidence = scored.confidence;
        lead.signals    = scored.signals;
        lead.summary    = scored.summary;
        lead.nextAction = scored.nextAction;
      }

      // 2. Draft first outreach — warm, personal, from the agent
      const propertyLine = lead.property ? ` — ${lead.property}` : '';
      const scoreHint    = lead.score === 'HOT'
        ? 'High intent lead — be warm and move toward scheduling quickly. Mention you\'d love to connect soon.'
        : lead.score === 'COLD'
        ? 'Low urgency — keep it very light and low-pressure. No push, no urgency language.'
        : 'Warm lead — friendly and curious, end with one soft qualifying question.';

      // Extract referrer name if mentioned in note
      const referrerMatch = note?.match(/referred by ([A-Za-z\s]+?)(?:[,.]|$)/i);
      const referrerName  = referrerMatch ? referrerMatch[1].trim() : null;

      const agentCell = agent?.phone || agent?.agentNotifyPhone || '';

      const outreachResp = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 280,
        system: `You are a real estate agent writing a personal first-contact message to a referral lead. Write in first person as the agent — not instructions about what to write.

RULES:
- Sound like a real human texting — warm, specific, natural. NOT a template.
- Use the lead's first name.
- If there's a referrer name, mention them by name — it builds instant trust.
- If there's a property, mention it specifically.
- If there's a budget or timeline in the context, acknowledge it naturally.
- 2-3 sentences for the main message. No formal sign-off like "Best regards".
- End with ONE soft, natural qualifying question — conversational like "Are you still actively looking or just exploring options right now?"
- After the question, add a warm closing line and the agent's contact info on a new line.
- Closing format: "Looking forward to connecting! — [Agent Name]${agentCell ? ` | ${agentCell}` : ''}\nFeel free to call or text me directly."
- Do NOT mention AI, automation, or any platform.
- Do NOT use filler phrases like "I wanted to reach out" or "I came across your information".`,
        messages: [{
          role: 'user',
          content: `Agent: ${agentName}${agencyName ? ` at ${agencyName}` : ''}
Agent cell: ${agentCell || 'not provided'}
Lead first name: ${lead.fname}
${lead.property ? `Property: ${lead.property}` : ''}
${referrerName ? `Referred by: ${referrerName}` : ''}
${note?.trim() ? `Context from agent: "${note.trim()}"` : ''}
Lead score: ${lead.score || 'WARM'}
Hint: ${scoreHint}

Write the first outreach message with the warm closing. Make it feel like it was written just for this person.`,
        }],
      });
      suggestedOutreach = outreachResp.content?.[0]?.text?.trim() || null;
    }
  } catch (e) {
    console.error('[manual lead] AI error:', e.message);
  }

  // Default score fallback
  if (!lead.score) {
    lead.score      = 'WARM';
    lead.confidence = 'low';
    lead.summary    = `${lead.fname} was added manually. Follow up to qualify their timeline and budget.`;
    lead.nextAction = 'Reach out personally to introduce yourself.';
  }

  // Store the draft on the lead so the agent can access it from the lead card later
  if (suggestedOutreach) {
    lead.outreachDraft = suggestedOutreach;
    await saveLead(lead);
  }

  return res.status(200).json({
    lead,
    suggestedOutreach,
    twilioReady,
    hasEmail: !!lead.email,
  });
}
