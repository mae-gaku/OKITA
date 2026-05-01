import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, type FollowEdge, type WakeMinutes } from '@/api';
import { theme } from '@/theme';

const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

function fmtUtcMinutes(utcMinutes: number): string {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0));
  utc.setUTCMinutes(utcMinutes);
  return utc.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function summarizeWake(minutes: WakeMinutes): string | null {
  const set = minutes.filter((m): m is number => m != null);
  if (set.length === 0) return null;
  const allSame = set.every((m) => m === set[0]);
  if (allSame && set.length === 7) return `毎日 ${fmtUtcMinutes(set[0])}`;
  return minutes
    .map((m, i) => (m == null ? null : `${WEEKDAY_LABELS[i]} ${fmtUtcMinutes(m)}`))
    .filter(Boolean)
    .join(' / ');
}

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = Number(id);
  const [edge, setEdge] = useState<FollowEdge | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const edges = await api<FollowEdge[]>('/follows');
    setEdge(edges.find((e) => e.user.id === userId) ?? null);
  }, [userId]);

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

  async function addToVisibility() {
    setBusy(true);
    try {
      await api('/visibility', { body: { viewer_id: userId } });
      await load();
    } catch (e) {
      Alert.alert('エラー', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeFromVisibility() {
    setBusy(true);
    try {
      await api(`/visibility/${userId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      Alert.alert('エラー', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }
  if (!edge) {
    return (
      <View style={styles.center}>
        <Text>ユーザーが見つかりません</Text>
      </View>
    );
  }

  const mutual = edge.i_follow && edge.follows_me;
  const wakeSummary = summarizeWake(edge.user.wake_minutes);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: edge.user.display_name }} />

      <View style={styles.profile}>
        <Text style={styles.name}>{edge.user.display_name}</Text>
        <Text style={styles.handle}>@{edge.user.handle}</Text>
        <Text style={styles.relation}>
          {mutual ? '相互フォロー' : edge.i_follow ? 'フォロー中（相手未フォロー）' : edge.follows_me ? '相手のみフォロー' : '未フォロー'}
        </Text>
        {wakeSummary && (
          <Text style={styles.target}>起床予定 {wakeSummary}</Text>
        )}
      </View>

      <View style={styles.box}>
        <Text style={styles.boxLabel}>自分の朝を見せる</Text>
        <Text style={styles.boxHint}>
          公開リストに入れると、この人にあなたの「起きた」が伝わります。
          {!mutual && '\n（相互フォローが必要）'}
        </Text>
        {edge.in_my_visibility ? (
          <Pressable
            style={[styles.button, styles.buttonGhost]}
            onPress={removeFromVisibility}
            disabled={busy}
          >
            <Text style={[styles.buttonText, styles.buttonGhostText]}>公開リストから外す</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.button}
            onPress={addToVisibility}
            disabled={busy || !mutual}
          >
            <Text style={styles.buttonText}>公開リストに入れる</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  profile: { marginBottom: 20 },
  name: { fontSize: 26, color: theme.ink, fontWeight: '700' },
  handle: { fontSize: 13, color: theme.inkSoft, marginTop: 2 },
  relation: { fontSize: 12, color: theme.accent, marginTop: 6, letterSpacing: 1 },
  target: { fontSize: 13, color: theme.ink, marginTop: 6, fontWeight: '600' },
  box: {
    padding: 16,
    borderWidth: 2,
    borderColor: theme.ink,
    backgroundColor: theme.bgWarm,
    marginBottom: 14,
    gap: 10,
  },
  boxLabel: { fontSize: 13, color: theme.accent, letterSpacing: 2, fontWeight: '600' },
  boxHint: { fontSize: 12, color: theme.inkSoft, lineHeight: 18 },
  button: { backgroundColor: theme.ink, padding: 14, alignItems: 'center' },
  buttonText: { color: theme.bg, fontSize: 14, fontWeight: '600', letterSpacing: 2 },
  buttonGhost: { backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.ink },
  buttonGhostText: { color: theme.ink },
});
