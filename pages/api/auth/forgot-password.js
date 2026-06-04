/**
 * /api/auth/forgot-password
 * POST { email } — generate a reset token, send email via Resend
 */

import { getUserByEmail, saveResetToken } from '../../../lib/users';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required.' });

  // Always return success — never reveal whether email exists (security best practice)
  const user = await getUserByEmail(email).catch(() => null);

  if (user) {
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 1000 * 60 * 60; // 1 hour

    await saveResetToken(user.id, token, expiresAt);

    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}&id=${user.id}`;

    await sendResetEmail({ email: user.email, name: user.name, resetUrl });
  }

  return res.status(200).json({ ok: true });
}

async function sendResetEmail({ email, name, resetUrl }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('RESEND_API_KEY not set — password reset email skipped. Reset URL:', resetUrl);
    return;
  }

  const firstName = (name || 'there').split(' ')[0];

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a;">
      <div style="background:#4a7c59;padding:22px 30px;border-radius:12px 12px 0 0;">
        <div style="font-size:20px;font-weight:600;color:#fff;">Say HelloLeads</div>
      </div>
      <div style="background:#fafaf8;border:1px solid #e0ddd8;border-top:none;padding:28px 30px;border-radius:0 0 12px 12px;">
        <h2 style="font-size:20px;margin-bottom:12px;">Reset your password</h2>
        <p style="font-size:14px;color:#555;line-height:1.7;margin-bottom:24px;">
          Hi ${firstName}, we received a request to reset your password.
          Click the button below — this link expires in <strong>1 hour</strong>.
        </p>
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${resetUrl}" style="display:inline-block;background:#4a7c59;color:#fff;padding:13px 30px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            Reset my password →
          </a>
        </div>
        <p style="font-size:13px;color:#888;line-height:1.6;">
          If you didn't request this, you can safely ignore this email — your password won't change.
        </p>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e0ddd8;font-size:12px;color:#aaa;">
          Say HelloLeads · Real estate lead response
        </div>
      </div>
    </div>`;

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(key);
    await resend.emails.send({
      from: 'Say HelloLeads <noreply@sayhelloleads.com>',
      to: email,
      subject: 'Reset your Say HelloLeads password',
      html,
    });
  } catch (e) {
    console.error('Reset email error:', e);
  }
}
