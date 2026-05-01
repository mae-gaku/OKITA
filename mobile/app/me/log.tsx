import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, type Streak, type WakeLogDay } from '@/api';
import { theme } from '@/theme';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtMonth(year: number, month: number): string {
  return `${year}年 ${month + 1}月`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export default function WakeLogScreen() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [days, setDays] = useState<WakeLogDay[]>([]);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const [log, s] = await Promise.all([
      api<WakeLogDay[]>(`/me/wake-log?from=${fmtDate(start)}&to=${fmtDate(end)}`),
      api<Streak>('/me/streak'),
    ]);
    setDays(log);
    setStreak(s);
  }, [cursor]);

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

  const wokeSet = useMemo(() => new Set(days.map((d) => d.date)), [days]);
  const sourceMap = useMemo(() => {
    const m: Record<string, 'self' | 'request'> = {};
    for (const d of days) m[d.date] = d.source;
    return m;
  }, [days]);

  const grid = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const cells: (Date | null)[] = [];
    for (let i = 0; i < start.getDay(); i++) cells.push(null);
    for (let day = 1; day <= end.getDate(); day++) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const today = fmtDate(new Date());

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 24 }}>
      <Stack.Screen options={{ title: '起床ログ' }} />

      <View style={styles.summary}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bigNum}>{streak?.current ?? 0}</Text>
          <Text style={styles.bigLabel}>日連続</Text>
        </View>
        <View style={styles.summarySide}>
          <Text style={styles.sideNum}>{streak?.longest ?? 0}</Text>
          <Text style={styles.sideLabel}>最長</Text>
        </View>
        <View style={styles.summarySide}>
          <Text style={styles.sideNum}>{streak?.total_wakes ?? 0}</Text>
          <Text style={styles.sideLabel}>累計</Text>
        </View>
      </View>

      <View style={styles.monthHead}>
        <Pressable
          hitSlop={12}
          onPress={() =>
            setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
          }
        >
          <Text style={styles.navArrow}>←</Text>
        </Pressable>
        <Text style={styles.monthLabel}>
          {fmtMonth(cursor.getFullYear(), cursor.getMonth())}
        </Text>
        <Pressable
          hitSlop={12}
          onPress={() =>
            setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
          }
        >
          <Text style={styles.navArrow}>→</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekHead}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={styles.cell} />;
          const key = fmtDate(d);
          const woke = wokeSet.has(key);
          const isToday = key === today;
          const source = sourceMap[key];
          return (
            <View key={key} style={[styles.cell, isToday && styles.cellToday]}>
              <Text
                style={[
                  styles.cellNum,
                  isToday && styles.cellNumToday,
                  woke && styles.cellNumWoke,
                ]}
              >
                {d.getDate()}
              </Text>
              {woke && (
                <View
                  style={[
                    styles.dot,
                    source === 'request' && styles.dotRequest,
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View style={styles.dot} />
          <Text style={styles.legendText}>「おはよう」自発タップ</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.dot, styles.dotRequest]} />
          <Text style={styles.legendText}>お願いに応答</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const CELL = 44;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  summary: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 18,
    borderWidth: 2,
    borderColor: theme.ink,
    backgroundColor: theme.bgWarm,
    marginBottom: 24,
  },
  bigNum: { fontSize: 56, fontWeight: '800', color: theme.accent, letterSpacing: -3 },
  bigLabel: { fontSize: 12, color: theme.inkSoft, letterSpacing: 2, marginTop: -8 },
  summarySide: { alignItems: 'center', marginLeft: 18 },
  sideNum: { fontSize: 22, fontWeight: '700', color: theme.ink },
  sideLabel: { fontSize: 10, color: theme.inkSoft, letterSpacing: 1, marginTop: 2 },
  monthHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  navArrow: { fontSize: 22, color: theme.ink, paddingHorizontal: 8 },
  monthLabel: { fontSize: 18, fontWeight: '600', color: theme.ink, letterSpacing: 1 },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekHead: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: theme.inkSoft,
    letterSpacing: 1,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    height: CELL + 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: theme.inkSoft,
  },
  cellToday: { backgroundColor: theme.bgWarm },
  cellNum: { fontSize: 13, color: theme.ink, fontWeight: '500' },
  cellNumToday: { color: theme.accent, fontWeight: '700' },
  cellNumWoke: { color: theme.ink, fontWeight: '700' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.accent,
    marginTop: 4,
  },
  dotRequest: { backgroundColor: theme.accentDeep },
  legend: { marginTop: 24, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendText: { fontSize: 12, color: theme.inkSoft },
});
