# Decision Report: Stack for an Agentic, Privacy-First, On-Device-LLM Mobile App

**Scope:** iOS + Android, small LLM runs locally, agent takes REAL device actions (GPS, calendar, contacts, files, camera, launch apps, notifications, health, Bluetooth).
**Date:** 2026-07-15
**Method:** Web research (websearch + webfetch) of primary sources (Apple/Android dev docs, WWDC26, GitHub repos, framework licenses) and secondary analysis. Every claim is tagged **[VERIFIED]** (traceable to a primary/official source or first-party repo) or **[SPECULATIVE]** (inference, secondary reporting, or not yet generally available).

> **Honest caveat up front:** "local LLM + real device actions + privacy" is currently a frontier combination. No single framework hands you all three ready-made. The differentiator is real, but the cost is integration glue and store-policy navigation. The safest path is a hybrid, not a pure one.

---

## 1. Comparison Matrix (dimensions that matter HERE)

Legend: 🟢 strong / ready · 🟡 workable / caveats · 🔴 weak / avoid · ⚪ not applicable

| Dimension | React Native (New Arch + Nitro) | Flutter (FFI + Nitro) | NATIVE (Swift + Kotlin) |
|---|---|---|---|
| **(a) On-device LLM engine access** | 🟢 llama.cpp via `llama.rn`/InferrLM; MLX via `react-native-nitro-mlx`; Apple Foundation Models via `react-native-ai` **[VERIFIED: InferrLM, LocalOS, llama.rn npm, react-native-nitro-mlx]** | 🟢 llama.cpp via `llamafu`, `flutter_llama`, `lib_llama_cpp`, `llama_cpp_dart` (FFI). No first-class MLX/Foundation Models on iOS **[VERIFIED: llamafu/flutter_llama pub.dev, llama_cpp_dart]** | 🟢 Best of all: `mlx-swift-examples`+`LocalLLMClient` (iOS), `LocalLLMClient` FoundationModels, ExecuTorch LlamaDemo + MLC MLCChat (Android) **[VERIFIED: github tattn/LocalLLMClient, meta-pytorch/executorch-examples]** |
| **(b) Agentic device-action tooling** | 🟢 Mature community modules: `react-native-device-calendar`, `@omarsdev/react-native-contacts`, `react-native-healthkit`+`react-native-health-connect`, `expo-location`, `expo-camera`, `react-native-notify-kit`/Expo Notifications **[VERIFIED: npm/github]**. Risk: community-maintenance churn (e.g., Notifee archived) **[VERIFIED]** | 🟡 Device-action ecosystem thinner than RN; calendar/contacts/health plugins exist but with more manual native patching and lower maturity. LLM side is solid, action side is rougher **[SPECULATIVE: not deeply verified; weaker than RN in practice]** | 🟢 First-class: App Intents (iOS), AppFunctions (Android), HealthKit, CoreLocation, etc. You write the channels yourself but they are official and inspectable **[VERIFIED]** |
| **(c) Deep OS integration** | 🟡 Bridge to App Intents / AppFunctions possible but you build the native shim. Foundation Models Tool protocol only via RN wrapper **[VERIFIED wrapper exists; depth SPECULATIVE]** | 🟡 Same as RN; method-channel/FFI shim to platform APIs. Weaker story for App Intents/AppFunctions **[SPECULATIVE]** | 🟢 App Intents (iOS 16+; expanded WWDC26: long-running, execution targets, schemas) + Foundation Models `Tool` protocol (iOS 26+) **[VERIFIED]**; Android AppFunctions (experimental, Android 16+) **[VERIFIED]** |
| **(d) Performance / memory on phone** | 🟢 Near-native via Nitro/TurboModules (JSI, ~15–59× faster than legacy bridge) **[VERIFIED: mrousavy/NitroBenchmarks]**. Inference runs in bundled C++ (llama.cpp), so RN overhead is irrelevant to tok/s **[VERIFIED]** | 🟢 Flutter AOT + FFI reaches ~0ms call overhead via Nitro-for-Flutter **[VERIFIED: nitro pub.dev]**. Inference again is native C++, Dart overhead negligible **[VERIFIED]** | 🟢 Zero bridge overhead by definition. Best for tight memory/thermal loops **[VERIFIED reasoning]** |
| **(e) Developer velocity / one codebase** | 🟢 One TS codebase; huge device-module catalog; Expo for fast iteration **[VERIFIED]** | 🟢 One Dart codebase; cohesive UI framework, predictable 120Hz **[VERIFIED: ASOasis perf compare]** | 🔴 Two codebases (Swift + Kotlin), ~2–3× surface area for parity **[SPECULATIVE cost estimate, widely observed]** |
| **(f) Store-approval risk** | 🟢 GGUF weights download allowed (Apple DTS) **[VERIFIED]**; App Intents path available; Accessibility ban avoided by using real APIs not a11y **[VERIFIED policy]** | 🟢 Same as RN (download policy identical) **[VERIFIED]** | 🟢 Cleanest: discrete App Intents reviewers inspect; Foundation Models Tool protocol is Apple-blessed **[VERIFIED]**; AppFunctions is Google's blessed path **[VERIFIED]** |
| **(g) Licensing for commercial closed-source** | 🟢 llama.cpp (MIT), MLX (MIT), wrapper libs MIT — all fine with attribution **[VERIFIED: github licenses, Cactus]** | 🟢 llama.cpp (MIT), Flutter (BSD), same permissive stack **[VERIFIED]** | 🟢 mlx-swift (MIT), ExecuTorch (BSD-3), MLC (Apache-2), LiteRT-LM (Apache-2) **[VERIFIED: Cactus, edgeaistack]** |
| **(h) Maintenance burden** | 🟡 One codebase, but you babysit 3rd-party native modules across OS upgrades; Nitro reduces churn **[VERIFIED]** | 🟡 One codebase; fewer mature modules means more of your own native glue **[SPECULATIVE]** | 🔴 Two codebases + two OS-upgrade cycles + two sets of Apple/Google policy tracking **[SPECULATIVE]** |

