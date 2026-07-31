import { Alert } from 'react-native';
import { setConfirmHandler, type ConfirmRequest } from './confirmBridge';

/**
 * Registers the real confirmation prompt for the Security Gate. Mounted once
 * in the root layout. Non-React classes call requestConfirm -> this handler.
 */
export function registerConfirmHandler(): void {
  setConfirmHandler((r: ConfirmRequest) =>
    new Promise<boolean>((resolve) => {
      Alert.alert(
        r.title,
        r.details ? `${r.message}\n\n${r.details}` : r.message,
        [
          { text: 'Deny', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Allow', onPress: () => resolve(true) },
        ],
        { cancelable: false }
      );
    })
  );
}
