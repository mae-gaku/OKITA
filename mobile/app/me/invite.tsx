import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api, type RedeemResult, type Referral } from '@/api';
import { useAuth } from '@/auth';
import { theme } from '@/theme';

export default function InviteScreen() {
  const { user } = useAuth();
  const [ref, setRef] = useState<Referral | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    const r = await api<Referral>('/me/referral');
    setRef(r);
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

  async function shareInvite() {
    if (!ref || !user) return;
    const message =
      `${user.display_name} が起床確認アプリ OKITA に招待しています。\n` +
      `アプリを開いてフォロー: ${ref.handle_url}\n` +
      `紹介コード: ${ref.code} を入力すると Pro 1ヶ月無料 (準備中)`;
    try {
      await Share.share({ message, url: ref.handle_url });
    } catch (e) {
      Alert.alert('共有できません', (e as Error).message);
    }
  }

  async function shareCode() {
    if (!ref) return;
    try {
      await Share.share({ message: `OKITA 紹介コード: ${ref.code}\n${ref.handle_url}` });
    } catch (e) {
      Alert.alert('共有できません', (e as Error).message);
    }
  }

  async function redeem() {
    const trimmed = code.trim();
    if (!trimmed) return;
    setRedeemBusy(true);
    try {
      const r = await api<RedeemResult>('/referrals/redeem', {
        body: { code: trimmed },
      });
      Alert.alert(
        '紹介を登録しました',
        `紹介者: @${r.referrer_handle}\nPro 1ヶ月無料の付与は課金有効化後に反映されます。`,
      );
      setCode('');
    } catch (e) {
      Alert.alert('登録できません', (e as Error).message);
    } finally {
      setRedeemBusy(false);
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
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 24 }}>
      <Stack.Screen options={{ title: '友達を招待' }} />

      <Text style={styles.intro}>
        家族や友達に OKITA を共有しましょう。相手がアプリを入れたあと、紹介コードを使うと両方とも Pro 1ヶ月無料になります（課金有効化後）。
      </Text>

      <Text style={styles.sectionLabel}>— あなたの招待リンク</Text>
      <View style={styles.card}>
        <Text style={styles.label}>リンク</Text>
        <Text style={styles.url}>{ref?.handle_url}</Text>
        <Pressable style={styles.btnPrimary} onPress={shareInvite}>
          <Text style={styles.btnPrimaryText}>SMS / iMessage / SNS で共有</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>— あなたの紹介コード</Text>
      <View style={styles.card}>
        <Text style={styles.code}>{ref?.code}</Text>
        <Pressable style={styles.btnGhost} onPress={shareCode}>
          <Text style={styles.btnGhostText}>コードを共有</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>— 紹介コードを使う</Text>
      <View style={styles.card}>
        <Text style={styles.hint}>
          知り合いから受け取ったコードを入力すると、お互いに Pro 1ヶ月無料 (準備中) です。1 アカウント 1 回まで。
        </Text>
        <TextInput
          style={styles.input}
          placeholder="例: aB3xY-_z"
          placeholderTextColor={theme.inkSoft}
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!redeemBusy}
        />
        <Pressable
          style={[styles.btnPrimary, !code.trim() && styles.btnDisabled]}
          onPress={redeem}
          disabled={redeemBusy || !code.trim()}
        >
          <Text style={styles.btnPrimaryText}>{redeemBusy ? '...' : '登録する'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  intro: { fontSize: 13, color: theme.inkSoft, lineHeight: 20, marginBottom: 18 },
  sectionLabel: { fontSize: 11, letterSpacing: 2, color: theme.accent, marginBottom: 8, marginTop: 14, fontWeight: '600' },
  card: {
    borderWidth: 1,
    borderColor: theme.ink,
    backgroundColor: theme.bgWarm,
    padding: 14,
  },
  label: { fontSize: 11, color: theme.inkSoft, letterSpacing: 1 },
  url: { fontSize: 13, color: theme.ink, marginTop: 4, marginBottom: 10 },
  code: {
    fontSize: 28, color: theme.ink, fontWeight: '800',
    letterSpacing: 4, textAlign: 'center', marginVertical: 8,
  },
  hint: { fontSize: 12, color: theme.inkSoft, lineHeight: 18, marginBottom: 10 },
  input: {
    borderWidth: 1, borderColor: theme.ink, backgroundColor: theme.bg,
    paddingHorizontal: 12, paddingVertical: 10, color: theme.ink,
    fontSize: 15, marginBottom: 10,
  },
  btnPrimary: { backgroundColor: theme.ink, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', flex: 1 },
  btnPrimaryText: { color: theme.bg, fontSize: 13, letterSpacing: 1, fontWeight: '600' },
  btnGhost: { borderWidth: 1, borderColor: theme.ink, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', flex: 1 },
  btnGhostText: { color: theme.ink, fontSize: 13, letterSpacing: 1 },
  btnDisabled: { opacity: 0.4 },
});
