import { ReactNode } from 'react';
import { View, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { color, spring } from './theme';

type AnimatedPressProps = {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

/** Tap target with spring scale + opacity feedback (>=44px target). */
export function AnimatedPress({
  children,
  onPress,
  disabled,
  style,
}: AnimatedPressProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[{ minHeight: 44, minWidth: 44 }, animated, style]}
      onTouchStart={() => {
        if (disabled) return;
        scale.value = withSpring(0.94, spring);
        opacity.value = withSpring(0.85, spring);
      }}
      onTouchEnd={() => {
        if (disabled) return;
        scale.value = withSpring(1, spring);
        opacity.value = withSpring(1, spring);
        onPress();
      }}
    >
      {children}
    </Animated.View>
  );
}
