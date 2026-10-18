// Exact app-authored literals only: no external data, app labels, exception
// messages or user text. A receipt confirms a handoff, never its final outcome.
export const PHONE_RECEIPTS = {
  opened: '{"ok":true,"status":"opened_for_user"}',
  invalid: '{"ok":false,"status":"invalid_arguments"}',
  unavailable: '{"ok":false,"status":"no_supported_app"}',
  unsupported: '{"ok":false,"status":"android_only"}',
} as const;

export function isFixedPhoneReceipt(text: string): boolean {
  return Object.values(PHONE_RECEIPTS).some((receipt) => receipt === text);
}
