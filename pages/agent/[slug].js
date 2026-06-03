/**
 * pages/agent/[slug].js
 *
 * Buyer-facing page for each agent.
 * Flow:
 *   1. Short "say hi" form — name, email, property (just enough to start)
 *   2. After submit → live chat UI that looks like texting the agent
 *   3. AI qualifies the lead naturally through conversation
 *   4. Lead is saved + scored + agent notified after 2-3 exchanges
 *
 * The buyer never sees anything about AI. It looks like they're texting the agent directly.
 */

import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

export default function AgentPage({ agent, notFound }) {
  const [step, setStep]         = useState('form');   // 'form' | 'chat'
  const [form, setForm]         = useState({ fname: '', lname: '', email: '', phone: '', property: '', source: 'Agent Page' });
  const [leadId, setLeadId]     = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');
  const bottomRef               = useRef(null);
  const inputRef                = useRef(null);

  const agentName   = agent?.name || 'Your Agent';
  const agentFirst  = agentName.split(' ')[0];
  const agentAgency = agent?.agencyName || '';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Step 1: submit the short form ──────────────────────────────────────────
  async function startChat() {
    if (!form.fname || !form.email) { setError('Please enter your name and email.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/agent/${agent.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, message: `Hi ${agentFirst}, I'm interested in ${form.property || 'a property'}.` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');

      setLeadId(data.id);
      // Show the AI's first reply as the opening chat message
      const firstReply = data.firstReply || `Hi ${form.fname}! Thanks for reaching out. Tell me a bit more about what you're looking for — are you looking to move soon, or still in the early stages?`;
      setMessages([{ role: 'agent', text: firstReply }]);
      setStep('chat');
      setTimeout(() => inputRef.current?.focus(), 300);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step 2: send follow-up messages ────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    setMessages(m => [...m, { role: 'buyer', text }]);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, agentSlug: agent.slug, message: text }),
      });
      const data = await res.json();
      if (data.reply) {
        // Small typing delay for realism
        await new Promise(r => setTimeout(r, 800));
        setMessages(m => [...m, { role: 'agent', text: data.reply }]);
      }
    } catch (e) {
      setMessages(m => [...m, { role: 'agent', text: "Sorry, I missed that — could you send that again?" }]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif' }}>
      <Head><title>Page not found — Say HelloLeads</title></Head>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏠</div>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '.5rem' }}>Page not found</h1>
        <p style={{ color: '#666' }}>This agent link doesn't exist or may have changed.</p>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>{agentName}{agentAgency ? ` — ${agentAgency}` : ''}</title>
        <meta name="description" content={`Message ${agentName} directly about any property.`} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet" />
      </Head>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --sage: #4a7c59; --sage-light: #eef4f0; --sage-mid: #a8c5b5;
          --black: #111; --white: #fff; --muted: #6b7280;
          --border: #e5e7eb; --bg: #f0f2f5;
        }
        html, body { height: 100%; }
        body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--black); }
        input, textarea {
          width: 100%; padding: .65rem .9rem; border: 1.5px solid var(--border);
          border-radius: 10px; font-family: inherit; font-size: 14px;
          background: #fff; color: var(--black); outline: none; transition: border-color .15s;
        }
        input:focus, textarea:focus { border-color: var(--sage); }
        label { display: block; font-size: 13px; font-weight: 500; margin-bottom: .35rem; }
        .field { margin-bottom: .9rem; }
        .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
        @media (max-width: 480px) { .field-row { grid-template-columns: 1fr; } }

        /* Chat bubbles */
        .bubble-agent {
          background: #fff; border-radius: 18px 18px 18px 4px;
          padding: .65rem 1rem; max-width: 78%; font-size: 14px; line-height: 1.5;
          box-shadow: 0 1px 2px rgba(0,0,0,.08);
        }
        .bubble-buyer {
          background: var(--sage); color: #fff;
          border-radius: 18px 18px 4px 18px;
          padding: .65rem 1rem; max-width: 78%; font-size: 14px; line-height: 1.5;
          margin-left: auto;
        }
        .typing-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); display: inline-block; animation: blink 1.2s infinite; }
        .typing-dot:nth-child(2) { animation-delay: .2s; }
        .typing-dot:nth-child(3) { animation-delay: .4s; }
        @keyframes blink { 0%,80%,100% { opacity: .3; } 40% { opacity: 1; } }
      `}</style>

      {/* ── FORM STEP ──────────────────────────────────────────────────────── */}
      {step === 'form' && (
        <>
          {/* Header bar — no mention of AI */}
          <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '15px', fontWeight: '600' }}>{agentName}</span>
            {agentAgency && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{agentAgency}</span>}
          </div>

          <main style={{ maxWidth: '520px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: 'var(--sage)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: '600', margin: '0 auto .85rem', fontFamily: "'Instrument Serif', serif" }}>
                {agentName.charAt(0).toUpperCase()}
              </div>
              <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: '1.6rem', marginBottom: '.2rem' }}>{agentName}</h1>
              {agentAgency && <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '.5rem' }}>{agentAgency}</p>}
              <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: '1.6' }}>
                Say hi — I'll reply right away.
              </p>
            </div>

            <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: '16px', padding: '1.75rem' }}>
              <div className="field-row">
                <div className="field">
                  <label>First name *</label>
                  <input value={form.fname} onChange={e => setForm(f => ({...f, fname: e.target.value}))} placeholder="Maria" onKeyDown={e => e.key === 'Enter' && startChat()} />
                </div>
                <div className="field">
                  <label>Last name</label>
                  <input value={form.lname} onChange={e => setForm(f => ({...f, lname: e.target.value}))} placeholder="Chen" />
                </div>
              </div>
              <div className="field">
                <label>Email *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="maria@email.com" />
              </div>
              <div className="field">
                <label>Phone <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
                <input type="tel" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="(513) 555-0192" />
              </div>
              <div className="field">
                <label>Property you're interested in</label>
                <input value={form.property} onChange={e => setForm(f => ({...f, property: e.target.value}))} placeholder="e.g. 412 Elm St, 3BR in Hyde Park, or just the area" />
              </div>

              {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '.65rem .9rem', fontSize: '13px', color: '#b91c1c', marginBottom: '.85rem' }}>{error}</div>}

              <button
                onClick={startChat}
                disabled={submitting}
                style={{ width: '100%', background: submitting ? 'var(--sage-mid)' : 'var(--sage)', color: '#fff', border: 'none', borderRadius: '10px', padding: '.8rem', fontSize: '15px', fontWeight: '500', cursor: submitting ? 'not-allowed' : 'pointer', transition: 'background .15s' }}
              >
                {submitting ? 'Connecting…' : `Message ${agentFirst} →`}
              </button>
              <p style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center', marginTop: '.65rem' }}>
                Your info is only shared with {agentName}. No spam, ever.
              </p>
            </div>

            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <a href="/" style={{ fontSize: '11px', color: 'var(--muted)', textDecoration: 'none' }}>Powered by <strong>Say HelloLeads</strong></a>
            </div>
          </main>
        </>
      )}

      {/* ── CHAT STEP ──────────────────────────────────────────────────────── */}
      {step === 'chat' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', maxWidth: '560px', margin: '0 auto' }}>
          {/* Chat header — looks like iMessage/SMS with the agent */}
          <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '.85rem 1.25rem', display: 'flex', alignItems: 'center', gap: '.75rem', flexShrink: 0 }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--sage)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '600', fontFamily: "'Instrument Serif', serif", flexShrink: 0 }}>
              {agentName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: '600', fontSize: '15px' }}>{agentName}</div>
              {agentAgency && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{agentAgency}</div>}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></div>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Online</span>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'buyer' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '.5rem' }}>
                {m.role === 'agent' && (
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--sage)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600', flexShrink: 0, marginBottom: '2px' }}>
                    {agentName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className={m.role === 'agent' ? 'bubble-agent' : 'bubble-buyer'}>{m.text}</div>
              </div>
            ))}
            {sending && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '.5rem' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--sage)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600', flexShrink: 0 }}>
                  {agentName.charAt(0).toUpperCase()}
                </div>
                <div className="bubble-agent" style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '.7rem .9rem' }}>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div style={{ background: '#fff', borderTop: '1px solid var(--border)', padding: '.75rem 1rem', display: 'flex', gap: '.65rem', alignItems: 'flex-end', flexShrink: 0 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Message ${agentFirst}…`}
              rows={1}
              style={{ flex: 1, borderRadius: '20px', padding: '.6rem 1rem', resize: 'none', fontSize: '14px', lineHeight: '1.5', minHeight: '40px', maxHeight: '120px', overflow: 'hidden' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              style={{ width: '40px', height: '40px', borderRadius: '50%', background: (!input.trim() || sending) ? 'var(--border)' : 'var(--sage)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (!input.trim() || sending) ? 'not-allowed' : 'pointer', flexShrink: 0, transition: 'background .15s' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export async function getServerSideProps({ params }) {
  const { slug } = params;
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/agent/${slug}`);
    if (!res.ok) return { props: { notFound: true, agent: null } };
    const agent = await res.json();
    return { props: { agent, notFound: false } };
  } catch {
    return { props: { notFound: true, agent: null } };
  }
}
