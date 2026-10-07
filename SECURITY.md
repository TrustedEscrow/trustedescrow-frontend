# Security Policy

The TrustedEscrow web frontend is a client-side convenience layer for interacting with Soroban escrow contracts on the Stellar network. It holds no authority over funds and never holds private keys or secret seeds.

## Reporting a Vulnerability

If you discover a security vulnerability within this repository or application, please report it privately.

- **GitHub Private Vulnerability Reporting:** Go to the repository's **Security** tab → **Report a vulnerability**.
- **Public Issues:** Do NOT open a public issue or pull request for security vulnerabilities that could compromise user privacy or application integrity.

When reporting a vulnerability, please include:
1. Description of the issue and potential impact.
2. Step-by-step reproduction steps or proof-of-concept code.
3. Affected components or routes.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Main    | :white_check_mark: |

## Security Scope & Principles

1. **Client-Side Key Management:** Private keys and secret seeds are never stored, transmitted, or accessible by the web app. All transaction signing is delegated to user-controlled wallet extensions (e.g. Freighter).
2. **WASM & Factory Pinning:** The app verifies factory provenance and checks WASM code hashes before requesting escrow funding to prevent interaction with unaudited or malicious contracts.
3. **Canonical Data Verification:** Release codes and proof hashes are generated and validated client-side following canonical format standards before transaction submission.

