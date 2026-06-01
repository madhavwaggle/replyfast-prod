/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow Twilio and other server-only packages
  serverExternalPackages: ['twilio', 'nodemailer', 'postmark'],
}

module.exports = nextConfig
