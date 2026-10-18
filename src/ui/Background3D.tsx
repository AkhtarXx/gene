import { useEffect } from 'react';
import { useWindowDimensions, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolateColor,
  cancelAnimation,
  useReducedMotion,
} from 'react-native-reanimated';
import { useTheme } from './theme';

/**
 * Pseudo-3D animated backdrop: three floating gradient orbs with parallax +
 * slow drift. No WebGL — stable on every Expo SDK. Gives real depth/glass feel.
 */

function Orb({
  size,
  x,
  y,
  from,
  to,
  duration,
}: {
  size: number;
  x: number;
  y: number;
  from: string;
  to: string;
  duration: number;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const hue = useSharedValue(0);

  // start the loop after mount
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) return;
    tx.value = withRepeat(withTiming(40, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
    ty.value = withRepeat(
      withSequence(
        withTiming(-50, { duration: duration * 0.7, easing: Easing.inOut(Easing.sin) }),
        withTiming(30, { duration: duration * 0.7, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    hue.value = withRepeat(
      withTiming(1, { duration: duration * 1.4, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    return () => {
      cancelAnimation(tx);
      cancelAnimation(ty);
      cancelAnimation(hue);
    };
  }, [duration, reducedMotion, tx, ty, hue]);

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: x,
    top: y,
    width: size,
    height: size,
    borderRadius: size / 2,
    transform: [{ translateX: tx.value }, { translateY: ty.value }] as unknown as ViewStyle['transform'],
    backgroundColor: interpolateColor(hue.value, [0, 1], [from, to]),
    opacity: 0.5,
  }));

  return <Animated.View style={style} />;
}

export function Background3D() {
  const { width, height } = useWindowDimensions();
  const { color, theme } = useTheme();
  const accent = color.accent;
  const accent2 = color.accent2;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      <Animated.View
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: color.bg,
        }}
      />
      {/* accent orbs */}
      <Orb size={260} x={-60} y={height * 0.08} from={accent} to={accent2} duration={9000} />
      <Orb size={320} x={width - 160} y={height * 0.45} from={accent2} to={accent} duration={11000} />
      <Orb size={200} x={width * 0.2} y={height * 0.7} from={accent} to={accent2} duration={8000} />
      {/* soft vignette for depth (lighter in light theme) */}
      <Animated.View
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: theme === 'light' ? 'rgba(246,248,252,0.6)' : 'rgba(7,10,18,0.55)',
        }}
      />
    </Animated.View>
  );
}
