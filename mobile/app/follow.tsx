import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api, type FollowEdge, type UserPublic } from '@/api';
import { theme } from '@/theme';

export default function FollowScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserPublic[]>([]);
  const [edges, setEdges] = useState<Record<number, FollowEdge>>({});
  const [searching, setSearching] = useState(false);
  const [following, setFollowing] = useState<FollowEdge[]>([]);

  useEffect(() => {
    loadEdges();
  }, []);

  async function loadEdges() {
    try {
      const all = await api<FollowEdge[]>('/follows');
      const next: Record<number, FollowEdge> = {};
      for (const e of all) next[e.user.id] = e;
      setEdges(next);
      setFollowing(all);
    } catch {}
  }

  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await api<UserPublic[]>(`/users/search?q=${encodeURIComponent(query.trim())}`);
        if (!cancelled) setResults(res);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  async function follow(userId: number) {
    try {
      const edge = await api<FollowEdge>('/follows', { body: { user_id: userId } });
      setEdges((prev) => ({ ...prev, [userId]: edge }));
      await loadEdges();
    } catch (e) {
      Alert.alert('エラー', (e as Error).message);
    }
  }

  async function unfollow(userId: number) {
    try {
      await api(`/follows/${userId}`, { method: 'DELETE' });
      setEdges((prev) => {
        const { [userId]: _drop, ...rest } = prev;
        return rest;
      });
      await loadEdges();
    } catch (e) {
      Alert.alert('エラー', (e as Error).message);
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: '友達を追加' }} />
      <TextInput
        placeholder="ユーザーIDか名前で検索（例: @gaku）"
        placeholderTextColor={theme.inkSoft}
        autoCapitalize="none"
        autoCorrect={false}
        value={query}
        onChangeText={setQuery}
        style={styles.input}
      />
      {searching && <ActivityIndicator color={theme.accent} style={{ marginVertical: 8 }} />}

      {query.trim() ? (
        <FlatList
          data={results}
          keyExtractor={(u) => String(u.id)}
          ListEmptyComponent={
            !searching ? <Text style={styles.empty}>該当ユーザーなし</Text> : null
          }
          renderItem={({ item }) => {
            const edge = edges[item.id];
            return (
              <Row
                user={item}
                edge={edge}
                onFollow={() => follow(item.id)}
                onUnfollow={() => unfollow(item.id)}
              />
            );
          }}
        />
      ) : (
        <>
          <Text style={styles.sectionLabel}>— FOLLOW</Text>
          <FlatList
            data={following}
            keyExtractor={(e) => String(e.user.id)}
            ListEmptyComponent={<Text style={styles.empty}>まだフォローしていません</Text>}
            renderItem={({ item }) => (
              <Row
                user={item.user}
                edge={item}
                onFollow={() => follow(item.user.id)}
                onUnfollow={() => unfollow(item.user.id)}
              />
            )}
          />
        </>
      )}
    </View>
  );
}

function Row({
  user,
  edge,
  onFollow,
  onUnfollow,
}: {
  user: UserPublic;
  edge?: FollowEdge;
  onFollow: () => void;
  onUnfollow: () => void;
}) {
  const iFollow = edge?.i_follow ?? false;
  const followsMe = edge?.follows_me ?? false;
  const mutual = iFollow && followsMe;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{user.display_name}</Text>
        <Text style={styles.handle}>@{user.handle}</Text>
        {mutual && <Text style={styles.mutual}>相互フォロー中</Text>}
        {!mutual && followsMe && <Text style={styles.hint}>フォローされています</Text>}
      </View>
      {iFollow ? (
        <Pressable onPress={onUnfollow} style={styles.btnGhost} hitSlop={6}>
          <Text style={styles.btnGhostText}>解除</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onFollow} style={styles.btnPrimary} hitSlop={6}>
          <Text style={styles.btnPrimaryText}>フォロー</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, padding: 24 },
  input: {
    borderWidth: 1,
    borderColor: theme.ink,
    backgroundColor: theme.bgWarm,
    padding: 14,
    fontSize: 16,
    color: theme.ink,
    marginBottom: 12,
  },
  sectionLabel: { fontSize: 11, letterSpacing: 2, color: theme.accent, marginVertical: 12 },
  empty: { color: theme.inkSoft, fontSize: 14, padding: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.inkSoft,
  },
  name: { fontSize: 16, color: theme.ink, fontWeight: '600' },
  handle: { fontSize: 12, color: theme.inkSoft, marginTop: 2 },
  mutual: { fontSize: 11, color: theme.accent, marginTop: 4, letterSpacing: 1 },
  hint: { fontSize: 11, color: theme.inkSoft, marginTop: 4 },
  btnPrimary: { backgroundColor: theme.ink, paddingHorizontal: 16, paddingVertical: 8 },
  btnPrimaryText: { color: theme.bg, fontSize: 13, letterSpacing: 1 },
  btnGhost: { borderWidth: 1, borderColor: theme.ink, paddingHorizontal: 16, paddingVertical: 8 },
  btnGhostText: { color: theme.ink, fontSize: 13, letterSpacing: 1 },
});
