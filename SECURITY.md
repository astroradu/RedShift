# Security Policy

## Reporting a Vulnerability

If you believe you have found a security vulnerability in RedShift, please **do not open a public GitHub issue**. Disclose it privately so it can be assessed and patched before public disclosure.

Open a **GitHub Security Advisory** via the [Security tab](https://github.com/astroradu/RedShift/security/advisories/new) of this repository. This keeps the report private until a fix is released.

Include as much detail as you can: what you found, how to reproduce it, and what impact you think it has. You can expect an acknowledgement within a few days and a status update as the issue is investigated.

## Scope

RedShift is a local desktop application. It binds a backend server to `127.0.0.1` (loopback only) and communicates over a bearer-token-authenticated connection that is regenerated on every launch. No data is sent to external servers.

Relevant areas for security reports include:

- Local privilege escalation or sandbox escape via the app bundle
- Token or credential exposure (e.g. the bearer token becoming readable by other local processes)
- Path traversal or arbitrary file access via the backend
- Vulnerabilities in bundled dependencies with a practical local exploit

Out of scope: theoretical issues with no practical exploit path, issues requiring physical access to an already-compromised machine.

## Supported Versions

Only the latest release is actively maintained.

| Version | Supported |
|---------|-----------|
| 1.0.1   | ✅        |