**Model-weight license caveat (all stacks):** the *runtime* licenses above are permissive, but the *weights* carry their own terms — Meta Llama Community License, Gemma Terms of Use, Qwen license, Apple's Foundation Model (no swap). This applies equally to RN/Flutter/Native and is the real legal surface to read. **[VERIFIED: model license pages; reasoning SPECULATIVE for your specific model choice]**

---

## 2. NATIVE path specifics — cost of two separate codebases

**iOS engine reality [VERIFIED]**
- `mlx-swift-examples` (Apple, MIT) + `LocalLLMClient` (tattn, MIT, 218★) give GGUF + MLX + Foundation Models backends in Swift, with streaming, multimodal (experimental), and tool calling (experimental). `LocalLLMClient` supports iOS 17+/macOS 14+ and requires `com.apple.developer.kernel.increased-memory-limit` for larger models.
- Apple's **Foundation Models framework** (iOS 26+) ships a free ~3B on-device model with a typed `Tool` protocol — the cleanest agentic primitive on any platform: the model calls your Swift functions, which can wrap HealthKit, Contacts, Calendar, CoreLocation, etc. WWDC26 added **dynamic profiles, tool-calling mode `.required` (agentic while-loop), and an open-source "Foundation Models framework utilities" package** for multi-agent/orchestration. **[VERIFIED: developer.apple.com, WWDC26 sessions 242/301/343/345]**

**Android engine reality [VERIFIED]**
- ExecuTorch LlamaDemo (meta-pytorch, BSD-3, 1.0 GA Oct 2025) runs `.pte` models with **4 delegates**: XNNPACK (CPU), **QNN (Qualcomm Hexagon NPU)**, MediaTek, Vulkan. `LlmModule` Java API; Maven AAR available. **[VERIFIED: executorch-examples, docs.pytorch.org]**
- MLC MLCChat (Apache-2) ships an Android app and MLCEngine across backends. **[VERIFIED]**
- Google **LiteRT-LM** (Apache-2) is Google's pick for best Android NPU via NNAPI/vendor delegates. **[VERIFIED: edgeaistack.ai]**

