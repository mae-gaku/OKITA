import { Link, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { api, isPaymentRequired, type FollowEdge, type WakeTimes } from '@/api';
import { TimePicker } from '@/pickers';
import { theme } from '@/theme';

function defaultLocalSeven(): Date {
  const d = new Date();
  d.setHours(7, 0, 0, 0);
  return d;
}

function localFromUtcMinutes(utcMinutes: number): Date {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0));
  utc.setUTCMinutes(utcMinutes);
  return utc;
}

function utcMinutesFromLocal(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function fmt(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Phase 0: 全曜日同じ時刻 (シンプルモード)。曜日別は Phase 2 以降。
// 通知先 = 公開リスト (= /visibility)。相互フォロワーから選べる。
export default function WakeTargetScreen() {
  const [time, setTime] = useState<Date>(defaultLocalSeven());
  const [hasTarget, setHasTarget] = useState(false);
  const [edges, setEdges] = useState<FollowEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [w, eds] = await Promise.all([
      api<WakeTimes>('/me/wake-times'),
      api<FollowEdge[]>('/follows'),
    ]);
    const firstSet = w.minutes.find((m): m is number => m != null);
    if (firstSet != null) {
      setTime(localFromUtcMinutes(firstSet));
      setHasTarget(true);
    } else {
      setHasTarget(false);
    }
    setEdges(eds);
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

  async function saveTime(d: Date) {
    setBusy(true);
    try {
      const m = utcMinutesFromLocal(d);
      await api('/me/wake-times', {
        method: 'PUT',
        body: { minutes: Array(7).fill(m) },
      });
      setTime(d);
      setHasTarget(true);
    } catch (e) {
      Alert.alert('エラー', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clearTime() {
    setBusy(true);
    try {
      await api('/me/wake-times', {
        method: 'PUT',
        body: { minutes: Array(7).fill(null) },
      });
      setHasTarget(false);
    } catch (e) {
      Alert.alert('エラー', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleAudience(userId: number, currentlyOn: boolean) {
    setTogglingId(userId);
    try {
      if (currentlyOn) {
        await api(`/visibility/${userId}`, { method: 'DELETE' });
      } else {
        await api('/visibility', { body: { viewer_id: userId } });
      }
      await load();
    } catch (e) {
      if (isPaymentRequired(e)) {
        Alert.alert(
          'Pro が必要です',
          'Free プランの公開リストは 3 人まで。Pro にすると上限が無くなります。\n（課金は Phase 3 で有効化）',
        );
      } else {
        Alert.alert('エラー', (e as Error).message);
      }
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const mutuals = edges.filter((e) => e.i_follow && e.follows_me);
  const audienceCount = mutuals.filter((e) => e.in_my_visibility).length;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: '起床予定時刻' }} />
      <Text style={styles.intro}>
        起きる時刻と、寝坊した時に通知する相手を設定します。
        {'\n'}+15分過ぎても「おはよう」が押されていない時、選んだ相手に「まだ起きていません」と通知します。
      </Text>

      <Text style={styles.sectionLabel}>— 時刻（毎日）</Text>
      <TimePicker value={time} onChange={saveTime} />
      <Pressable
        style={styles.confirmBtn}
        onPress={() => saveTime(time)}
        disabled={busy}
      >
        <Text style={styles.confirmBtnText}>{busy ? '...' : '保存'}</Text>
      </Pressable>
      <Text style={styles.note}>
        {hasTarget ? `現在の予定: 毎日 ${fmt(time)}` : '未設定です'}
      </Text>
      {hasTarget && (
        <Pressable style={styles.ghostBtn} onPress={clearTime} disabled={busy}>
          <Text style={styles.ghostBtnText}>予定を解除する</Text>
        </Pressable>
      )}
      <Text style={styles.fineprint}>
        曜日別の設定は今後のアップデートで対応します。
      </Text>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>— 通知する相手</Text>
      <Text style={styles.audienceHint}>
        相互フォロワーから選びます。{audienceCount}人 を選択中。
        {'\n'}選んだ人にはあなたの「起きた」も見えるようになります（公開リストと共通）。
      </Text>

      {mutuals.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            まだ相互フォロワーがいません。
          </Text>
          <Link href="/follow" asChild>
            <Pressable style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>友達を追加 →</Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        mutuals.map((e) => {
          const on = e.in_my_visibility;
          const pending = togglingId === e.user.id;
          return (
            <View key={e.user.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{e.user.display_name}</Text>
                <Text style={styles.rowHandle}>@{e.user.handle}</Text>
              </View>
              <Switch
                value={on}
                onValueChange={() => toggleAudience(e.user.id, on)}
                disabled={pending}
                trackColor={{ false: theme.bgWarm, true: theme.accent }}
                thumbColor={theme.bg}
              />
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 24, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  intro: { fontSize: 13, color: theme.inkSoft, lineHeight: 22, marginBottom: 24 },
  sectionLabel: { fontSize: 11, letterSpacing: 2, color: theme.accent, marginBottom: 12 },
  confirmBtn: {
    backgroundColor: theme.ink,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmBtnText: { color: theme.bg, fontSize: 14, fontWeight: '600', letterSpacing: 2 },
  note: { fontSize: 13, color: theme.inkSoft, marginTop: 18 },
  fineprint: { fontSize: 11, color: theme.inkSoft, marginTop: 12, letterSpacing: 1 },
  ghostBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: theme.ink,
    padding: 14,
    alignItems: 'center',
  },
  ghostBtnText: { color: theme.ink, fontSize: 14, letterSpacing: 2 },
  divider: {
    height: 1,
    backgroundColor: theme.ink,
    opacity: 0.2,
    marginVertical: 28,
  },
  audienceHint: { fontSize: 12, color: theme.inkSoft, lineHeight: 20, marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: theme.bgWarm,
    borderWidth: 1,
    borderColor: theme.ink,
    marginBottom: 8,
  },
  rowName: { fontSize: 16, color: theme.ink, fontWeight: '600' },
  rowHandle: { fontSize: 12, color: theme.inkSoft, marginTop: 2 },
  emptyBox: {
    padding: 18,
    borderWidth: 1,
    borderColor: theme.ink,
    backgroundColor: theme.bgWarm,
    alignItems: 'center',
  },
  emptyText: { fontSize: 13, color: theme.inkSoft, marginBottom: 12 },
  linkBtn: { padding: 10 },
  linkBtnText: { color: theme.accentDeep, fontSize: 13, letterSpacing: 1 },
});
