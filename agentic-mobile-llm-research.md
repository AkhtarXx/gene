# Agentic Mobile Local-LLM App — Comprehensive Research Report
*Compiled 2026-07-15. Every claim tagged VERIFIED (primary source / official doc / peer-reviewed / real repo) or SPECULATIVE. No fabrication.*

---

## 1. MARKET: jo apps "kaam" kartay hain (actions/tool-use) — REAL STATE

Zameen ki baat: ziyada tar local-LLM apps SIRF chat hain. Agentic (real device actions) part mostly open-source frameworks mein hai, ready apps mein nahi.

### Consumer apps jo local LLM chlatay hain + unka action status
| App | Local LLM | Agentic? | Real cross-app device actions? |
|---|---|---|---|
| **PocketPal AI** (iOS/Android) | ✅ llama.cpp GGUF | Tools/"Talents" (calculator, datetime, HTML) | ❌ in-app only |
| **MyLLM** (iOS) | ✅ llama.cpp+Metal | 80+ tools, MCP, mini-apps | ❌ in-app/mini-apps; no driving other apps |
| **Endemic** (iOS) | ✅ Gemma/Qwen | local web search/browser tools | ❌ in-app |
| **Local LLM** (iOS) | ✅ HF GGUF | chat only | ❌ |
| **Ethereal Engine** (Android) | ✅ llama.cpp | docs/OCR/camera | ❌ in-app |
| **Layla** (iOS/Android) | ✅ GGUF/LiteRT/PTE | on-device Python "Agents" (in-app scripting) | ❌ OS device-control NAHI |
| **OfflineLLM** | ✅ Metal 3 | RAG only | ❌ |
| **Off Grid** | ✅ llama.cpp | tool loop (web/calc/date/device-info free; calendar/email/MCP Pro) | ⚠️ partly remote |
| **MANTIS** (Android) | ⚠️ cloud-first, "Local" selectable | ✅ Accessibility-driven, multi-step (opens WhatsApp, types, sends) | ✅ lekin LLM usually CLOUD, sideloaded APK, NOT on Play |
| **PersonalAndroidAIAgent** (Android) | ✅ LiteRT-LM on-device | ✅ AppFunctions + MCP + HITL gate | ✅ lekin Android 16 (API 36) chahiye — tiny userbase, experimental |

**CONCLUSION (VERIFIED):** Koi bhi mainstream app aaj OFFLINE/local-LLM + broad autonomous cross-app actions combine NAHI karta. Do properties alag alag hain:
- Local-LLM apps = in-app rehtay hain
- Cross-app agent apps = cloud LLM use kartay hain ya store pe nahi hain

**Yeh gap real hai = tumhara differentiation.** (Lekin narrow ho raha hai — Apple Siri+App Intents, Android AppFunctions+Gemini aa rahe hain OS-level.)

---

## 2. FRAMEWORKS jo actual device actions enable kartay hain

| Framework | OS | Agentic/tool-use | Reality |
|---|---|---|---|
| **llama.rn** (MIT) | iOS+Android | ✅ tool calling via Jinja + GBNF grammar | Sabse mature RN binding, PocketPal isse bana hai |
| **react-native-gemma-agent** (MIT) | iOS+Android | ✅ native skills (GPS/calendar/health/FS/Bluetooth) + JS skills | Best agent-loop template, par young (5 stars) |
| **callstackincubator/ai** (MIT) | iOS+Android | ✅ Apple FM / llama.rn / MLC backends, tool calling | Most "framework-grade" RN option |
| **expo-local-llm** (MIT) | iOS+Android | ✅ iOS 26+ tools API | OS models only (no custom GGUF) |
| **nobodywho** (EUPL-1.2) | iOS+Android | ✅ function calling + RAG | Best Flutter, par COPYLEFT license |
| **quaynor** (MIT) / **llamadart** (MIT) | Flutter | ✅ function calling | Alternatives |
| **Apple Foundation Models** | iOS 26+ | ✅ `@Generable` Tool protocol, constrained decoding | 3B model, tool-use-tuned, privacy tier |
| **Gemini Nano / ML Kit** | Android | ⚠️ high-level APIs NO tool calling; on-device function calling SPECULATIVE | Cloud Gemini function-calling verified; on-device NOT in Google docs |
| **Google AI Edge Gallery** (Apache-2.0, 24k★) | iOS+Android | ✅ Agent Skills + native App Intents (send email/SMS) + Mobile Actions + MCP | BEST real reference for "agentic device actions" |
| **RunanywhereAI/android-use-agent** | Android | ✅ Accessibility-driven on-device agent (screen read → tap/swipe) | Closest to "real actions", par custom license — verify before commercial |

