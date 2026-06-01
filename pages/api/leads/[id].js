/**
 * /api/leads/[id]
 * GET    — get single lead
 * PUT    — update lead (score, summary, messages, etc.)
 * DELETE — delete lead
 */

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/auth';
import { getLead, saveLead, deleteLead } from '../../../lib/db';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;

  if (req.method === 'GET') {
    const lead = await getLead(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    return res.status(200).json({ lead });
  }

  if (req.method === 'PUT') {
    const existing = await getLead(id);
    if (!existing) return res.status(404).json({ error: 'Lead not found' });
    const updated = { ...existing, ...req.body, id, updatedAt: new Date().toISOString() };
    await saveLead(updated);
    return res.status(200).json({ lead: updated });
  }

  if (req.method === 'DELETE') {
    await deleteLead(id);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
