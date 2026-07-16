import * as Location from 'expo-location';
import type { ToolDefinition } from '../../types/tool';

/**
 * Example device-action tool. The model only emits {name, arguments}; this
 * function performs the actual (permission-gated) OS call. Exported as a
 * ToolDefinition so the Orchestrator can register it in the ToolRegistry.
 */
export const locationTool: ToolDefinition = {
  name: 'get_current_location',
  description: 'Returns the device current GPS coordinates (latitude/longitude).',
  risk: 'read',
  parameters: [],
  execute: async () => {
    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) return 'Location services are disabled.';
    const granted = await Location.requestForegroundPermissionsAsync();
    if (granted.status !== 'granted') return 'Location permission denied.';
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return JSON.stringify({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    });
  },
};
