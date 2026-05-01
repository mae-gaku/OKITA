import { Link, Stack } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, type BillingStatus, type Plan } from '@/api';
import { useAuth } from '@/auth';
import { theme } from '@/theme';

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  family: 'Family',
};

type RowProps = { href: any; title: string; hint: string };

function MenuRow({ href, title, hint }: RowProps) {
  return (
    <Link href={href} asChild>
      <Pressable style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
      </Pressable>
    </Link>
  );
}

async function devSetPlan(plan: Plan): Promise<BillingStatus> {
  return api<BillingStatus>('/billing/dev-upgrade', {
    method: 'POST',
    body: { plan },
  });
}

export default function MeMenuScreen() {
  const { user, signOut, refreshUser } = useAuth();
  const plan = user?.plan ?? 'free';
  const planLabel = PLAN_LABEL[plan] ?? plan;
  const isFree = plan === 'free';

  function openProSheet() {
    if (!__DEV__) {
      Alert.alert('Pro にする', '課金は準備中です。Phase 3b で有効化されます。');
      return;
    }
    Alert.alert(
      '(dev) プラン切替',
      '本番では非公開の開発用 API を呼びます。サーバが OKITA_ENV != production である必要があります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'Pro',
          onPress: async () => {
            try {
              await devSetPlan('pro');
              await refreshUser();
            } catch (e) {
              Alert.alert('失敗', (e as Error).message);
            }
          },
        },
        {
          text: 'Family',
          onPress: async () => {
            try {
              await devSetPlan('family');
              await refreshUser();
            } catch (e) {
              Alert.alert('失敗', (e as Error).message);
            }
          },
        },
      ],
    );
  }

  async function devDowngrade() {
    try {
      await devSetPlan('free');
      await refreshUser();
    } catch (e) {
      Alert.alert('失敗', (e as Error).message);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 24 }}>
      <Stack.Screen options={{ title: '設定' }} />
      <View style={styles.header}>
        <Text style={styles.name}>{user?.display_name}</Text>
        <Text style={styles.handle}>@{user?.handle}</Text>
      </View>

      <Text style={styles.sectionLabel}>— プラン</Text>
      <View style={styles.planCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.planLabel}>現在のプラン</Text>
          <Text style={styles.planValue}>{planLabel}</Text>
          {isFree && (
            <Text style={styles.planHint}>
              公開リスト 3 人 / 起床予定 1 パターン / ログ直近 7 日
            </Text>
          )}
        </View>
        {isFree ? (
          <Pressable style={styles.upgradeBtn} onPress={openProSheet}>
            <Text style={styles.upgradeText}>{__DEV__ ? '(dev) Pro' : 'Pro にする'}</Text>
          </Pressable>
        ) : __DEV__ ? (
          <Pressable style={styles.ghostDownBtn} onPress={devDowngrade}>
            <Text style={styles.ghostDownText}>(dev) Free</Text>
          </Pressable>
        ) : null}
      </View>
      {__DEV__ && (
        <Text style={styles.devNote}>
          開発ビルドのみ、サーバの /billing/dev-upgrade で plan を切り替えられます。本番ビルドでは表示も API も無効です。
        </Text>
      )}

      <Text style={styles.sectionLabel}>— 朝の設定</Text>
      <MenuRow
        href="/me/wake-target"
        title="起床予定時刻"
        hint="曜日別の目安時刻を設定。+15分過ぎても未起床なら公開先に通知"
      />

      <Text style={styles.sectionLabel}>— 共有の範囲</Text>
      <MenuRow
        href="/me/visibility"
        title="朝を見せる相手"
        hint="自分の起床を見せていい人のリスト（相手には伝わらない）"
      />
      <MenuRow
        href="/me/mute"
        title="今日は見せない"
        hint="当日だけ全員 / 特定の相手をミュート"
      />

      <Text style={styles.sectionLabel}>— 家族</Text>
      <MenuRow
        href="/me/family"
        title="家族グループ"
        hint="最大 6 人。親が代理で公開リスト設定 / 子の +45 分未起床で親に追加通知"
      />

      <Text style={styles.sectionLabel}>— 招待</Text>
      <MenuRow
        href="/me/invite"
        title="友達を招待"
        hint="招待リンク・紹介コードを SMS / iMessage / SNS で共有"
      />

      <Text style={styles.sectionLabel}>— 履歴</Text>
      <MenuRow
        href="/me/log"
        title="起床ログ"
        hint="連続記録・最長・カレンダー表示"
      />

      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>ログアウト</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { marginBottom: 28 },
  name: { fontSize: 26, color: theme.ink, fontWeight: '700' },
  handle: { fontSize: 13, color: theme.inkSoft, marginTop: 2 },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 2,
    color: theme.accent,
    marginTop: 18,
    marginBottom: 8,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: theme.bgWarm,
    borderWidth: 1,
    borderColor: theme.ink,
    marginBottom: 8,
  },
  title: { fontSize: 16, color: theme.ink, fontWeight: '600' },
  hint: { fontSize: 12, color: theme.inkSoft, marginTop: 3, lineHeight: 18 },
  arrow: { fontSize: 18, color: theme.accent },
  signOut: {
    marginTop: 32,
    padding: 14,
    alignItems: 'center',
  },
  signOutText: { color: theme.accentDeep, fontSize: 13, letterSpacing: 2 },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: theme.bgWarm,
    borderWidth: 1,
    borderColor: theme.ink,
    marginBottom: 8,
    gap: 12,
  },
  planLabel: { fontSize: 11, color: theme.inkSoft, letterSpacing: 1 },
  planValue: { fontSize: 18, color: theme.ink, fontWeight: '700', marginTop: 2 },
  planHint: { fontSize: 11, color: theme.inkSoft, marginTop: 6, lineHeight: 16 },
  upgradeBtn: {
    backgroundColor: theme.ink,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.ink,
  },
  upgradeText: { color: theme.bg, fontSize: 12, letterSpacing: 1, fontWeight: '600' },
  ghostDownBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.ink,
  },
  ghostDownText: { color: theme.ink, fontSize: 12, letterSpacing: 1 },
  devNote: { fontSize: 10, color: theme.inkSoft, marginBottom: 8, lineHeight: 14 },
});
