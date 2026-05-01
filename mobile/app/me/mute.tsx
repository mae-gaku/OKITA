import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { api, type UserPublic } from '@/api';
import { theme } from '@/theme';

type MuteRow = { viewer_id: number | null; muted_date: string };

export default function MuteScreen() {
  const [allowed, setAllowed] = useState<UserPublic[]>([]);
  const [mutes, setMutes] = useState<MuteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [v, m] = await Promise.all([
      api<UserPublic[]>('/visibility'),
      api<MuteRow[]>('/mute/today'),
    ]);
    setAllowed(v);
    setMutes(m);
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

  const allMuted = mutes.some((m) => m.viewer_id === null);
  const mutedSet = new Set(mutes.filter((m) => m.viewer_id !== null).map((m) => m.viewer_id!));

  async function toggleAll(value: boolean) {
    try {
      if (value) {
        await api('/mute/today', { body: {} });
      } else {
        await api('/mute/today', { method: 'DELETE' });
      }
      await load();
    } catch (e) {
      Alert.alert('エラー', (e as Error).message);
    }
  }

  async function toggleOne(viewerId: number, value: boolean) {
    try {
      if (value) {
        await api('/mute/today', { body: { viewer_id: viewerId } });
      } else {
        await api(`/mute/today?viewer_id=${viewerId}`, { method: 'DELETE' });
      }
      await load();
    } catch (e) {
      Alert.alert('エラー', (e as Error).message);
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
      <Stack.Screen options={{ title: '今日のミュート' }} />
      <Text style={styles.intro}>
        今日だけ自分の起床を見せない。日付が変われば自動で解除されます。
      </Text>

      <View style={styles.allBox}>
        <View style={{ flex: 1 }}>
          <Text style={styles.allLabel}>全員に見せない</Text>
          <Text style={styles.allHint}>公開リストの全員ミュート</Text>
        </View>
        <Switch
          value={allMuted}
          onValueChange={toggleAll}
          trackColor={{ false: theme.bgWarm, true: theme.accent }}
          thumbColor={theme.bg}
        />
      </View>

      {!allMuted && (
        <>
          <Text style={styles.sectionLabel}>— 個別に</Text>
          <FlatList
            data={allowed}
            keyExtractor={(u) => String(u.id)}
            ListEmptyComponent={<Text style={styles.empty}>公開リストが空です</Text>}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.display_name}</Text>
                  <Text style={styles.handle}>@{item.handle}</Text>
                </View>
                <Switch
                  value={mutedSet.has(item.id)}
                  onValueChange={(v) => toggleOne(item.id, v)}
                  trackColor={{ false: theme.bgWarm, true: theme.accent }}
                  thumbColor={theme.bg}
                />
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  intro: { fontSize: 13, color: theme.inkSoft, lineHeight: 20, marginBottom: 16 },
  allBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 2,
    borderColor: theme.ink,
    backgroundColor: theme.bgWarm,
    marginBottom: 20,
  },
  allLabel: { fontSize: 16, color: theme.ink, fontWeight: '600' },
  allHint: { fontSize: 12, color: theme.inkSoft, marginTop: 2 },
  sectionLabel: { fontSize: 11, letterSpacing: 2, color: theme.accent, marginBottom: 8 },
  empty: { color: theme.inkSoft, fontSize: 13, padding: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.inkSoft,
  },
  name: { fontSize: 16, color: theme.ink, fontWeight: '600' },
  handle: { fontSize: 12, color: theme.inkSoft, marginTop: 2 },
});
