/**
 * lib/db.js — Upstash Redis via Vercel KV env vars.
 * All leads scoped per agent. Falls back to in-memory for local dev.
 */

import { getRedis } from './redis';

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
  }
  const idx = mem.get(`leads:${agentId}`) || [];
  const leads = idx.map(id => mem.get(`lead:${id}`)).filter(Boolean);
  return filter ? leads.filter(l => l.score === filter) : leads;
}

export async function updateLead(id, updates) {
  const existing = await getLead(id);
  if (!existing) return null;
  return saveLead({ ...existing, ...updates, updatedAt: new Date().toISOString() });
}

/**
 * Find an existing lead for an agent by email or phone.
 * Used by inbound-email and inbound-sms to append replies
 * to the existing conversation instead of creating duplicates.
 */
export async function findLeadByContact(agentId, { email, phone, subject } = {}) {
  if (!agentId || (!email && !phone)) return null;
  const leads = await getAllLeads({ agentId, limit: 1000 });
  const emailLower   = (email || '').toLowerCase().trim();
  const phoneTrim    = (phone || '').replace(/\D/g, '');
  const subjectLower = (subject || '').toLowerCase();

  // Find all leads matching this contact
  const matches = leads.filter(l => {
    if (emailLower && l.email && l.email.toLowerCase() === emailLower) return true;
    if (phoneTrim  && l.phone && l.phone.replace(/\D/g, '') === phoneTrim)  return true;
    return false;
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Multiple matches — pick the best one:
  // 1. Prefer a lead whose property is mentioned in the email subject
  if (subjectLower) {
    const propertyMatch = matches.find(l =>
      l.property && subjectLower.includes(l.property.toLowerCase().slice(0, 20))
    );
    if (propertyMatch) return propertyMatch;
  }

  // 2. Prefer the most recently updated active lead (has recent messages)
  const sorted = [...matches].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime; // most recent first
  });

  return sorted[0];
}

export async function deleteLead(id, agentId) {
  const store = await getRedis();
  if (store) {
    await store.del(`lead:${id}`);
    if (agentId) await store.zrem(`leads:${agentId}`, id);
  } else {
    mem.delete(`lead:${id}`);
    if (agentId) mem.set(`leads:${agentId}`, (mem.get(`leads:${agentId}`) || []).filter(i => i !== id));
  }
}

export async function getStats(agentId) {
  const leads = await getAllLeads({ agentId, limit: 1000 });
  return {
    total: leads.length,
    hot:   leads.filter(l => l.score === 'HOT').length,
    warm:  leads.filter(l => l.score === 'WARM').length,
    cold:  leads.filter(l => l.score === 'COLD').length,
    responseRate: leads.length > 0 ? '100%' : '—',
    avgResponseTime: '<60s',
  };
}

// ─── USER PROFILE UPDATES ─────────────────────────────────────────────────────

export async function updateUserProfile(userId, updates) {
  const store = await getRedis();
  const key = `user:${userId}`;
  if (store) {
    const raw = await store.get(key);
    const user = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    if (!user) return null;
    const updated = { ...user, ...updates, updatedAt: new Date().toISOString() };
    await store.set(key, JSON.stringify(updated));
    // Keep agent:slug index in sync when name changes
    if (updates.name && updates.name !== user.name) {
      const oldSlug = (user.name || '').toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
      const newSlug = updates.name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
      if (oldSlug) await store.del(`agent:slug:${oldSlug}`);
      if (newSlug) await store.set(`agent:slug:${newSlug}`, userId);
    }
    return updated;
  }
  const user = mem.get(key);
  if (!user) return null;
  const updated = { ...user, ...updates, updatedAt: new Date().toISOString() };
  mem.set(key, updated);
  return updated;
}
