# Validation and Testing

## Automated verification

Run from the repository root with Node.js 22 or later:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npx expo export --platform android --output-dir dist/verification
```

The current regression suite contains **66 tests**. It covers conversation persistence, transactional writes, history restoration, tool allowlists, taint preservation, cancellation, native-drain locks, model lifecycle, phone intents, notifications, and personal-control authorization and audit behavior.

Native adapters and language-model responses are controlled in these tests. These tests do not send messages, place calls, or establish that a model can complete a task in a third-party app.

## Android build

Configure JDK 17 and Android SDK 35, then run:

```sh
cd android
./gradlew :app:assembleDebug
```

On Windows, use `gradlew.bat`. Restrict native architectures only when deliberately building for a specific emulator or device. A debug APK depends on the development server; it is not a standalone release artifact.

Release builds require private signing credentials. Do not distribute a debug-signed APK as a production release.

## Recorded emulator coverage

Testing used an existing Android 14 / API 34 x86_64 emulator. No additional destination apps were installed for testing.

| Check                                                                        | Status                                                         |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Native debug compilation and APK installation                                | Passed                                                         |
| Onboarding, saved chats, theme/settings persistence, model loading           | Passed                                                         |
| Basic local model response and generation cancellation                       | Passed; inference is slow on this emulator                     |
| Scoped Settings handoff, denial, and return                                  | Passed                                                         |
| Android accessibility service disclosure and enable flow                     | Passed                                                         |
| Timed control-session consent and floating Stop visibility                   | Passed                                                         |
| Native app-launch review, denial, and approved launch                        | Passed                                                         |
| Screen-read transition and underlying-window selection                       | Timing issue found and corrected; final runtime retest pending |
| Native semantic tap, text replacement, scrolling, and stale-screen rejection | Automated adapter coverage; full native sequence pending       |
| LLM-driven contact selection and real message/email delivery                 | Not verified                                                   |
| Physical-device microphone accuracy, hardware acceleration, iOS              | Not verified                                                   |

A scripted engine exercises orchestration independently of the language model. Its success must not be reported as a successful LLM-driven message send. The final screen-control runtime sequence was interrupted when the emulator became unavailable.

## Personal-control acceptance checks

Use a test account and a recipient who has agreed to receive test messages.

1. Enable the service manually through Android Settings. Confirm that no session is armed automatically.
2. Select one installed app and approve the timed session.
3. Deny an app launch; verify no launch occurs and the activity log records denial.
4. Approve a launch; verify the target app is foreground before reading its screen.
5. Read the screen, select a returned node, and approve a tap, text replacement, and scroll.
6. Change the screen while a review is pending; verify the action is refused and a new read is required.
7. Press Stop during an approval and during model generation; verify the panel disappears and no further action executes.
8. Verify that locked/password screens, unselected apps, and foreign accessibility overlays are refused.
9. Prepare a message or email; inspect the exact recipient and full draft before allowing Send.
10. Verify the destination app's result. Do not automatically repeat Send after an uncertain result.
11. Let the session expire and verify both native control and the agent stop.

Document the device, Android version, destination-app version, model, task, observed result, and any unsupported controls for each compatibility test.
