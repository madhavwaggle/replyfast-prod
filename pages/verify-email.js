/**
 * pages/verify-email.js
 * Handles three states:
 *   ?success=1        → verified! show success + go to login
 *   ?error=expired    → link expired → show resend form
 *   ?error=invalid    → bad token
 *   (no params)       → "check your email" holding page with resend option
 */

import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

const SAGE   = '#3d6b4a';
const STYLES = {
  page:    { minHeight: '100vh', background: '#f0f0ec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans',sans-serif", padding: '1.5rem' },
  card:    { background: '#fff', border: '1px solid #e2e2dc', borderRadius: 16, padding: '2.5rem 2rem', maxWidth: 440, width: '100%', textAlign: 'center' },
  logo:    { fontSize: '1.4rem', fontWeight: 700, color: SAGE, marginBottom: '2rem', fontFamily: "'Instrument Serif',serif" },
  icon:    { fontSize: '3rem', marginBottom: '1rem' },
  h1:      { fontSize: '1.4rem', fontWeight: 700, color: '#111', marginBottom: '.5rem' },
  p:       { fontSize: '14px', color: '#666', lineHeight: 1.7, marginBottom: '1.5rem' },
  btn:     { display: 'block', width: '100%', background: SAGE, color: '#fff', border: 'none', borderRadius: 8, padding: '.8rem', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', textAlign: 'center' },
  btnGhost:{ display: 'block', width: '100%', background: 'transparent', color: SAGE, border: `1.5px solid ${SAGE}`, borderRadius: 8, padding: '.75rem', fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginTop: '.75rem' },
  input:   { width: '100%', padding: '.65rem .9rem', border: '1px solid #e0ddd8', borderRadius: 8, fontSize: '14px', fontFamily: 'inherit', outline: 'none', background: '#fafaf8', marginBottom: '1rem', boxSizing: 'border-box' },
  err:     { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '.65rem .9rem', fontSize: '13px', color: '#dc2626', marginBottom: '1rem', textAlign: 'left' },
  ok:      { background: '#f0faf4', border: '1px solid #bbddc9', borderRadius: 8, padding: '.65rem .9rem', fontSize: '13px', color: SAGE, marginBottom: '1rem' },
  divider: { borderTop: '1px solid #f0f0ec', margin: '1.5rem 0' },
  small:   { fontSize: '13px', color: '#aaa', marginTop: '1.25rem' },
};

export default function VerifyEmailPage() {
  const router  = useRouter();
  const { success, error } = router.query;

  const [email,     setEmail]     = useState('');
  const [resending, setResending] = useState(false);
  const [resent,    setResent]    = useState(false);
  const [resendErr, setResendErr] = useState('');

  async function handleResend(e) {
    e.preventDefault();
    if (!email) return;
    setResending(true); setResendErr('');
    try {
      await fetch('/api/auth/verify-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });
      setResent(true);
    } catch {
      setResendErr('Something went wrong. Please try again.');
    } finally {
      setResending(false);
    }
  }

  // ── SUCCESS ──────────────────────────────────────────────────────────────
  if (success === '1') {
    return (
      <Page>
        <div style={STYLES.icon}>✅</div>
        <h1 style={STYLES.h1}>Email verified!</h1>
        <p style={STYLES.p}>Your account is active. Sign in to access your dashboard and start capturing leads.</p>
        <Link href="/login" style={STYLES.btn}>Sign in to your account →</Link>
        <p style={STYLES.small}>
          New to Say HelloLeads? Your agent page is already live — check your welcome email for the link.
        </p>
      </Page>
    );
  }

  // ── EXPIRED ──────────────────────────────────────────────────────────────
  if (error === 'expired' || error === 'invalid') {
    return (
      <Page>
        <div style={STYLES.icon}>{error === 'expired' ? '⏰' : '🔗'}</div>
        <h1 style={STYLES.h1}>{error === 'expired' ? 'Link expired' : 'Invalid link'}</h1>
        <p style={STYLES.p}>
          {error === 'expired'
            ? 'Verification links expire after 24 hours. Enter your email below and we\'ll send a fresh one.'
            : 'This verification link isn\'t valid. It may have already been used. Enter your email to get a new one.'}
        </p>

        {resent ? (
          <div style={STYLES.ok}>✓ Verification email sent — check your inbox (and spam folder).</div>
        ) : (
          <form onSubmit={handleResend}>
            {resendErr && <div style={STYLES.err}>{resendErr}</div>}
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Your account email"
              style={STYLES.input}
            />
            <button type="submit" disabled={resending} style={STYLES.btn}>
              {resending ? 'Sending…' : 'Send new verification email →'}
            </button>
          </form>
        )}

        <div style={STYLES.divider} />
        <Link href="/login" style={{ ...STYLES.btnGhost, display: 'block', textDecoration: 'none', textAlign: 'center', padding: '.65rem' }}>
          Back to sign in
        </Link>
      </Page>
    );
  }

  // ── DEFAULT: "check your email" holding screen ────────────────────────────
  return (
    <Page>
      <div style={STYLES.icon}>📬</div>
      <h1 style={STYLES.h1}>Check your inbox</h1>
      <p style={STYLES.p}>
        We sent a verification link to your email address.
        Click the link to activate your account — it expires in <strong>24 hours</strong>.
      </p>

      <div style={{ background: '#f7f7f4', border: '1px solid #e2e2dc', borderRadius: 10, padding: '14px 16px', fontSize: '13px', color: '#666', lineHeight: 1.65, marginBottom: '1.5rem', textAlign: 'left' }}>
        <strong style={{ color: '#333' }}>Don't see it?</strong><br />
        Check your <strong>spam or junk folder</strong>. The email comes from{' '}
        <span style={{ fontFamily: 'monospace', background: '#efefec', padding: '1px 5px', borderRadius: 4 }}>onboarding@sayhelloleads.com</span>
      </div>

      {resent ? (
        <div style={STYLES.ok}>✓ New verification email sent!</div>
      ) : (
        <>
          <div style={STYLES.divider} />
          <p style={{ ...STYLES.p, marginBottom: '.75rem', fontSize: '13px' }}>Didn't get it? We can resend it.</p>
          <form onSubmit={handleResend}>
            {resendErr && <div style={STYLES.err}>{resendErr}</div>}
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Your account email"
              style={STYLES.input}
            />
            <button type="submit" disabled={resending} style={{ ...STYLES.btn, fontSize: '14px', padding: '.7rem' }}>
              {resending ? 'Sending…' : 'Resend verification email'}
            </button>
          </form>
        </>
      )}

      <p style={STYLES.small}>
        Wrong email? <Link href="/register" style={{ color: SAGE }}>Start over</Link>
      </p>
    </Page>
  );
}

function Page({ children }) {
  return (
    <>
      <Head>
        <title>Verify your email — Say HelloLeads</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet" />
      </Head>
      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; }
        input:focus { border-color: #3d6b4a !important; box-shadow: 0 0 0 3px rgba(61,107,74,.12); }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
      `}</style>
      <div style={STYLES.page}>
        <div style={{ ...STYLES.card, animation: 'fadeUp .4s ease' }}>
          <div style={STYLES.logo}>Say HelloLeads</div>
          {children}
        </div>
      </div>
    </>
  );
}
