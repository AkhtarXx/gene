import { BleManager } from 'react-native-ble-plx';
import type { ToolDefinition } from '../../types/tool';

const manager = new BleManager();

/**
 * Bluetooth (BLE) scan tool. Sensitive WRITE: a scan reveals nearby device IDs
 * which can infer location/presence, so it is a confirm-gated action. We use a
 * short time-boxed scan and return only names/IDs (no connection).
 */
export const bluetoothScan: ToolDefinition = {
  name: 'bluetooth_scan',
  description:
    'Scans for nearby Bluetooth LE devices for ~3 seconds and returns a bounded list of device names/IDs. Use only when the user asks what Bluetooth devices are nearby.',
  risk: 'write',
  parameters: [
    { name: 'seconds', type: 'number', description: 'Scan duration (default 3, max 10).', required: false },
  ],
  execute: async (args) => {
    const seconds = Math.min(Math.max(Number(args.seconds ?? 3), 1), 10);
    const found: { id: string; name: string | null }[] = [];
    const seen = new Set<string>();

    return new Promise((resolve) => {
      const scan = manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          manager.stopDeviceScan();
          resolve(JSON.stringify({ ok: false, error: error.message }));
          return;
        }
        if (device && device.id && !seen.has(device.id)) {
          seen.add(device.id);
          found.push({ id: device.id, name: device.name ?? null });
        }
      });
      if (scan && typeof (scan as Promise<void>).catch === 'function') {
        (scan as Promise<void>).catch((e) => {
          manager.stopDeviceScan();
          resolve(JSON.stringify({ ok: false, error: (e as Error).message }));
        });
      }
      setTimeout(() => {
        manager.stopDeviceScan();
        resolve(JSON.stringify({ ok: true, count: found.length, devices: found.slice(0, 20) }));
      }, seconds * 1000);
    });
  },
};
