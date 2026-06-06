/**
 * /api/auth/forgot-password
 * POST { email } — generate a reset token and send email via lib/email.js
 */

import { getUserByEmail, saveResetToken } from '../../../lib/users';
import { sendPasswordResetEmail } from '../../../lib/email';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required.' });

  // Always return success — never reveal whether email exists
  const user = await getUserByEmail(email).catch(() => null);

  if (user) {
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 1000 * 60 * 60; // 1 hour
    await saveResetToken(user.id, token, expiresAt);

    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}&id=${user.id}`;
    await sendPasswordResetEmail({ email: user.email, name: user.name, resetUrl });
  }

  return res.status(200).json({ ok: true });
}
