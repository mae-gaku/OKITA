import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, isPaymentRequired, type FollowEdge, type UserPublic } from '@/api';
import { theme } from '@/theme';

export default function VisibilityScreen() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<UserPublic[]>([]);
  const [mutuals, setMutuals] = useState<FollowEdge[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [v, edges] = await Promise.all([
      api<UserPublic[]>('/visibility'),
      api<FollowEdge[]>('/follows'),
    ]);
    setAllowed(v);
    setMutuals(edges.filter((e) => e.i_follow && e.follows_me));
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

  async function add(userId: number) {
    try {
      await api('/visibility', { body: { viewer_id: userId } });
      await load();
    } catch (e) {
      if (isPaymentRequired(e)) {
        Alert.alert(
          'Pro が必要です',
          'Free プランの公開リストは 3 人まで。Pro にアップグレードすると上限が無くなります。\n（課金は Phase 3 で有効化）',
        );
        return;
      }
      Alert.alert('エラー', (e as Error).message);
    }
  }

  async function remove(userId: number) {
    try {
      await api(`/visibility/${userId}`, { method: 'DELETE' });
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

  const allowedIds = new Set(allowed.map((u) => u.id));
  const candidates = mutuals.filter((e) => !allowedIds.has(e.user.id));

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: '公開リスト' }} />
      <Text style={styles.intro}>
        ここに入れた人だけが、あなたの「起きた」とお願い予約を扱えます。相手には伝わりません（あなたが選ぶだけ）。
      </Text>

      <Text style={styles.sectionLabel}>— ALLOWED ({allowed.length})</Text>
      <FlatList
        data={allowed}
        keyExtractor={(u) => `a-${u.id}`}
        scrollEnabled={false}
        ListEmptyComponent={<Text style={styles.empty}>まだ誰も入れていません</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={{ flex: 1 }} onPress={() => router.push(`/user/${item.id}`)}>
              <Text style={styles.name}>{item.display_name}</Text>
              <Text style={styles.handle}>@{item.handle}</Text>
            </Pressable>
            <Pressable onPress={() => remove(item.id)} style={styles.btnGhost}>
              <Text style={styles.btnGhostText}>外す</Text>
            </Pressable>
          </View>
        )}
      />

      {candidates.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>
            — MUTUAL FOLLOWERS（追加できる）
          </Text>
          <FlatList
            data={candidates}
            keyExtractor={(e) => `c-${e.user.id}`}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/user/${item.user.id}`)}>
                  <Text style={styles.name}>{item.user.display_name}</Text>
                  <Text style={styles.handle}>@{item.user.handle}</Text>
                </Pressable>
                <Pressable onPress={() => add(item.user.id)} style={styles.btnPrimary}>
                  <Text style={styles.btnPrimaryText}>追加</Text>
                </Pressable>
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
  btnPrimary: { backgroundColor: theme.ink, paddingHorizontal: 14, paddingVertical: 7 },
  btnPrimaryText: { color: theme.bg, fontSize: 12, letterSpacing: 1 },
  btnGhost: { borderWidth: 1, borderColor: theme.ink, paddingHorizontal: 14, paddingVertical: 7 },
  btnGhostText: { color: theme.ink, fontSize: 12, letterSpacing: 1 },
});
