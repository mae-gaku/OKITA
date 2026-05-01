import { Link, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, type HomeState } from '@/api';
import { registerForPushNotifications } from '@/notifications';
import { TimePicker } from '@/pickers';
import { theme } from '@/theme';

export default function TapScreen() {
  const [home, setHome] = useState<HomeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customTime, setCustomTime] = useState<Date>(() => new Date());
  const [wokeAt, setWokeAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const h = await api<HomeState>('/home');
    setHome(h);
  }, []);

  useEffect(() => {
    registerForPushNotifications().catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          await load();
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  async function selfTap(at?: Date) {
    setBusy(true);
    try {
      const body = at ? { woke_at: at.toISOString() } : {};
      await api('/wakes/me/up', { method: 'POST', body });
      setWokeAt(at ?? new Date());
      setCustomMode(false);
      await load();
    } catch (e) {
      Alert.alert('エラー', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function shareMorning() {
    const at = wokeAt ?? new Date();
    const hh = String(at.getHours()).padStart(2, '0');
    const mm = String(at.getMinutes()).padStart(2, '0');
    const visible = home?.timeline.length ?? 0;
    const message =
      `○ 起きた · ${hh}:${mm}\n` +
      (visible > 0 ? `公開先 ${visible}人\n` : '') +
      `\n#今日も起きた #OKITA`;
    try {
      await Share.share({ message });
    } catch (e) {
      Alert.alert('共有できません', (e as Error).message);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const woke = !!home?.woke_today;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Text style={styles.brand}>OKITA<Text style={styles.dot}>.</Text></Text>
        <Link href="/me" asChild>
          <Pressable hitSlop={10}>
            <Text style={styles.topLink}>設定</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.heroWrap}>
        <Text style={styles.heroHint}>
          {woke ? '今日はもう起きました ✓' : 'おはよう'}
        </Text>

        <Pressable
          style={[styles.bigBtn, woke && styles.bigBtnDone]}
          onPress={() => selfTap()}
          disabled={busy || woke}
        >
          <Text style={[styles.bigBtnText, woke && styles.bigBtnTextDone]}>
            {busy ? '...' : woke ? '✓' : 'おはよう'}
          </Text>
        </Pressable>

        <Text style={styles.heroFoot}>
          {woke
            ? '公開リストの人に伝わっています'
            : '1タップで「起きました」が公開リストに届く'}
        </Text>
      </View>

      {!woke && !customMode && (
        <Pressable hitSlop={6} onPress={() => { setCustomTime(new Date()); setCustomMode(true); }}>
          <Text style={styles.customLink}>別の時刻で記録する →</Text>
        </Pressable>
      )}

      {woke && (
        <Pressable hitSlop={6} onPress={shareMorning}>
          <Text style={styles.shareLink}>今朝のおはようをそっと共有 →</Text>
        </Pressable>
      )}

      {!woke && customMode && (
        <View style={styles.customBox}>
          <Text style={styles.customLabel}>記録する時刻（24時間以内）</Text>
          <TimePicker value={customTime} onChange={setCustomTime} />
          <View style={styles.customActions}>
            <Pressable
              style={styles.customCancel}
              onPress={() => setCustomMode(false)}
              disabled={busy}
            >
              <Text style={styles.customCancelText}>キャンセル</Text>
            </Pressable>
            <Pressable
              style={styles.customConfirm}
              onPress={() => selfTap(customTime)}
              disabled={busy}
            >
              <Text style={styles.customConfirmText}>{busy ? '...' : 'この時刻で記録'}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Link href="/home" asChild>
        <Pressable style={styles.detailBtn}>
          <Text style={styles.detailBtnText}>詳細・タイムライン →</Text>
          <Text style={styles.detailBtnHint}>ストリーク、見える人、設定</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontSize: 18, fontWeight: '800', color: theme.ink, letterSpacing: 1 },
  dot: { color: theme.accent },
  topLink: { fontSize: 12, color: theme.inkSoft, letterSpacing: 2 },
  heroWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 },
  heroHint: { fontSize: 14, color: theme.inkSoft, letterSpacing: 3 },
  bigBtn: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: theme.accent,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.ink,
    shadowColor: theme.ink,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  bigBtnDone: { backgroundColor: theme.bgWarm },
  bigBtnText: { color: theme.bg, fontSize: 30, fontWeight: '800', letterSpacing: 4 },
  bigBtnTextDone: { color: theme.ink, fontSize: 60 },
  heroFoot: { fontSize: 12, color: theme.inkSoft, textAlign: 'center', maxWidth: 260, lineHeight: 18 },
  customLink: { fontSize: 13, color: theme.accentDeep, letterSpacing: 1, padding: 10, textAlign: 'center' },
  shareLink: { fontSize: 13, color: theme.accentDeep, letterSpacing: 1, padding: 10, textAlign: 'center' },
  customBox: { padding: 14, borderWidth: 1, borderColor: theme.ink, backgroundColor: theme.bgWarm, marginVertical: 10 },
  customLabel: { fontSize: 11, color: theme.accent, letterSpacing: 1, marginBottom: 8 },
  customActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  customCancel: { flex: 1, borderWidth: 1, borderColor: theme.ink, padding: 10, alignItems: 'center' },
  customCancelText: { fontSize: 12, color: theme.ink, letterSpacing: 1 },
  customConfirm: { flex: 2, backgroundColor: theme.ink, padding: 10, alignItems: 'center' },
  customConfirmText: { fontSize: 12, color: theme.bg, letterSpacing: 1 },
  detailBtn: {
    borderWidth: 1,
    borderColor: theme.ink,
    padding: 16,
    alignItems: 'center',
    backgroundColor: theme.bgWarm,
  },
  detailBtnText: { color: theme.ink, fontSize: 14, fontWeight: '600', letterSpacing: 2 },
  detailBtnHint: { color: theme.inkSoft, fontSize: 11, marginTop: 4, letterSpacing: 1 },
});
