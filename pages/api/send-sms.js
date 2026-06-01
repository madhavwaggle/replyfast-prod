/**
 * /api/send-sms
 * Send an SMS via Twilio — requires authentication.
 */

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'to and message required' });

  if (!process.env.TWILIO_ACCOUNT_SID) {
    return res.status(503).json({ error: 'SMS not configured. Add TWILIO_* env vars.' });
  }

  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const msg = await client.messages.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      body: message.slice(0, 1600),
    });
    return res.status(200).json({ success: true, sid: msg.sid });
  } catch (error) {
    console.error('Twilio error:', error);
    return res.status(500).json({ error: error.message });
  }
}
