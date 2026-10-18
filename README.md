# Gene Personal Assistant

An Android-first personal assistant with on-device language models, local memory, voice input, and user-approved phone actions.

[Getting started](#getting-started) · [Phone control](#personal-phone-control) · [Architecture](ARCHITECTURE.md) · [Testing](docs/TESTING.md) · [Contributing](CONTRIBUTING.md)

## Overview

Gene combines a local chat interface with a permission-gated tool system. Conversations, settings, audit records, embeddings, and model files are stored on the device. Model downloads require an internet connection; applications opened by Gene use their own accounts, permissions, and network connections.

The application is under active development. Personal phone control is an experimental Android feature for personal APK distribution. It does not provide unrestricted access to protected screens or guarantee message delivery.

## Capabilities

| Area                   | Features                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Conversations          | Persistent chat history, search, rename, delete, streaming responses, retry, and cancellation                          |
| Local inference        | Runtime GGUF downloads, pinned SHA-256 verification, CPU fallback, and hardware acceleration where supported           |
| Personal phone control | Selected-app screen inspection, semantic taps, text replacement, scrolling, Back, and app launch through native review |
| Phone shortcuts        | Dialer, SMS drafts, timers, maps, settings pages, installed-app launch, and local reminders                            |
| Device tools           | Contacts, location, calendar, sandboxed files, Bluetooth discovery, and supported Android health data                  |
| Memory and voice       | Local vector retrieval, saved-memory management, and on-device Whisper transcription                                   |
| Privacy and control    | Per-chat tool permissions, activity log, data export, deletion controls, and dark/light themes                         |

Nineteen tools are registered. Native capabilities depend on the operating system, installed applications, granted permissions, and available hardware.

## Getting started

### Requirements

- Node.js 22 or later and npm.
- Android SDK 35, JDK 17, and an Android emulator or physical device.
- Android 8.0 or later; a physical device with at least 4 GB RAM is recommended for local inference.
- Xcode on macOS for the iOS application. Android personal phone control is unavailable on iOS.

This project uses native modules and requires a development build; Expo Go is insufficient.

```sh
git clone https://github.com/AkhtarXx/gene.git
cd gene
npm ci
npx expo run:android
```

The Android build uses NDK `27.1.12297006`. Configure `ANDROID_HOME` and your local SDK path before building. Development builds use Metro; keep the development server available while testing.

For iOS development:

```sh
npx expo run:ios
```

iOS device capabilities require separate hardware validation. The Android accessibility implementation is not an iOS automation implementation.

### First launch

1. Complete onboarding.
2. Open **Models**, download a compatible chat model, and load it.
3. Optionally download the embedding and voice models.
4. Start a chat, or use **Phone actions** for shortcuts that do not require a model.

Initial model downloads can be large. Downloaded files are verified against pinned hashes; cached weights can be verified offline. Runtime speed depends strongly on the device and selected model.

## Personal phone control

Gene can request actions inside another Android app through a user-enabled accessibility service. This mode is intended for a personal APK rather than Google Play distribution of autonomous accessibility automation.

1. Open **Personal phone control** from the home screen.
2. Read the disclosure and enable **Gene personal control** in Android Accessibility settings.
3. Return to Gene and choose up to eight installed apps.
4. Approve a session lasting up to ten minutes.
5. Load a chat model if needed and start a **phone assistant chat**.
6. Describe the task, such as finding a contact and preparing a message.

A dedicated phone assistant chat enables only the three device-control tools and disables memory retrieval. The assistant must read the current screen, use its returned node IDs, and read again after each action.

Every change requires **Allow once**, including app launch, taps, text replacement, scrolling, Back, and Send. Review the recipient and complete draft in the destination app before approving a send. The floating **STOP Gene** button ends the session and cancels the agent.

### Boundaries

- Only the selected apps are available during the active session.
- Locked devices, visible password fields, permission/installer interfaces, and unknown or foreign accessibility overlays are refused.
- Screen tokens become invalid after actions. Changed or incomplete screens require a fresh read.
- Apps with inaccessible, custom-drawn, or protected controls may be unsupported.
- A successful dispatch records that an action was requested; it does not prove a message or email was delivered.
- Destination-app accounts and permissions must already be configured.

The separate **Phone actions** screen uses scoped Android intents. Its dialer and SMS shortcuts open drafts or review screens; the user completes the action in the destination app.

See [validation coverage](docs/TESTING.md) for the distinction between automated tests, native emulator checks, and application-specific end-to-end testing.

## Security and privacy

- **Explicit tool access:** the registry denies unknown tools and enforces each conversation's allowlist at dispatch.
- **Human approval:** side effects require confirmation. Personal device actions use a native review panel in the active app.
- **Untrusted screen content:** tool output and retrieved content remain data, never instructions. Personal native review does not clear conversation taint or unlock ordinary write tools.
- **Bounded native sessions:** selected apps, ten-minute expiry, visible Stop, cancellation, and screen revalidation constrain phone control.
- **Local persistence:** chats, settings, memory, and audit records are stored locally. Export and deletion controls are available in Settings.
- **Verified model files:** fresh downloads use pinned SHA-256 values and Hugging Face metadata checks.

Gene performs inference locally. That does not prevent destination apps from sending data when the user approves an action. See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## Development

```sh
npm run typecheck
npm run lint
npm test
npx expo export --platform android --output-dir dist/verification
```

Tests execute the production TypeScript services with controlled native adapters and engines. Passing unit tests does not establish messaging-app compatibility or LLM task accuracy. Native and physical-device testing are described in [docs/TESTING.md](docs/TESTING.md).

The installation hook applies a guarded `llama.rn` 0.12.x ABI patch for x86_64 emulators advertising translated ARM ABIs. If dependency scripts are disabled, run:

```sh
node scripts/patch-llama-abi.cjs
```

Review the patch before upgrading `llama.rn`. The phone-control source lives in `native/phone-control/`; its Expo config plugin preserves service registration and source files during Android prebuild.

### Release builds

Use a private release keystore. The Gradle build refuses release signing with the public debug key. Local signing reads `OPENCLAW_KEYSTORE_PATH`, `OPENCLAW_KEYSTORE_PASSWORD`, `OPENCLAW_KEY_ALIAS`, and `OPENCLAW_KEY_PASSWORD`; these established configuration keys remain for compatibility. Never commit signing credentials or environment files.

The existing application identifier and storage keys are retained so updates preserve installed application data. The displayed application name is **Gene Personal Assistant**.

## Repository structure

```text
app/                    Screens and navigation
src/services/           Inference, orchestration, security, tools, memory, speech, storage
src/ui/                 Theme, shared components, confirmation, and message rendering
src/models/             Model catalog and device guidance
native/phone-control/   Android service and React Native bridge source
plugins/                Native configuration plugins
scripts/                Dependency compatibility patch
tests/                  Service and persistence regression tests
docs/                   Validation coverage and testing instructions
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), [ARCHITECTURE.md](ARCHITECTURE.md), and the [Code of Conduct](CODE_OF_CONDUCT.md). Keep behavioral changes focused, document native limitations, and run the required checks before submitting a change.

## License

The application source is available under the [MIT License](LICENSE). Model weights and third-party dependencies have their own licenses. Weights are downloaded at runtime and are not bundled with the repository.
