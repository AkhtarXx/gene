# ARCHITECTURE — Modular In-App Services

Privacy-first, on-device LLM agent for iOS + Android (React Native + Expo).
No cloud in the inference path. Each domain is a self-contained **service module**
with a clean interface, so pieces are swappable and independently testable.

## Layers

```
UI (React Native screens)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Agent Orchestrator Service  (owns the infer→tool→loop)      │
│   - max_iterations, timeout, kill-switch                     │
│   - calls Security Gate before every side-effecting action   │
└───────────┬───────────────────────────┬──────────────────────┘
            │                            │
   ┌────────▼─────────┐        ┌─────────▼──────────────────┐
   │ LLM Engine Svc   │        │ Tool Registry (DENY-default)│
   │ (llama.rn GGUF)  │        │ each tool = native capability│
   └──────────────────┘        └─────────┬──────────────────┘
                                         │
            ┌────────────────────────────┼────────────────────────────┐
            │ Location  Calendar Contacts Files  Notif  Health BT  Launch│
            └────────────────────────────┴────────────────────────────┘
                                         │
   ┌────────────────────────────────────▼────────────────────────────┐
   │ Security Gate Service  (confirmation, taint, allowlist, audit)   │
   │ Memory / RAG Service   (SQLite + sqlite-vec, on-device embeddings)│
   └──────────────────────────────────────────────────────────────────┘
```

## Modules (src/services/)
| Module | File | Responsibility |
|---|---|---|
| LLM Engine | `llm/LLMEngineService.ts` | load/download GGUF (Q4_K_M), streaming completion, embeddings, model integrity (SHA-256) |
| Agent Orchestrator | `agent/AgentOrchestrator.ts` | run loop via Vercel AI SDK, stop conditions, tool dispatch |
| Tool Registry | `agent/ToolRegistry.ts` | deny-by-default registry, risk tiers |
| Tools | `tools/*.ts` | one file per device capability, each exports a typed tool |
| Security Gate | `security/SecurityGate.ts` | confirmation UI hook, taint tracker, audit log |
| Memory / RAG | `memory/MemoryService.ts` | SQLite + sqlite-vec store, embed + retrieve |

## Hard rules (from research, VERIFIED)
- Model weights downloaded at runtime, never bundled. Verify SHA-256 + signature.
- OS API is NEVER called directly by the model — only via registered tools behind a permission gate.
- Irreversible actions (send, delete, modify calendar, health write, launch app, BT connect) → confirmation + audit.
- Untrusted content (clipboard, contact note, file, notification) marked `tainted`; privileged sinks refuse tainted args.
- No AccessibilityService automation (Google Play rejects). Use App Intents (iOS) / scoped Intents + AppFunctions (Android).
- Target 1B (broad) / 3B (flagship) Q4_K_M GGUF.
