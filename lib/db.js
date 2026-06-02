/**
 * lib/db.js
 * Persistence — Upstash Redis via Vercel KV env vars.
 * All leads scoped per agent via agentId.
 * Falls back to in-memory for local dev without Redis.
 */

let redis = null;
async function getRedis() {
  if (redis) return redis;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { Redis } = await import('@upstash/redis');
    redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    return redis;
  }
  return null;
}

const mem = new Map();

// ─── LEADS ────────────────────────────────────────────────────────────────────

export async function saveLead(lead) {
  const store = await getRedis();
  const { id, agentId } = lead;
  if (!agentId) throw new Error('saveLead requires agentId');

  if (store) {
    await store.set(`lead:${id}`, JSON.stringify(lead));
    await store.zadd(`leads:${agentId}`, { score: Date.now(), member: id });
  } else {
    mem.set(`lead:${id}`, lead);
    const key = `leads:${agentId}`;
    if (!mem.has(key)) mem.set(key, []);
    const idx = mem.get(key);
    if (!idx.includes(id)) idx.unshift(id);
  }
  return lead;
}

export async function getLead(id) {
  const store = await getRedis();
  if (store) {
    const raw = await store.get(`lead:${id}`);
    return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
  }
  return mem.get(`lead:${id}`) || null;
}

export async function getAllLeads({ agentId, limit = 100, filter = null } = {}) {
  if (!agentId) return [];
  const store = await getRedis();

  if (store) {
    const ids = await store.zrange(`leads:${agentId}`, 0, limit - 1, { rev: true });
    if (!ids || ids.length === 0) return [];
    const leads = await Promise.all(ids.map(async (id) => {
      const raw = await store.get(`lead:${id}`);
      return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    }));
    const valid = leads.filter(Boolean);
    return filter ? valid.filter(l => l.score === filter) : valid;
  } else {
    const idx = mem.get(`leads:${agentId}`) || [];
    const leads = idx.map(id => mem.get(`lead:${id}`)).filter(Boolean);
    return filter ? leads.filter(l => l.score === filter) : leads;
  }
}

export async function updateLead(id, updates) {
  const existing = await getLead(id);
  if (!existing) return null;
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  return saveLead(updated);
}

export async function deleteLead(id, agentId) {
  const store = await getRedis();
  if (store) {
    await store.del(`lead:${id}`);
    if (agentId) await store.zrem(`leads:${agentId}`, id);
  } else {
    mem.delete(`lead:${id}`);
    if (agentId) {
      const idx = mem.get(`leads:${agentId}`) || [];
      mem.set(`leads:${agentId}`, idx.filter(i => i !== id));
    }
  }
}

// ─── STATS ────────────────────────────────────────────────────────────────────

export async function getStats(agentId) {
  const leads = await getAllLeads({ agentId, limit: 1000 });
  return {
    total: leads.length,
    hot:   leads.filter(l => l.score === 'HOT').length,
    warm:  leads.filter(l => l.score === 'WARM').length,
    cold:  leads.filter(l => l.score === 'COLD').length,
    responseRate:    leads.length > 0 ? '100%' : '—',
    avgResponseTime: '<60s',
  };
}

// ─── USERS (profile updates) ──────────────────────────────────────────────────

export async function updateUserProfile(userId, updates) {
  const store = await getRedis();
  const key = `user:${userId}`;
  if (store) {
    const raw = await store.get(key);
    const user = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    if (!user) return null;
    const updated = { ...user, ...updates, updatedAt: new Date().toISOString() };
    await store.set(key, JSON.stringify(updated));
    return updated;
  } else {
    const user = mem.get(key);
    if (!user) return null;
    const updated = { ...user, ...updates, updatedAt: new Date().toISOString() };
    mem.set(key, updated);
    return updated;
  }
}
