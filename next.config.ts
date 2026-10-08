import type { NextConfig } from 'next';

/**
 * The signing flow is the one place a compromised or framed page does real damage
 * (ARCHITECTURE §2), so the app refuses to be framed and limits powerful features to
 * itself: WebAuthn for the code vault, the camera for scanning a delivery code.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Permissions-Policy',
    value: 'publickey-credentials-get=(self), publickey-credentials-create=(self), camera=(self), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Don't auto-generate AGENTS.md/CLAUDE.md into the repo root.
  agentRules: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
