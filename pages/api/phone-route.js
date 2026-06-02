/**
 * /api/phone-route
 * Each agent assigns their Twilio number here.
 * Inbound SMS uses this table to route to the right agent.
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';

let redis = null;
async function getRedis() {
  if (redis) return redis;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { Redis } = await import('@upstash/redis');
    redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
    return redis;
  }
  return null;
}

export async function getAgentIdForPhone(phoneNumber) {
  if (!phoneNumber) return process.env.DEFAULT_AGENT_ID || null;
  const store = await getRedis();
  if (store) {
    const routes = await store.hgetall('phone_routes');
    return routes?.[phoneNumber] || process.env.DEFAULT_AGENT_ID || null;
  }
  return process.env.DEFAULT_AGENT_ID || null;
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const agentId = session.user.id;
  const store = await getRedis();

  if (req.method === 'GET') {
    if (!store) return res.status(200).json({ phone: null });
    const routes = await store.hgetall('phone_routes') || {};
    const myPhone = Object.entries(routes).find(([, id]) => id === agentId)?.[0] || null;
    return res.status(200).json({ phone: myPhone });
  }

  if (req.method === 'POST') {
    const { phone } = req.body || {};
    if (store) {
      const routes = await store.hgetall('phone_routes') || {};
      const oldPhone = Object.entries(routes).find(([, id]) => id === agentId)?.[0];
      if (oldPhone && oldPhone !== phone) await store.hdel('phone_routes', oldPhone);
      if (phone) {
        const existing = await store.hget('phone_routes', phone);
        if (existing && existing !== agentId) return res.status(409).json({ error: 'Number already assigned to another agent.' });
        await store.hset('phone_routes', { [phone]: agentId });
      }
    }
    return res.status(200).json({ ok: true, phone: phone || null });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
