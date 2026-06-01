/**
 * /api/chat
 * Secure Claude API proxy — API key never exposed to browser.
 * Requires authentication.
 */

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Rate limiting — simple in-memory counter (use Redis for production scale)
const rateLimitMap = new Map();
const RATE_LIMIT = 60; // requests per hour per session
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(sessionId) {
  const now = Date.now();
  const record = rateLimitMap.get(sessionId) || { count: 0, resetAt: now + RATE_WINDOW };
  
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_WINDOW;
  }
  
  record.count++;
  rateLimitMap.set(sessionId, record);
  
  return record.count <= RATE_LIMIT;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Rate limit
  if (!checkRateLimit(session.user.email)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in an hour.' });
  }

  const { system, messages, max_tokens = 500 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  // Sanitize messages
  const sanitized = messages
    .filter(m => m && m.role && m.content)
    .slice(-20) // Keep last 20 messages to manage context window costs
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 2000), // Limit per message
    }));

  if (sanitized.length === 0) {
    return res.status(400).json({ error: 'No valid messages' });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens,
      system: system ? String(system).slice(0, 4000) : undefined,
      messages: sanitized,
    });

    const reply = response.content?.[0]?.text || '';
    return res.status(200).json({ reply, usage: response.usage });
  } catch (error) {
    console.error('Claude API error:', error);
    if (error.status === 429) {
      return res.status(429).json({ error: 'AI service rate limited. Please wait a moment.' });
    }
    return res.status(500).json({ error: 'AI service error' });
  }
}
