import { Link, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, type HomeState, type Streak, type TimelineItem } from '@/api';
import { useAuth } from '@/auth';
import { TimePicker } from '@/pickers';
import { theme } from '@/theme';

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export default function HomeDetailScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [home, setHome] = useState<HomeState | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customTime, setCustomTime] = useState<Date>(() => new Date());

  const load = useCallback(async () => {
    const [h, s] = await Promise.all([
      api<HomeState>('/home'),
      api<Streak>('/me/streak'),
    ]);
    setHome(h);
    setStreak(s);
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
      setCustomMode(false);
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

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>こんにちは、</Text>
          <Text style={styles.name}>{user?.display_name}</Text>
          <Text style={styles.handle}>@{user?.handle}</Text>
        </View>
        <Link href="/me" asChild>
          <Pressable hitSlop={8}>
            <Text style={styles.signOut}>設定</Text>
          </Pressable>
        </Link>
      </View>

      <Link href="/me/log" asChild>
        <Pressable style={styles.streakBox}>
          <View style={styles.streakInner}>
            <View style={styles.streakBig}>
              <Text style={styles.streakNum}>{streak?.current ?? 0}</Text>
              <Text style={styles.streakUnit}>日連続</Text>
            </View>
            <View style={styles.streakSide}>
              <View>
                <Text style={styles.streakSideNum}>{streak?.longest ?? 0}</Text>
                <Text style={styles.streakSideLabel}>最長</Text>
              </View>
              <View>
                <Text style={styles.streakSideNum}>{streak?.total_wakes ?? 0}</Text>
                <Text style={styles.streakSideLabel}>累計</Text>
              </View>
            </View>
          </View>
          <Text style={styles.streakHint}>タップで起床ログを見る →</Text>
        </Pressable>
      </Link>

      <Link href="/me/wake-target" asChild>
        <Pressable style={styles.targetChip} hitSlop={6}>
          <Text style={styles.targetChipLabel}>今日の起床予定</Text>
          <Text style={styles.targetChipValue}>
            {home?.paused_today
              ? '今日は休む中'
              : home?.today_target_minutes != null
                ? fmtMinutes(home.today_target_minutes)
                : '未設定'}
          </Text>
          <Text style={styles.targetChipArrow}>編集 →</Text>
        </Pressable>
      </Link>

      <Pressable
        style={[styles.morningBtn, home?.woke_today ? styles.morningBtnDone : null]}
        onPress={() => selfTap()}
        disabled={busy || home?.woke_today}
      >
        <Text style={[styles.morningText, home?.woke_today && styles.morningTextDone]}>
          {home?.woke_today ? '今日は ✓ 起きた' : 'おはよう（タップ）'}
        </Text>
        <Text style={styles.morningHint}>
          {home?.woke_today
            ? '公開リストの人に伝わっています'
            : '公開リストの人に「起きた」を一斉に伝える'}
        </Text>
      </Pressable>

      {!home?.woke_today && (
        <View style={styles.customRow}>
          {!customMode ? (
            <Pressable
              hitSlop={6}
              onPress={() => {
                setCustomTime(new Date());
                setCustomMode(true);
              }}
            >
              <Text style={styles.customLink}>別の時刻で記録する →</Text>
            </Pressable>
          ) : (
            <View style={styles.customBox}>
              <Text style={styles.customLabel}>記録する時刻（今日中、24時間以内）</Text>
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
        </View>
      )}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>— 見える人</Text>
        <Link href="/me/visibility" asChild>
          <Pressable hitSlop={6}>
            <Text style={styles.smallLink}>公開リスト編集</Text>
          </Pressable>
        </Link>
      </View>

      <FlatList
        data={home?.timeline ?? []}
        keyExtractor={(t) => String(t.user.id)}
        scrollEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            まだ誰も見えていません。フォローして相互になれば、相手の公開リストに入ったとき、その人の朝が見えるようになります。
          </Text>
        }
        renderItem={({ item }) => <TimelineRow item={item} onPress={() => router.push(`/user/${item.user.id}`)} />}
      />

      <View style={styles.actions}>
        <View style={styles.actionRow}>
          <Link href="/follow" asChild>
            <Pressable style={styles.actionHalf}>
              <Text style={styles.actionSecondaryText}>友達を追加</Text>
            </Pressable>
          </Link>
          <Link href="/tap" asChild>
            <Pressable style={styles.actionHalf}>
              <Text style={styles.actionSecondaryText}>← ホームに戻る</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}

function TimelineRow({ item, onPress }: { item: TimelineItem; onPress: () => void }) {
  const status = item.muted_today
    ? { label: 'お休み中', color: theme.inkSoft }
    : item.woke_at
      ? { label: `${fmtTime(item.woke_at)} に起床 ✓`, color: theme.accent }
      : item.is_overdue
        ? { label: '予定時刻を過ぎています', color: theme.accentDeep }
        : { label: 'まだ', color: theme.ink };
  const targetLabel =
    item.today_target_minutes != null ? `予定 ${fmtMinutes(item.today_target_minutes)}` : null;
  return (
    <Pressable style={styles.pairCard} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pairName}>{item.user.display_name}</Text>
        <Text style={styles.pairHandle}>@{item.user.handle}</Text>
        <View style={styles.pairStatusRow}>
          <Text style={[styles.pairStatus, { color: status.color }]}>{status.label}</Text>
          {targetLabel && <Text style={styles.pairTarget}>{targetLabel}</Text>}
        </View>
      </View>
      <Text style={styles.pairArrow}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 20,
    marginTop: 12,
  },
  greeting: { color: theme.inkSoft, fontSize: 14 },
  name: { color: theme.ink, fontSize: 26, fontWeight: '700' },
  handle: { color: theme.inkSoft, fontSize: 12, marginTop: 2 },
  signOut: { color: theme.inkSoft, fontSize: 12, letterSpacing: 1 },
  streakBox: {
    borderWidth: 2,
    borderColor: theme.ink,
    backgroundColor: theme.bgWarm,
    padding: 16,
    marginBottom: 16,
  },
  streakInner: { flexDirection: 'row', alignItems: 'center' },
  streakBig: { flex: 1, flexDirection: 'row', alignItems: 'baseline' },
  streakNum: { fontSize: 48, fontWeight: '800', color: theme.accent, letterSpacing: -2 },
  streakUnit: { fontSize: 14, color: theme.ink, marginLeft: 8, letterSpacing: 2 },
  streakSide: { flexDirection: 'row', gap: 18 },
  streakSideNum: { fontSize: 18, fontWeight: '700', color: theme.ink, textAlign: 'right' },
  streakSideLabel: { fontSize: 10, color: theme.inkSoft, letterSpacing: 1, textAlign: 'right', marginTop: 2 },
  streakHint: { fontSize: 11, color: theme.inkSoft, marginTop: 10, letterSpacing: 1 },
  morningBtn: {
    backgroundColor: theme.accent,
    padding: 22,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: theme.ink,
  },
  morningBtnDone: { backgroundColor: theme.bgWarm },
  morningText: { color: theme.bg, fontSize: 22, fontWeight: '700', letterSpacing: 4 },
  morningTextDone: { color: theme.ink },
  morningHint: { color: theme.bg, fontSize: 12, marginTop: 4, opacity: 0.85 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabel: { fontSize: 11, letterSpacing: 2, color: theme.accent, fontWeight: '600' },
  smallLink: { fontSize: 11, letterSpacing: 1, color: theme.inkSoft },
  empty: { color: theme.inkSoft, fontSize: 14, lineHeight: 22 },
  pairCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: theme.bgWarm,
    borderWidth: 1,
    borderColor: theme.ink,
    marginBottom: 8,
  },
  pairName: { fontSize: 17, fontWeight: '600', color: theme.ink },
  pairHandle: { fontSize: 11, color: theme.inkSoft, marginTop: 1 },
  pairStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 10 },
  pairStatus: { fontSize: 13, letterSpacing: 1 },
  pairTarget: { fontSize: 11, color: theme.inkSoft, letterSpacing: 1 },
  pairArrow: { fontSize: 20, color: theme.accent },
  targetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.ink,
    backgroundColor: theme.bgWarm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  targetChipLabel: { fontSize: 11, color: theme.inkSoft, letterSpacing: 1 },
  targetChipValue: { fontSize: 18, fontWeight: '700', color: theme.ink, letterSpacing: 2 },
  targetChipArrow: { fontSize: 11, color: theme.accentDeep, letterSpacing: 1 },
  actions: { gap: 10, marginTop: 'auto', marginBottom: 24 },
  actionRow: { flexDirection: 'row', gap: 10 },
  customRow: { alignItems: 'center', marginTop: -10, marginBottom: 18 },
  customLink: { fontSize: 12, color: theme.accentDeep, letterSpacing: 1, padding: 8 },
  customBox: { width: '100%', padding: 14, borderWidth: 1, borderColor: theme.ink, backgroundColor: theme.bgWarm },
  customLabel: { fontSize: 11, color: theme.accent, letterSpacing: 1, marginBottom: 8 },
  customActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  customCancel: { flex: 1, borderWidth: 1, borderColor: theme.ink, padding: 10, alignItems: 'center' },
  customCancelText: { fontSize: 12, color: theme.ink, letterSpacing: 1 },
  customConfirm: { flex: 2, backgroundColor: theme.ink, padding: 10, alignItems: 'center' },
  customConfirmText: { fontSize: 12, color: theme.bg, letterSpacing: 1 },
  actionHalf: { flex: 1, borderWidth: 1, borderColor: theme.ink, padding: 16, alignItems: 'center' },
  actionSecondaryText: { color: theme.ink, fontSize: 15, fontWeight: '600', letterSpacing: 2 },
});