---

## 3. HARNESS ARCHITECTURE (agentic loop ka design)

### 3.1 Core loop (har backend pe same)
```
System prompt + tools catalog
  → LLM.generate(user_msg)        # model emits text YA tool_call
  → Runtime parses tool_call (name + JSON args)
  → Runtime executes NATIVE function, gets result
  → append result back to transcript
  → repeat until finish_reason="stop" OR max_iterations
```
**Guardrails (model pe nahi, runtime pe):** max iteration cap, timeout/kill-switch, tool allowlist, per-call policy gate.

### 3.2 How tools actually work per backend
- **llama.cpp / llama.rn:** `context.completion({tools, tool_choice})` → `{text, tool_calls}`. Output forced to match schema via **GBNF grammars** (JSON-schema→grammar). Makes malformed tool calls structurally impossible for supported schemas. Native handlers for Llama 3.1/3.2/3.3, Qwen2.5, Hermes, etc.
- **Apple Foundation Models:** `struct FindContactTool: Tool { let name; @Generable struct Arguments; func call(arguments) async throws -> String }`. Model emits args guaranteed valid (compile-time schema). Tool can be called multiple times / in parallel. Stateful per session.
- **Gemini Nano:** high-level ML Kit APIs (Prompt/Summarize/Proofread) have NO tool calling. On-device function calling = SPECULATIVE (vendor blog claim, Google docs silent).

### 3.3 Phone capabilities ko tool banana (pattern)
Same pattern for every capability: (a) declare OS permission, (b) gate native call behind permission check, (c) wrap as tool whose `description` tells model when to use, (d) return short string/JSON.

| Capability | iOS API | Android API | Notes |
|---|---|---|---|
| Location | CoreLocation `CLServiceSession` | FusedLocationProvider | graceful deny handling |
| Calendar | EventKit (write-only pref) | CalendarProvider/Intent | write-only = less privilege |
| Contacts | CNContactStore (limited access) | ContactsContract | scoped access better |
| Camera/Photos | AVFoundation / PHPhotoLibrary | CameraX / MediaStore | limited photo mode |
| Files | FileManager sandbox | scoped storage | app sandbox = free isolation |
| Clipboard | UIPasteboard | ClipboardManager | UNTRUSTED (injection vector) |
| Notifications | UNUserNotificationCenter | NotificationManager | good output channel |
| Launch apps | **App Intents** (type-safe) | **Explicit Intent + App Shortcuts** | prefer over URL schemes |
| Bluetooth | CoreBluetooth | BluetoothAdapter | gate heavily |
| Health | HealthKit (per-type) | Health Connect | DANGEROUS, confirmation-required |

**CRITICAL RULE:** Model OS API ko direct nahi chhootta — sirf tool name + args emit karta hai; TUMHARA code permission gate ke peeche OS call karta hai. Isi se safety + injection defense possible hai.

### 3.4 Memory & RAG (phone RAM limits ke wajah se mandatory)
- 4-bit 7B ≈ 4GB RAM (weights + KV). Comfortable sirf iPhone 15 Pro+ (8GB). Target = **1B–3B**.
- **Working-memory cliff (VERIFIED, important):** Llama-3.2-1B: 100% retrieval at 512 tok → 0% by 1536. Llama-3.2-3B: 100% at 1024 → 0% at 1280. "Long context replaces RAG" = FALSE at edge. RAG zaroori hai.
- Persistent memory: **SQLite + sqlite-vec** (vector search, on-device). Real numbers: Pixel 7a/iPhone SE3, 10K chunks → full pipeline 87–142ms p95, ~44MB RAM. MobiRAG = Android ref (ONNX all-MiniLM + FAISS PQ + Qwen 0.5B).

