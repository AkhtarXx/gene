import { ReactNode } from 'react';
import { Pressable, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { spring } from './theme';

type AnimatedPressProps = {
  children: ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

/** Tap target with spring scale + opacity feedback (>=44px target). */
export function AnimatedPress({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
  accessibilityLabel,
}: AnimatedPressProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={{ minHeight: 44, minWidth: 44, opacity: disabled ? 0.45 : 1 }}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        scale.value = withSpring(0.94, spring);
        opacity.value = withSpring(0.85, spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, spring);
        opacity.value = withSpring(1, spring);
      }}
    >
      <Animated.View style={[{ minHeight: 44, minWidth: 44, justifyContent: 'center' }, animated, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
