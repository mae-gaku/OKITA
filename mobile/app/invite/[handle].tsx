import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type InviteHandleInfo } from '@/api';
import { useAuth } from '@/auth';
import { theme } from '@/theme';

export default function InviteHandleScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [info, setInfo] = useState<InviteHandleInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api<InviteHandleInfo>(`/invite/${handle}`, { auth: false });
        if (!cancelled) setInfo(r);
      } catch (e) {
        if (!cancelled) {
          Alert.alert('見つかりません', (e as Error).message, [
            { text: 'OK', onPress: () => router.replace('/') },
          ]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle, router]);

  async function startFollow() {
    if (!info) return;
    setBusy(true);
    try {
      // ログインしていなければログイン画面へ。戻ってきたあと再度この画面に来れば続きから
      if (!user) {
        router.replace('/(auth)/sign-in');
        return;
      }
      // /follows API は handle 指定で OK
      await api('/follows', { body: { handle: info.handle } });
      Alert.alert('フォローしました', `@${info.handle} をフォローしました。相手も承認すれば相互成立です。`, [
        { text: 'OK', onPress: () => router.replace('/follow') },
      ]);
    } catch (e) {
      Alert.alert('失敗', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading || authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!info) return null;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: '招待' }} />
      <Text style={styles.lead}>OKITA からの招待</Text>
      <Text style={styles.name}>{info.display_name}</Text>
      <Text style={styles.handle}>@{info.handle}</Text>
      <Text style={styles.body}>
        この人をフォローすると、お互いに「起きた」を見られるようになります（相互成立後）。
      </Text>
      <Pressable style={styles.btnPrimary} onPress={startFollow} disabled={busy}>
        <Text style={styles.btnPrimaryText}>
          {busy ? '...' : user ? `@${info.handle} をフォロー` : 'ログインして続ける'}
        </Text>
      </Pressable>
      <Pressable style={styles.btnGhost} onPress={() => router.replace('/')}>
        <Text style={styles.btnGhostText}>あとで</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, padding: 24, justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  lead: { color: theme.inkSoft, fontSize: 12, letterSpacing: 2, marginBottom: 6 },
  name: { color: theme.ink, fontSize: 32, fontWeight: '800' },
  handle: { color: theme.inkSoft, fontSize: 14, marginTop: 4, marginBottom: 18 },
  body: { color: theme.ink, fontSize: 14, lineHeight: 22, marginBottom: 28 },
  btnPrimary: { backgroundColor: theme.ink, padding: 16, alignItems: 'center', marginBottom: 10 },
  btnPrimaryText: { color: theme.bg, fontSize: 14, letterSpacing: 2, fontWeight: '600' },
  btnGhost: { borderWidth: 1, borderColor: theme.ink, padding: 14, alignItems: 'center' },
  btnGhostText: { color: theme.ink, fontSize: 13, letterSpacing: 1 },
});