---

## 4. SECURITY / SANDBOX / PRIVACY (VERIFIED — severe)

### 4.1 Prompt Injection — REAL aur UNSOLVED mobile pe
- First systematic mobile-agent study: fraudulent ads >80% success; malware-install workflows "consistently completed." [arxiv 2510.27140]
- Stealthy UI injection: GPT-4o 82.5% plan / 75% exec; Gemini 2.0 95% / 82.5%. [arxiv 2510.07809]
- MIRAGE screenshot injection: 23–30% ASR across 5 VLM agents. [arxiv 2605.28116]
- **Local ≠ safe:** Brave 2026 test — on-device autocomplete manipulated by instructions in a LOCAL document. Root cause: trusted instructions + untrusted content share one context. [brave.com/blog/indirect-prompt-injection]
- **Lethal Trifecta (Simon Willison):** danger = (private data) + (untrusted content) + (side-effecting action). Break ANY one leg = safe.

### 4.2 Mitigations (VERIFIED best practice)
1. **Deny-by-default tool registry** — sirf zaroorat ke tools register karo.
2. **Risk tiers:** read/search = autonomous; irreversible (send SMS, delete, modify calendar, health write, launch app, BT connect) = **confirmation prompt + audit log**.
3. **Untrusted-content taint:** clipboard/contact-note/file/notification se aya output mark `untrusted`; privileged sinks refuse untrusted-derived args.
4. **Egress allowlist** for any network tool (exfiltration rokay).
5. **Max-iteration + token caps + kill switch.**
6. **Single chokepoint gate** (Apple `.onToolCall` callback fires before executor; throw → tool never runs).
7. **Lock-screen posture:** destructive/export actions lock-screen pe mat chalao.
8. **Regression eval** with poisoned context — assert destructive tools NOT called.

### 4.3 App Sandbox — agent asal mein kya kar sakta hai
- **iOS:** har app sandboxed, non-privileged, kernel-enforced. Doosri app ki files NAHI padh sakta, system settings NAHI badal sakta. Cross-app = entitlements/URL schemes/Share sheet/App Intents. SMS bhejna heavily restricted (entitlement + rate-limit). iOS agent silently cross-app act NAHI kar sakta.
- **Android:** sandbox + ek hi escape hatch = **AccessibilityService** (`performAction`, `dispatchGesture`) — isi se agent "phone chalata hai." Lekin `FLAG_SECURE` respect karni paregi (banking apps NAHI).

### 4.4 Supply-chain (model download integrity)
- Runtime GGUF download = supply-chain risk (tampered model = arbitrary code in sandbox).
- VERIFIED practice: pin `expectedSha256` + public-key signature; verify on download; refuse on mismatch. OpenSSF Model Signing / Sigstore available.
- **Private API risk:** `ane-infer` (direct ANE) uses reverse-engineered PRIVATE APIs → **App Store rule 2.5.1 blocks it, can't ship.** Use CoreML/MLX/Core AI only.

### 4.5 Platform Policy (VERIFIED — autonomous agents ke liye hostile)
- **Apple 2.5.1:** public APIs only; code download/exec after review blocked → vibe-coding/code-exec agents blocked. Expected tier allows **constrained agents exposing discrete App Intents reviewers can inspect**.
- **Apple 5.1.2(i):** personal data third-party AI ko share karne se pehle explicit permission.
- **Google Play AccessibilityService policy:** "autonomously initiate/plan/execute actions" STRICTLY PROHIBITED unless `isAccessibilityTool=true` (disability only). Automation assistants = explicitly NOT accessibility tools. → **Full accessibility-driven agent Play pe REJECT hoga.** Distribution = sideload / F-Droid / Android **AppFunctions** sanctioned path.

---

