/**
 * /api/auth/reset-password
 * POST { userId, token, password } — validate token, update password
 */

import { getUserById, validateResetToken, updatePassword, clearResetToken } from '../../../lib/users';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, token, password } = req.body || {};

  if (!userId || !token || !password)
    return res.status(400).json({ error: 'Missing required fields.' });

  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  // Validate token
  const valid = await validateResetToken(userId, token).catch(() => false);
  if (!valid) {
    return res.status(400).json({ error: 'This reset link has expired or is invalid. Please request a new one.' });
  }

  // Update password and clear the token
  await updatePassword(userId, password);
  await clearResetToken(userId);

  return res.status(200).json({ ok: true });
}