**When native is clearly better [VERIFIED/SPECULATIVE mix]**
1. **Deep HealthKit / App Intents integration** — only Swift gives first-class HealthKit write/background-delivery and the App Intents schema system that Apple's 2026 agent framework is built around. **[VERIFIED]**
2. **NPU via CoreML (ANE) on iOS or QNN (Hexagon) on Android** — ExecuTorch's CoreML/ANE and QNN backends and MLX on Apple Silicon hit silicon the cross-platform runtimes leave on the table. llama.cpp on iOS uses Metal (not ANE); Android NNAPI gains are "variable across the fragmented ecosystem" and can even regress on mid-range chips. **[VERIFIED: MVPFactory blog, CoreML-LLM comparison, edgeaistack]**
3. **Maximum control over memory/thermal loops** — no bridge, direct `increased-memory-limit` entitlement, direct KV-cache tuning. **[VERIFIED reasoning]**

**Real cost of two codebases [SPECULATIVE but consensus]**
- Estimate ~2–3× engineering to reach feature parity (every device action implemented twice, in Swift and Kotlin).
- Two App Store / Play Console submission tracks, two OS-beta upgrade cycles, two sets of policy monitors.
- For a solo founder this is the difference between "ship in 3 months" and "ship in 9–12 months," and between one maintenance burden and two.

---

## 3. Store-approval reality per path

**Apple [VERIFIED]**
- **2.5.1**: use public APIs for intended purpose (HealthKit for health, etc.) — native and RN/Flutter both fine if used correctly.
- **2.5.2**: apps must be self-contained; cannot download/execute *code* that changes functionality. **Model weight files (GGUF/MLX/`.pte`) are treated as data, not code** — Apple DTS explicitly confirmed downloading ML models post-install is allowed. **[VERIFIED: Apple Developer Forums thread 793131]** So bundle-no-model, download-on-first-launch is the safe pattern. **[VERIFIED: Ertas AI, PocketLLM dev guide]**
- **2026 agent framework**: Apple is formalizing a **compliance tier for constrained AI agents** built on **discrete App Intents reviewers can inspect before approval**. Apps that expose typed, schema-based actions (not open-ended code generation) are positioned to pass. Apps that generate/execute code on-device, or operate beyond pre-reviewed intent boundaries, remain blocked. **[SPECULATIVE: reported by AIntelligenceHub citing The Information; the App-Intents-as-the-inspectable-agent-surface direction is VERIFIED via WWDC26 App Intents sessions 240/343/345].** Practically: **RN/Flutter apps that route device actions through real native APIs (not Accessibility) and optionally declare App Intents satisfy this tier; Native apps satisfy it most directly.**

**Google Play [VERIFIED]**
- **Accessibility API ban (effective Jan 28, 2026)**: "any use of the Accessibility API that enables an app to autonomously initiate, plan, and execute actions or decisions is strictly prohibited." This kills the old "UI-automation agent" cheat. Android 17.2 Advanced Protection Mode further revokes accessibility for any non-accessibility app. **[VERIFIED: Play Console policy 16550159, 10964491; Help Net Security; Android Authority]**
- **Blessed path = AppFunctions** (Android 16+, Jetpack `appfunctions` alpha10, **experimental**, Gemini integration in private preview). AppFunctions are on-device, MCP-like, typed Kotlin `@AppFunction` annotations the OS indexes; callers need `EXECUTE_APP_FUNCTIONS` (currently privileged). Plus a **UI-automation framework** where Gemini drives apps with zero code (emerging, Android 17+). **[VERIFIED: developer.android.com/ai/appfunctions, blog 2026-02, appfunctions release notes]**
- **Implication:** an agentic app must use *real scoped APIs* (calendar/contacts/health/location) or AppFunctions — **never Accessibility**. RN/Flutter satisfy this by calling the same real APIs; Native satisfies it identically and can additionally declare AppFunctions.

**Net:** All three stacks can pass review *if* you (1) download weights post-install, (2) use real scoped APIs not Accessibility, and (3) on iOS, prefer App Intents for system-facing actions. Native has the cleanest paper trail; RN/Flutter are equivalent in practice but you must build the App Intents/AppFunctions shim yourself.

