import { useRef } from 'react';
import { Dimensions, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { color } from './theme';

const { width, height } = Dimensions.get('window');

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
  delay,
}: {
  size: number;
  x: number;
  y: number;
  from: string;
  to: string;
  duration: number;
  delay: number;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const hue = useSharedValue(0);

  // start the loop after mount
  const started = useRef(false);
  if (!started.current) {
    started.current = true;
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
  }

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
  return (
    <>
      <Animated.View
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: color.bg,
        }}
      />
      {/* accent orbs */}
      <Orb size={260} x={-60} y={height * 0.08} from={color.accent} to={color.accent2} duration={9000} delay={0} />
      <Orb size={320} x={width - 160} y={height * 0.45} from={color.accent2} to={color.accent} duration={11000} delay={800} />
      <Orb size={200} x={width * 0.2} y={height * 0.7} from={color.accent} to={color.accent2} duration={8000} delay={400} />
      {/* soft vignette for depth */}
      <Animated.View
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(7,10,18,0.55)',
        }}
      />
    </>
  );
}
