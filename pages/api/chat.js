/**
 * /api/chat
 * Secure Claude API proxy — API key never exposed to browser.
 * Authenticated agents: 120 req/hour
 * Public demo (unauthenticated): 20 req/hour per IP
 */

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const rateLimitMap = new Map();

function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  rateLimitMap.set(key, record);
  return record.count <= limit;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth — optional. Authenticated users get higher rate limits.
  const session = await getServerSession(req, res, authOptions);
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  const rateLimitKey = session ? `auth:${session.user.email}` : `ip:${ip}`;
  const rateLimit = session ? 120 : 20;

  if (!checkRateLimit(rateLimitKey, rateLimit, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in an hour.' });
  }

  const { system, messages, max_tokens = 500 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  const sanitized = messages
    .filter(m => m && m.role && m.content)
    .slice(-20)
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 2000),
    }));

  if (sanitized.length === 0) return res.status(400).json({ error: 'No valid messages' });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens,
      system: system ? String(system).slice(0, 4000) : undefined,
      messages: sanitized,
    });
    return res.status(200).json({ reply: response.content?.[0]?.text || '' });
  } catch (error) {
    console.error('Claude API error:', error);
    if (error.status === 429) return res.status(429).json({ error: 'AI rate limited. Try again shortly.' });
    if (error.status === 401) return res.status(500).json({ error: 'AI API key invalid — check ANTHROPIC_API_KEY in Vercel env vars.' });
    return res.status(500).json({ error: 'AI service error' });
  }
}
