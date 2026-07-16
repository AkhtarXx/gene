# SOP — Critique-Agent Gate (MANDATORY)

Every module/service we implement MUST pass through the **critique-agent gate** before it is considered "done" and before we move to the next module.

## Rule
1. After implementing any module (service, tool, or core file), we DO NOT self-approve.
2. We spawn a **critique agent** (subagent, `general` type) with web access.
3. The critique agent must verify against the live web:
   - Is the library/API used **current / latest stable** (not deprecated, not a stale pattern)?
   - Is the code **production-grade** (error handling, resource cleanup, permission gating, memory safety, no hardcoded secrets)?
   - Are there **known issues / better patterns** in the current ecosystem (2026) for this exact use case?
   - Does it conform to the architecture + security rules in `ARCHITECTURE.md`?
4. The critique agent returns: ✅ PASS / ⚠️ FIX / ❌ REWRITE, with cited URLs and concrete fixes.
5. We apply the fixes, then re-run the gate if the agent flagged ⚠️/❌.
6. Only modules that PASS are committed to the build plan.

## What the critique agent must NOT do
- Invent libraries or APIs. If it cannot verify, it says UNVERIFIED.
- Approve on vibes. Every claim needs a source URL.

## Tracking
Each module gets a status in the todo list: `pending → implemented → critiqued(PASS/FIX) → done`.
