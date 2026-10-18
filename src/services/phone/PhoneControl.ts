import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { checkAbort } from '../async';

export type ControlStatus = { available: boolean; enabled: boolean; armed: boolean; packages?: string[] };
interface NativeControl {
  status(): Promise<ControlStatus>;
  openSettings(): Promise<void>;
  arm(packages: string[]): Promise<boolean>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
  read(): Promise<string>;
  launch(packageName: string): Promise<string>;
  act(screen: string, node: string, action: string, text: string): Promise<string>;
}
function native(): NativeControl {
  if (Platform.OS !== 'android' || !NativeModules.PhoneControl) {
    throw new Error('Personal phone control needs the updated Android APK.');
  }
  return NativeModules.PhoneControl as NativeControl;
}
export const phoneControl = {
  status: async (): Promise<ControlStatus> => {
    if (Platform.OS !== 'android' || !NativeModules.PhoneControl)
      return { available: false, enabled: false, armed: false };
    return native().status();
  },
  openSettings: async () => native().openSettings(),
  arm: async (packages: string[]) => native().arm(packages),
  stop: async () => native().stop(),
  cancel: async () => native().cancel(),
};
export function subscribePhoneControlStop(listener: () => void): () => void {
  const subscription = DeviceEventEmitter.addListener('PhoneControlStopped', listener);
  return () => subscription.remove();
}

/** Abort closes native approval too. Native work remains awaited by the caller. */
export async function controlRequest(
  call: (control: NativeControl) => Promise<string>,
  signal?: AbortSignal,
  onNativeResult?: (result: string) => void
): Promise<string> {
  checkAbort(signal);
  const control = native();
  const cancel = () => {
    void control.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    checkAbort(signal);
    const result = await call(control);
    onNativeResult?.(result);
    checkAbort(signal);
    return result;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
