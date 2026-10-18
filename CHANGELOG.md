# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Restore saved chat trust state and clear the model cache when switching conversations.
- Persist an interrupted-response placeholder before inference; save exchanges atomically and order timestamp ties consistently.
- Restore Stop during generation, prevent sends while chat history loads, and preserve earlier context when retrying a failed answer.
- Stop microphone capture on navigation, cap recordings at 60 seconds, and show separate voice-processing/error states.
- Share concurrent model downloads and verification; prevent model deletion and data wipes during active operations.
- Keep model-generated tool/reasoning syntax out of streamed message bubbles.
- Allow viewing and deleting saved memories while retrieval is disabled.
- Validate the Expo configuration, respect reduced motion, and clean up background animations.

### Improved

- Preserve the existing glass dark/light design with model-readiness cards, conversation search, chat starter prompts, accessible controls, safe-area spacing, and visible save/errors.

### Added

- Gene Personal Assistant branding, installation guidance, security documentation, and explicit validation coverage.
- Personal Android phone control with selected-app, ten-minute sessions, native action review, screen revalidation, and a floating Stop control.
- Dedicated phone assistant chats with only device-control tools enabled and memory retrieval disabled.
- Model-free phone shortcuts for settings, dialer, SMS drafts, timers, maps, app launch, and reminders.
- Regression tests for native-control authorization, cancellation, audit races, and atomic restricted-chat creation.
- Persistent conversations, multi-chat home, rename/delete (WAL SQLite via op-sqlite)
- Settings screen: dark/light/system theme, inference defaults, storage, privacy actions
- On-device memory viewer (list/search/delete saved chunks)
- Persistent Activity Log for every allowed/denied tool action
- First-run onboarding (privacy → safety → model guidance)
- Chat polish: markdown rendering, streaming, copy, regenerate, tok/s stats, tool-result expansion
- Per-chat settings: system prompt, tool allowlist (enforced at dispatch), memory toggle
- On-device voice input (whisper.rn tiny.en, SHA-256 verified runtime download)
- Deterministic `get_current_time` tool
- GPU/NPU acceleration with automatic CPU fallback (Metal / OpenCL / Hexagon HTP)
- Filtered token streaming (tool-call syntax excluded from bubbles)
- Model deletion + storage usage; HF cross-check limited to fresh downloads (cache hits verify
  offline)
- ESLint (Expo flat config) + Prettier + CI workflow + Dependabot + OSS docs
- Data export (shareable JSON) and delete-everything
- Release signing guard: debug keystore forbidden for release builds

### Changed

- Memory storage batched into a single transaction per document
- Bluetooth scan rewritten with runtime permissions, settle guard and manager lifecycle
- Calendar/notification/launch tools: abort support and stricter argument validation
- Embedding service refuses silent model switching

## [0.1.0] - 2026-07-16

### Added

- Core agent loop (llama.rn): tool calling, max-iteration/timeout/cancel controls
- Deny-by-default tool registry with risk tiers
- Security gate: confirmation dialogs, cross-turn taint, audit log
- Tools: location, calendar (list/create), contacts, files (sandboxed), notifications, Bluetooth,
  health (Android), app launch
- Runtime model downloads with pinned SHA-256 verification
- On-device RAG memory (sqlite-vec) with nomic-embed-text
- SHA-256 supply-chain cross-check against HuggingFace `lfs.oid`
