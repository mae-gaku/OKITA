import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { theme } from '@/theme';

const FRAMES = [
  { eyebrow: 'OKITA', body: '朝の「起きた」を、見せたい人にだけ。' },
  { eyebrow: 'ONE TAP', body: '真ん中のボタンを押すだけで、相手は安心。' },
  { eyebrow: 'NO ALARM', body: '起こすのではなく、ただ確認する。' },
];

const HOLD_MS = 1100;
const FADE_IN_MS = 450;
const FADE_OUT_MS = 350;

// セッション中(JS engine 起動中)に1回だけ。コールド起動時のみイントロを再生する。
let introShownThisSession = false;

export default function IntroScreen() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (introShownThisSession) {
      router.replace('/tap');
      return;
    }

    let cancelled = false;
    let cur = 0;

    const advance = () => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: FADE_IN_MS + 80,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (cancelled) return;
        setTimeout(() => {
          if (cancelled) return;
          if (cur < FRAMES.length - 1) {
            Animated.parallel([
              Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }),
              Animated.timing(translateY, { toValue: -20, duration: FADE_OUT_MS, useNativeDriver: true }),
            ]).start(() => {
              if (cancelled) return;
              cur += 1;
              setIdx(cur);
              translateY.setValue(20);
              advance();
            });
          } else {
            // 最終フレームを少し見せてから遷移
            setTimeout(() => {
              if (cancelled) return;
              introShownThisSession = true;
              router.replace('/tap');
            }, HOLD_MS);
          }
        }, HOLD_MS);
      });
    };

    advance();
    return () => { cancelled = true; };
  }, []);

  function skip() {
    introShownThisSession = true;
    router.replace('/tap');
  }

  return (
    <Pressable onPress={skip} style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.center}>
        <Animated.View style={[styles.frame, { opacity, transform: [{ translateY }] }]}>
          <Text style={styles.eyebrow}>{FRAMES[idx].eyebrow}</Text>
          <Text style={styles.body}>{FRAMES[idx].body}</Text>
        </Animated.View>
      </View>
      <View style={styles.bottom}>
        <View style={styles.dots}>
          {FRAMES.map((_, i) => (
            <View key={i} style={[styles.dot, idx === i && styles.dotActive]} />
          ))}
        </View>
        <Text style={styles.skip}>タップでスキップ</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, padding: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frame: { alignItems: 'center', maxWidth: 360 },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 8,
    color: theme.accent,
    fontWeight: '700',
    marginBottom: 18,
  },
  body: {
    fontSize: 22,
    color: theme.ink,
    textAlign: 'center',
    lineHeight: 34,
    fontWeight: '500',
  },
  bottom: { alignItems: 'center', paddingBottom: 12, gap: 18 },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.ink, opacity: 0.18 },
  dotActive: { opacity: 1, backgroundColor: theme.accent, width: 18 },
  skip: { fontSize: 11, color: theme.inkSoft, letterSpacing: 3 },
});