## 5. MARKET GAP — evidence-based conclusion (VERIFIED)
- **Gap real hai:** koi store-approved consumer app aaj **on-device LLM + cross-app real actions + privacy** combine NAHI karta.
- Desktop (OpenClaw/LM Studio/Ollama) is materially ahead: 24–48GB VRAM, 64k+ context, shell/FS/browser/messaging tools. Mobile cross nahi aya because: (1) RAM limits, (2) OS sandbox, (3) NPU private-API lock, (4) small-model tool-call hallucination, (5) short context windows.
- **Your edge:** local inference + local actions + privacy (no cloud, no telemetry). MANTIS proves demand for agentic half; PocketPal/MyLLM prove demand for local-LLM half. Merge + store approval = opening.

---

## 6. WHAT TO CLONE (recommendations)

**Cross-platform RN, real agent loop aaj:**
1. `callstackincubator/ai` (framework) + study `react-native-gemma-agent` for skill/agent-loop.
2. `software-mansion/react-native-executorch` — cleanest tool-calling hook (`useLLM` + `executeToolCallback`).
3. `a-ghorbani/pocketpal-ai` — UI/tool-dispatch (`AgentRunner`/Talents) reference.

**Flutter:** `nobodywho-ooo/nobodywho` + `flutter-starter-example` (⚠️ EUPL-1.2 copyleft). MIT chahiye to `leehack/llamadart`.

**Native iOS:** `ml-explore/mlx-swift-examples` (LLMEval/MLXChatExample) + `tattn/LocalLLMClient`.

**Native Android/NPU:** `pytorch/executorch` LlamaDemo (Qualcomm/MediaTek) ya `mlc-ai/mlc-llm` MLCChat.

**True "agentic device actions" reference:** `google-ai-edge/gallery` (native intents + Agent Skills + MCP) aur `RunanywhereAI/android-use-agent` (Accessibility agent) — ⚠️ Runanywhere custom license verify karo.

---

## 7. BUILD GUIDANCE (verified)
- **Min OS:** iOS llama.rn/MLX need iOS 11–16 floor; Apple Foundation Models = iOS 26 + Apple Intelligence. Android llama.rn needs `largeHeap=true`. Gemini Nano = Pixel 8+/Galaxy S25+.
- **Bundle vs download:** NEVER embed multi-GB GGUF in IPA/APK. Download at runtime (HF → app Documents). MLC exception: `bundle_weight:true` for small models. Apple FM / expo-local-llm = no weights.
- **Model sizes (Q4):** 0.5B ≈ 300–500MB, 1B ≈ 700MB–1.1GB, 3B ≈ 1.8–2.4GB, 8B ≈ 4–5GB.
- **Typical:** binary few MB + native libs; model runtime download with progress UI.

---

## 8. AUTHENTICITY FLAGS (could NOT fully verify)
- react-native-gemma-agent ka "Gemma 4 E2B" model name = vendor claim; proven on-device model = **Gemma 3n**. Confirm exact GGUF on HF.
- On-device Gemini Nano function calling = SPECULATIVE (blog claims, Google docs silent).
- react-native-executorch + RunanywhereAI license = `NOASSERTION` custom — read LICENSE before commercial.
- No repo invented — sab real GitHub/pub.dev pages hain.
- Security numbers (75–95% injection success) = peer-reviewed papers, not marketing.

---

## BOTTOM LINE FOR YOUR APP
1. **Stack:** React Native + `llama.rn` (or `callstackincubator/ai`) + `react-native-gemma-agent` as agent-loop reference.
2. **Target:** 1B (broad) / 3B (flagship) Q4_K_M GGUF, download at runtime.
3. **Actions:** App Intents (iOS) / AppFunctions + careful Intent use (Android). Avoid full Accessibility automation (Play reject karega).
4. **Safety = product differentiator:** deny-by-default tools, confirmation gate on irreversible actions, taint tracking, SHA-256 model verification, poisoned-context regression tests.
5. **Gap real hai** — local-LLM + real-actions + privacy combo koi store-approved nahi deta. Yahan tum jeet sakte ho.
