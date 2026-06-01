/**
 * lib/users.js
 * Agent user accounts stored in Redis.
 * Keys:
 *   user:{id}           → JSON user object
 *   user:email:{email}  → id  (lookup by email)
 *   users:index         → sorted set of all user IDs
 */

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

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

// In-memory fallback for local dev
const mem = new Map();

export async function createUser({ name, email, password, agencyName = '' }) {
  const store = await getRedis();
  // Check duplicate email
  const existing = await getUserByEmail(email);
  if (existing) throw new Error('An account with this email already exists.');

  const id = uuidv4();
  const hash = await bcrypt.hash(password, 10);
  const user = {
    id,
    name,
    email: email.toLowerCase().trim(),
    passwordHash: hash,
    agencyName,
    createdAt: new Date().toISOString(),
  };

  if (store) {
    await store.set(`user:${id}`, JSON.stringify(user));
    await store.set(`user:email:${email.toLowerCase().trim()}`, id);
    await store.zadd('users:index', { score: Date.now(), member: id });
  } else {
    mem.set(`user:${id}`, user);
    mem.set(`user:email:${email.toLowerCase().trim()}`, id);
  }

  return user;
}

export async function getUserByEmail(email) {
  if (!email) return null;
  const key = email.toLowerCase().trim();
  const store = await getRedis();

  if (store) {
    const id = await store.get(`user:email:${key}`);
    if (!id) return null;
    const raw = await store.get(`user:${id}`);
    return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
  }
  const id = mem.get(`user:email:${key}`);
  return id ? mem.get(`user:${id}`) || null : null;
}

export async function getUserById(id) {
  const store = await getRedis();
  if (store) {
    const raw = await store.get(`user:${id}`);
    return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
  }
  return mem.get(`user:${id}`) || null;
}

export async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash);
}
