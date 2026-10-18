import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import type { ToolDefinition } from '../../types/tool';
import { checkAbort } from '../async';

/** Permission-gated, bounded BLE scan; resources exist only during a scan. */
export const bluetoothScan: ToolDefinition = {
  name: 'bluetooth_scan',
  description:
    'Scans nearby Bluetooth LE devices for 3 seconds (max 10), returning up to 20 names/IDs. Requires confirmation.',
  risk: 'write',
  parameters: [
    { name: 'seconds', type: 'number', description: 'Scan duration (default 3, max 10).', required: false },
  ],
  execute: async (args, signal) => {
    checkAbort(signal);
    if (Platform.OS === 'android') {
      const permissions =
        Number(Platform.Version) >= 31
          ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
          : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      const grants = await PermissionsAndroid.requestMultiple(permissions);
      checkAbort(signal);
      if (permissions.some((p) => grants[p] !== PermissionsAndroid.RESULTS.GRANTED)) {
        return JSON.stringify({ ok: false, error: 'bluetooth_permission_denied' });
      }
    }
    const seconds = Math.min(Math.max(Number(args.seconds ?? 3), 1), 10);
    const manager = new BleManager();
    const devices = new Map<string, { id: string; name: string | null }>();
    try {
      return await new Promise<string>((resolve) => {
        let finished = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const onAbort = () => finish({ ok: false, error: 'scan_cancelled' });
        const finish = (result: object) => {
          if (finished) return;
          finished = true;
          if (timer) clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          void manager.stopDeviceScan().catch(() => {});
          resolve(JSON.stringify(result));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) {
          onAbort();
          return;
        }
        timer = setTimeout(
          () => finish({ ok: true, count: devices.size, devices: [...devices.values()] }),
          seconds * 1000
        );
        void manager
          .startDeviceScan(null, null, (error, device) => {
            if (error) {
              finish({ ok: false, error: error.message });
              return;
            }
            if (!finished && device && devices.size < 20)
              devices.set(device.id, { id: device.id, name: device.name ?? null });
          })
          .catch((error: Error) => finish({ ok: false, error: error.message }));
      });
    } finally {
      await manager.destroy();
    }
  },
};
