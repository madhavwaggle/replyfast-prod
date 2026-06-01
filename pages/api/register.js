/**
 * /api/register
 * POST — create a new agent account
 */

import { createUser } from '../../lib/users';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, password, agencyName } = req.body || {};

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password are required.' });

  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  try {
    const user = await createUser({ name, email, password, agencyName });
    return res.status(201).json({ ok: true, userId: user.id });
  } catch (err) {
    return res.status(409).json({ error: err.message });
  }
}
