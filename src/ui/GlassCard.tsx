import { ReactNode } from 'react';
import { View, ViewStyle } from 'react-native';
import { radius, space, useTheme } from './theme';

type GlassCardProps = {
  children: ReactNode;
  style?: ViewStyle;
};

/** Translucent surface with soft border + blur feel (no skia needed). */
export function GlassCard({ children, style }: GlassCardProps) {
  const { color } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: color.surface1,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: color.border,
          padding: space.lg,
          // soft elevation via shadow (perf: static, not animated)
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