---

## 4. Concrete recommendation (solo founder / small team, privacy-first agentic local-LLM)

**Recommended: React Native (New Architecture + Nitro Modules) as the primary stack, with llama.cpp (`llama.rn`) as the inference engine, and a thin native escape hatch for deep OS integration.**

Why RN over Flutter here:
- The **device-action ecosystem is materially more mature** in RN (calendar, contacts, health-connect, location, camera, notifications all have maintained modules) than in Flutter, where the action layer is thinner and will cost you more custom native work. **[VERIFIED RN modules; Flutter action-layer weakness SPECULATIVE but consistent with search]**
- llama.cpp access is first-class on both, but RN additionally has working **MLX (`react-native-nitro-mlx`) and Apple Foundation Models (`react-native-ai`)** bridges, giving you the iOS fast path without leaving RN. **[VERIFIED]**
- Nitro Modules erase the old "bridge is slow" objection: ~15–59× faster than legacy bridge, near-zero overhead for the action calls. **[VERIFIED: NitroBenchmarks]**

Why NOT two full native codebases by default:
- The differentiator (local LLM + real actions + privacy) is fully achievable in RN; the native tax (2–3× build + 2× maintenance) only pays off if you need HealthKit depth, ANE/QNN NPU, or the absolute cleanest App Intents story. **[SPECULATIVE cost; VERIFIED capability gap is narrow except for NPU/HealthKit]**

When to break glass and go Native (or native-only for one platform):
- You need **deep HealthKit** (background delivery, clinical records, writes) or first-class **App Intents schemas** as a core feature.
- You need **NPU throughput** (CoreML/ANE on iOS, QNN on Snapdragon) for a larger model or sustained inference.
- You have funding for parallel iOS+Android native dev, or you launch iOS-first natively and add Android later.

**Honest tradeoffs of the RN recommendation:**
- You depend on community native modules; vet maintenance (Notifee was archived → forked into `react-native-notify-kit`). Pin versions; be ready to own a module. **[VERIFIED]**
- App Intents / AppFunctions integration is a native shim you write once per platform; it's not free but it's bounded.
- Apple's Foundation Models ~3B is free and zero-download on iOS 26+, but you can't swap the model — keep llama.cpp/MLX as your flexible path and Foundation Models as a bonus.
- On Android, do **not** rely on Gemini Nano (AICore): it only offers fixed high-level GenAI APIs (summarize/proofread/rewrite/image-description), **no arbitrary tool calling, no custom model, narrow device support**. Use llama.cpp/ExecuTorch for the agentic brain. **[VERIFIED]**

---

## 5. Hybrid option: RN/Flutter UI + native modules for the action layer — is it the pragmatic best?

**Yes — and it is effectively what the recommendation already is.** The "hybrid" is not RN-plus-separate-app; it is:

- **RN/Flutter owns:** UI, chat loop, model loading/orchestration, prompt formatting, the agent/tool-loop state machine.
- **Native modules own:** each device action (calendar, contacts, health, location, camera, files, notifications, Bluetooth, app-launch). In RN these are *existing* community Nitro/TurboModules; in Flutter they are FFI plugins or your own.
- **OS-integration shim (small, per platform):** App Intents (iOS) and AppFunctions (Android) wrappers so system-facing actions are *declared and inspectable* — this is what keeps you in Apple's agent compliance tier and out of Google's Accessibility ban. **[VERIFIED policy direction]**

This hybrid gives you:
- One product codebase (velocity) ✅
- Real, scoped, reviewable device actions (approval safety) ✅
- The freedom to later extract the action layer into true native App Intents/AppFunctions without rewriting the app ✅
- A clean off-ramp to full-native for the one or two actions that genuinely need HealthKit/ANE depth ✅

The only thing the *pure* native path adds is marginal perf and the deepest OS hooks — which most agentic features (calendar, contacts, location, files, camera, notifications, Bluetooth) do **not** require. **[VERIFIED: those APIs are all available to RN modules]**

