/**
 * lib/auth.js
 * NextAuth — credentials login against Redis user accounts.
 */

import CredentialsProvider from 'next-auth/providers/credentials';
import { getUserByEmail, verifyPassword } from './users';

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await getUserByEmail(credentials.email);
        if (!user) return null;

        const valid = await verifyPassword(user, credentials.password);
        if (!valid) return null;

        return {
          id:         user.id,
          email:      user.email,
          name:       user.name,
          agencyName: user.agencyName || '',
        };
      },
    }),
  ],

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id         = user.id;
        token.agencyName = user.agencyName;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id         = token.id;
        session.user.agencyName = token.agencyName;
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * lib/auth.js
 * NextAuth configuration — supports:
 * 1. Credentials (email + password) — simplest for solo agents
 * 2. Email magic link — passwordless, great for teams
 */

/**import CredentialsProvider from 'next-auth/providers/credentials';
import EmailProvider from 'next-auth/providers/email';
import bcrypt from 'bcryptjs';

export const authOptions = {
  providers: [
    // ── Option 1: Email + Password ──────────────────────────────────────────
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminHash = process.env.ADMIN_PASSWORD_HASH;

        if (!adminEmail || !adminHash) {
          // Dev fallback: allow any login when env not set
          if (process.env.NODE_ENV === 'development') {
            return { id: '1', email: credentials.email, name: 'Agent' };
          }
          return null;
        }

        if (credentials.email !== adminEmail) return null;

        const valid = await bcrypt.compare(credentials.password, adminHash);
        if (!valid) return null;

        return {
          id: '1',
          email: adminEmail,
          name: process.env.AGENT_NAME || 'Agent',
        };
      },
    }),

    // ── Option 2: Magic Link Email (requires nodemailer env vars) ───────────
    ...(process.env.EMAIL_SERVER_HOST ? [
      EmailProvider({
        server: {
          host: process.env.EMAIL_SERVER_HOST,
          port: Number(process.env.EMAIL_SERVER_PORT || 587),
          auth: {
            user: process.env.EMAIL_SERVER_USER,
            pass: process.env.EMAIL_SERVER_PASSWORD,
          },
        },
        from: process.env.EMAIL_FROM || 'ReplyFast <noreply@replyfast.com>',
        // Only allow the admin email to sign in via magic link
        async sendVerificationRequest({ identifier, url, provider }) {
          if (identifier !== process.env.ADMIN_EMAIL) {
            throw new Error('Unauthorized email');
          }
          // Use default NextAuth email sending
          const { createTransport } = await import('nodemailer');
          const transport = createTransport(provider.server);
          await transport.sendMail({
            to: identifier,
            from: provider.from,
            subject: 'Sign in to ReplyFast',
            text: `Sign in to ReplyFast: ${url}\n\nThis link expires in 24 hours.`,
            html: `
              <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:2rem;">
                <h2 style="font-size:1.5rem;margin-bottom:1rem;">Sign in to ReplyFast</h2>
                <p style="color:#666;margin-bottom:1.5rem;">Click the button below to sign in. This link expires in 24 hours.</p>
                <a href="${url}" style="display:inline-block;background:#4a6741;color:#fff;padding:.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:600;">Sign in →</a>
              </div>
            `,
          });
        },
      }),
    ] : []),
  ],

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token) session.user.id = token.id;
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};**/
