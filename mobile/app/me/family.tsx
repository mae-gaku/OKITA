import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api, type FamilyGroup } from '@/api';
import { useAuth } from '@/auth';
import { theme } from '@/theme';

const MAX_MEMBERS = 6;

export default function FamilyScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<FamilyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [addHandle, setAddHandle] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const list = await api<FamilyGroup[]>('/family');
    setGroups(list);
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

  async function createGroup() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await api('/family', { body: { name: newName.trim() } });
      setNewName('');
      await load();
    } catch (e) {
      Alert.alert('作成できません', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addMember(group: FamilyGroup) {
    const handle = (addHandle[group.id] ?? '').trim();
    if (!handle) return;
    setBusy(true);
    try {
      await api(`/family/${group.id}/members`, { body: { handle, role: 'child' } });
      setAddHandle((s) => ({ ...s, [group.id]: '' }));
      await load();
    } catch (e) {
      Alert.alert('追加できません', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(groupId: number, userId: number) {
    setBusy(true);
    try {
      await api(`/family/${groupId}/members/${userId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      Alert.alert('外せません', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function grantVisibility(groupId: number, targetUserId: number, displayName: string) {
    Alert.alert(
      '公開リスト一括設定',
      `${displayName} の公開リストに、家族メンバー全員を追加します。よろしいですか?`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '実行',
          onPress: async () => {
            setBusy(true);
            try {
              await api(`/family/${groupId}/visibility-grant`, {
                body: { target_user_id: targetUserId },
              });
              await load();
              Alert.alert('完了', '公開リストを更新しました。');
            } catch (e) {
              Alert.alert('失敗', (e as Error).message);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  async function deleteGroup(group: FamilyGroup) {
    Alert.alert('家族グループを削除', `「${group.name}」を削除します。元に戻せません。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api(`/family/${group.id}`, { method: 'DELETE' });
            await load();
          } catch (e) {
            Alert.alert('削除できません', (e as Error).message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const isFamilyPlan = user?.plan === 'family';

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 24 }}>
      <Stack.Screen options={{ title: '家族' }} />
      <Text style={styles.intro}>
        家族グループは最大 {MAX_MEMBERS} 人。親が代理で公開リストを一括設定できます。
        子の起床予定 +45 分過ぎても未起床なら、親に追加通知が届きます。
      </Text>

      {isFamilyPlan && (
        <View style={styles.createBox}>
          <Text style={styles.sectionLabel}>— 新しい家族グループを作る</Text>
          <TextInput
            style={styles.input}
            placeholder="例: 山田家"
            placeholderTextColor={theme.inkSoft}
            value={newName}
            onChangeText={setNewName}
            editable={!busy}
          />
          <Pressable
            style={[styles.btnPrimary, !newName.trim() && styles.btnDisabled]}
            onPress={createGroup}
            disabled={busy || !newName.trim()}
          >
            <Text style={styles.btnPrimaryText}>{busy ? '...' : '作成'}</Text>
          </Pressable>
        </View>
      )}

      {!isFamilyPlan && groups.length === 0 && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            家族グループを作るには Family プランが必要です。{'\n'}
            既存のグループに招待されると、ここに表示されます。
          </Text>
        </View>
      )}

      {groups.map((g) => {
        const iAmOwner = g.owner_id === user?.id;
        const myRole = g.members.find((m) => m.user.id === user?.id)?.role;
        const isParent = myRole === 'parent';
        const full = g.members.length >= MAX_MEMBERS;
        return (
          <View key={g.id} style={styles.groupCard}>
            <View style={styles.groupHead}>
              <Text style={styles.groupName}>{g.name}</Text>
              <Text style={styles.groupCount}>
                {g.members.length} / {MAX_MEMBERS}
              </Text>
            </View>

            {g.members.map((m) => (
              <View key={m.user.id} style={styles.memberRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>
                    {m.user.display_name}
                    {m.role === 'parent' ? '  ★親' : ''}
                  </Text>
                  <Text style={styles.memberHandle}>@{m.user.handle}</Text>
                </View>
                {isParent && (
                  <Pressable
                    style={styles.btnGhostSmall}
                    onPress={() => grantVisibility(g.id, m.user.id, m.user.display_name)}
                    disabled={busy}
                  >
                    <Text style={styles.btnGhostSmallText}>公開設定</Text>
                  </Pressable>
                )}
                {(isParent || m.user.id === user?.id) && m.user.id !== g.owner_id && (
                  <Pressable
                    style={styles.btnGhostSmall}
                    onPress={() => removeMember(g.id, m.user.id)}
                    disabled={busy}
                  >
                    <Text style={styles.btnGhostSmallText}>外す</Text>
                  </Pressable>
                )}
              </View>
            ))}

            {isParent && !full && (
              <View style={styles.addRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="追加する @handle"
                  placeholderTextColor={theme.inkSoft}
                  value={addHandle[g.id] ?? ''}
                  onChangeText={(t) =>
                    setAddHandle((s) => ({ ...s, [g.id]: t.replace(/^@/, '') }))
                  }
                  editable={!busy}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  style={styles.btnPrimarySmall}
                  onPress={() => addMember(g)}
                  disabled={busy || !(addHandle[g.id] ?? '').trim()}
                >
                  <Text style={styles.btnPrimaryText}>追加</Text>
                </Pressable>
              </View>
            )}

            {iAmOwner && (
              <Pressable style={styles.deleteBtn} onPress={() => deleteGroup(g)} disabled={busy}>
                <Text style={styles.deleteBtnText}>このグループを削除</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  intro: { fontSize: 13, color: theme.inkSoft, lineHeight: 20, marginBottom: 18 },
  sectionLabel: { fontSize: 11, letterSpacing: 2, color: theme.accent, marginBottom: 8, fontWeight: '600' },
  createBox: {
    borderWidth: 1,
    borderColor: theme.ink,
    backgroundColor: theme.bgWarm,
    padding: 14,
    marginBottom: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.ink,
    backgroundColor: theme.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.ink,
    marginBottom: 10,
    fontSize: 15,
  },
  btnPrimary: { backgroundColor: theme.ink, paddingVertical: 12, alignItems: 'center' },
  btnPrimarySmall: { backgroundColor: theme.ink, paddingHorizontal: 14, paddingVertical: 10 },
  btnPrimaryText: { color: theme.bg, fontSize: 13, letterSpacing: 1, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
  btnGhostSmall: {
    borderWidth: 1,
    borderColor: theme.ink,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 6,
  },
  btnGhostSmallText: { color: theme.ink, fontSize: 11, letterSpacing: 1 },
  emptyBox: {
    padding: 18,
    borderWidth: 1,
    borderColor: theme.ink,
    backgroundColor: theme.bgWarm,
  },
  emptyText: { fontSize: 13, color: theme.inkSoft, lineHeight: 20 },
  groupCard: {
    borderWidth: 1,
    borderColor: theme.ink,
    backgroundColor: theme.bgWarm,
    padding: 14,
    marginBottom: 14,
  },
  groupHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  groupName: { fontSize: 18, color: theme.ink, fontWeight: '700' },
  groupCount: { fontSize: 12, color: theme.inkSoft, letterSpacing: 1 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.bg,
  },
  memberName: { fontSize: 15, color: theme.ink, fontWeight: '600' },
  memberHandle: { fontSize: 11, color: theme.inkSoft, marginTop: 2 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  deleteBtn: { padding: 12, alignItems: 'center', marginTop: 12 },
  deleteBtnText: { color: theme.accentDeep, fontSize: 12, letterSpacing: 1 },
});