---

## Bottom line

| If you are… | Choose |
|---|---|
| Solo founder / small team, want to ship fast with real device actions + privacy | **React Native (New Arch + Nitro) + llama.cpp, native shim for App Intents/AppFunctions** |
| Need deepest HealthKit or NPU (ANE/QNN) as a core differentiator | **Native Swift (MLX/LocalLLMClient/Foundation Models) + Native Kotlin (ExecuTorch/MLC)**, iOS-first |
| Strong Dart team, simpler action set, can tolerate more custom native glue | **Flutter + llama.cpp FFI**, accept thinner action ecosystem |
| Want zero store risk and Apple's cleanest agent path above all else | **Native + App Intents + Foundation Models Tool protocol** (accept 2–3× cost) |

**The pragmatic best is the hybrid: cross-platform UI + native action modules + declared App Intents/AppFunctions.** It minimizes time-to-market, preserves full device-action capability, downloads model weights post-install (Apple-clean), and routes actions through real scoped APIs (Google-clean) — keeping the "local LLM + real device actions + privacy" differentiator intact without paying the full two-codebase tax.

---

## Sources (primary first)

- Apple App Store Review Guidelines 2.5.1 / 2.5.2 (PDF, 2026) — `developer.apple.com/support/downloads/terms/app-review-guidelines/`
- Apple DTS forum: downloading ML models post-install allowed — `developer.apple.com/forums/thread/793131` **[VERIFIED]**
- App Intents framework & WWDC26 sessions 240/343/345 — `developer.apple.com/documentation/appintents`, `developer.apple.com/videos/play/wwdc2026/`
- Foundation Models framework, `Tool` protocol, agentic workflows WWDC26/242/301 — `developer.apple.com/documentation/foundationmodels` **[VERIFIED]**
- LocalLLMClient (tattn) MIT — `github.com/tattn/LocalLLMClient` **[VERIFIED]**
- mlx-swift-examples (Apple) MIT — `github.com/ml-explore/mlx-swift-examples` **[VERIFIED]**
- ExecuTorch LlamaDemo (Meta) BSD-3 — `github.com/meta-pytorch/executorch-examples`, `docs.pytorch.org/executorch` **[VERIFIED]**
- MLC LLM Apache-2 — `llm.mlc.ai` **[VERIFIED]**
- Android AppFunctions — `developer.android.com/ai/appfunctions`, blog 2026-02, `androidx.appfunctions` alpha10 **[VERIFIED]**
- Google Play Accessibility API policy (Oct 30 2025 / Jan 28 2026) — `support.google.com/googleplay/android-developer/answer/16550159`, `10964491` **[VERIFIED]**
- Gemini Nano / AICore — `developer.android.com/ai/gemini-nano` **[VERIFIED]**
- llama.cpp MIT — `github.com/ggml-org/llama.cpp` **[VERIFIED]**
- RN LLM: InferrLM, LocalOS, `llama.rn` npm, `react-native-nitro-mlx` — **[VERIFIED]**
- Flutter LLM: `llamafu`, `flutter_llama`, `lib_llama_cpp`, `llama_cpp_dart` (pub.dev) — **[VERIFIED]**
- RN device modules: `react-native-device-calendar`, `@omarsdev/react-native-contacts`, `react-native-healthkit`/`-health-connect`, `react-native-notify-kit`, Expo — **[VERIFIED]**
- Nitro Modules benchmarks — `github.com/mrousavy/NitroBenchmarks`, `nitro.margelo.com` **[VERIFIED]**
- On-device perf/memory: PocketLLM iPhone benchmarks, localmodel.run, localaimaster.com, MVPFactory KMP blog, arxiv 2410.03613, v-chandra.github.io/on-device-llms — **[VERIFIED]**
- Licensing summaries: Cactus (llama.cpp MIT / MLC Apache-2 / ExecuTorch BSD-3 / MLX MIT), edgeaistack.ai — **[VERIFIED]**
- Apple 2026 agent compliance tier: AIntelligenceHub (secondary, cites The Information) — **[SPECULATIVE]**
