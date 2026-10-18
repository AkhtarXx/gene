# ARCHITECTURE — Modular In-App Services

Privacy-first, on-device LLM agent for iOS + Android (React Native + Expo).
No cloud in the inference path. Each domain is a self-contained **service module**
with a clean interface, so pieces are swappable and independently testable.

## Layers

```
UI (React Native screens, expo-router)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Agent Orchestrator Service  (owns the infer→tool→loop)      │
│   - max_iterations, timeout, kill-switch                     │
│   - per-chat system prompt, tool allowlist, memory toggle    │
│   - calls Security Gate before every side-effecting action   │
└───────────┬───────────────────────────┬──────────────────────┘
            │                            │
   ┌────────▼─────────┐        ┌─────────▼──────────────────┐
   │ LLM Engine Svc   │        │ Tool Registry (DENY-default)│
   │ (llama.rn GGUF)  │        │ each tool = native capability│
   └──────────────────┘        └─────────┬──────────────────┘
                                         │
            ┌────────────────────────────┼────────────────────────────┐
            │ Time Location Calendar Contacts Files Notif Health BT Launch│
            └────────────────────────────┴────────────────────────────┘
                                         │
   ┌─────────────────────────────────────▼─────────────────────────────┐
   │ Security Gate Service  (confirmation, taint, allowlist, audit)     │
   │ Memory / RAG Service   (SQLite + sqlite-vec, on-device embeddings) │
   │ Speech Service         (whisper.cpp, on-device transcription)      │
   │ App Store              (conversations, messages, settings, audit)  │
   └────────────────────────────────────────────────────────────────────┘
```

## Modules (src/services/)

| Module                 | File                                                                           | Responsibility                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM Engine             | `llm/LLMEngineService.ts`                                                      | load/download GGUF (Q4_K_M), streaming completion, tool-call parsing, GPU/NPU offload with CPU fallback, model integrity (SHA-256)                                      |
| Model Downloader       | `llm/modelDownloader.ts`                                                       | runtime download + pinned SHA-256 + HF `lfs.oid` cross-check (fresh downloads only; cache hits verify offline)                                                          |
| Agent Orchestrator     | `agent/AgentOrchestrator.ts`                                                   | run loop, stop conditions, tool dispatch, per-chat allowlist/system prompt/memory, history load/rewind, stats                                                           |
| Manual Actions         | `agent/UserActionService.ts`                                                   | user-filled phone shortcuts, shared confirmation/audit, cancellation and native-drain lock shared with the orchestrator                                                 |
| Personal phone control | `phone/PhoneControl.ts`, `tools/DeviceControlTool.ts`, `native/phone-control/` | native AccessibilityService, scoped timed sessions, bounded screen snapshots, semantic actions with native review and STOP; Expo prebuild plugin preserves registration |
| Tool Registry          | `agent/ToolRegistry.ts`                                                        | deny-by-default registry, risk tiers                                                                                                                                    |
| Tools                  | `tools/*.ts`                                                                   | one file per device capability, each exports a typed tool (incl. deterministic time tool)                                                                               |
| Security Gate          | `security/SecurityGate.ts`                                                     | single chokepoint: type validation, taint refusal, confirmation UI hook, audit log (persisted)                                                                          |
| Memory / RAG           | `memory/MemoryService.ts`                                                      | SQLite + sqlite-vec store, embed + retrieve, document listing/deletion                                                                                                  |
| Speech                 | `speech/WhisperService.ts`                                                     | whisper.cpp STT (tiny.en), same pinned-hash download path                                                                                                               |
| App Store              | `storage/AppStore.ts`                                                          | WAL SQLite: conversations, messages, settings, audit; export/wipe                                                                                                       |

## Screens (app/)

| Route        | Purpose                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index`      | conversation list (rename, delete, new chat, settings entry)                                                                                      |
| `onboarding` | first-run: privacy story → safety model → model guidance                                                                                          |
| `chat/[id]`  | chat: markdown, streaming, tok/s, copy, regenerate, tool-result expansion, per-chat settings (system prompt, tool allowlist, memory), voice input |
| `models`     | download/load/delete chat + embedding + whisper models, storage                                                                                   |
| `settings`   | theme (dark/light/system), inference defaults, storage, privacy, export/wipe                                                                      |
| `actions`    | model-free Android phone shortcuts: settings, dialer, SMS drafts, clock, maps, existing app launch, reminders; shared confirmation and audit      |
| `control`    | personal APK accessibility disclosure/setup, selected apps, 10-minute consent, dedicated restricted assistant chat, Stop                          |
| `memory`     | saved-memory viewer (list, delete, clear)                                                                                                         |
| `audit`      | persistent activity log of every allowed/denied tool action                                                                                       |

## Hard rules (from research, VERIFIED)

- Model weights downloaded at runtime, never bundled. Verify SHA-256 + HF `lfs.oid` cross-check.
- OS API is NEVER called directly by the model — only via registered tools behind a permission gate.
- Irreversible actions (send, delete, modify calendar, health write, launch app, BT connect) → confirmation + persisted audit.
- Untrusted content (clipboard, contact note, file, notification, tool result, retrieved memory) marked `tainted`; ordinary privileged sinks refuse tainted args. Personal phone control uses a separate, individually reviewed native action path; it never clears taint or grants other tools access.
- Narrow provenance exception: outbound-only phone tools may declare `fixed-phone-receipt`. Only an exact literal from `agent/actionReceipts.ts` is trusted; adapters discard all returned activity data/extras and never echo external text. This permits consecutive, individually confirmed phone handoffs. Existing taint is never cleared. Unexpected output/errors taint the conversation; read tools always taint before the native call.
- Tool allowlist is enforced at dispatch, not just in the catalog the model sees.
- User-selected distribution: personal Android APK, not Play Store autonomous automation. An opt-in AccessibilityService may read selected apps during a foreground-approved 10-minute session. Every tap, text replacement, scroll, Back and app launch requires native review (including every Send); package and bounded screen fingerprint must match again at execution. A floating STOP ends the session. Password screens, lockscreen, Gene Personal Assistant itself and permission/installer UI are excluded. No background event-text collection, coordinate gestures, or automatic permission grants. Android protected/custom UI can remain unsupported. iOS retains scoped actions only.
- Target 1B (broad) / 3B (flagship) Q4_K_M GGUF; whisper tiny.en for voice.
- All persistence is local (WAL SQLite); export and delete-everything are first-class settings.
