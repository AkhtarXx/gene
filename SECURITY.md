# Security Policy

Gene Personal Assistant's entire value proposition is privacy and safety, so security reports are treated with
maximum priority.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

Only the latest release receives security fixes. Development builds (`development` channel) are
not supported.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately via GitHub Security Advisories:

1. Go to **Security → Report a vulnerability** at
   `https://github.com/AkhtarXx/gene/security/advisories/new`
2. Include: affected version, steps to reproduce, impact, and (if possible) a proposed fix.

You will receive a response within 7 days. The maintainers will coordinate a fix and disclose
responsibly. Public credit is given with your permission.

## Security model at a glance

- The model never calls an OS API directly — only registered tools behind the Security Gate.
- Side-effecting tools require human confirmation with the exact parameters shown.
- Untrusted content (tool results, retrieved memories, files) is tainted; ordinary write tools refuse
  tainted contexts. Personal APK device tools retain taint and require a separate native Allow-once
  review for each change against an enabled timed session, selected app and unchanged screen.
- Personal Android control is opt-in, expires after 10 minutes, stops through a visible floating
  button, blocks locked/password screens and does not collect accessibility event text in the background.
- Model weights are downloaded at runtime and verified against pinned SHA-256 hashes,
  cross-checked with HuggingFace `lfs.oid`; mismatches delete the file.
- Every allowed/denied tool action is written to the on-device audit log.
- Release builds refuse debug signing keys (Gradle guard).

If you believe you have found a bypass of any of these properties (prompt injection → tool
execution without confirmation, hash verification bypass, sandbox escape, data exfiltration),
please report it as above.
