import { Link } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/auth';
import { theme } from '@/theme';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await signUp(email.trim(), password, name.trim(), handle.trim().replace(/^@/, ''));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>アカウント作成</Text>
      <View style={styles.form}>
        <TextInput
          placeholder="表示名"
          placeholderTextColor={theme.inkSoft}
          value={name}
          onChangeText={setName}
          style={styles.input}
        />
        <TextInput
          placeholder="ユーザーID（半角英数字、3〜20文字）"
          placeholderTextColor={theme.inkSoft}
          autoCapitalize="none"
          autoCorrect={false}
          value={handle}
          onChangeText={setHandle}
          style={styles.input}
        />
        <TextInput
          placeholder="メールアドレス"
          placeholderTextColor={theme.inkSoft}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />
        <TextInput
          placeholder="パスワード（6文字以上）"
          placeholderTextColor={theme.inkSoft}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={styles.button}
          disabled={busy}
          onPress={submit}
        >
          <Text style={styles.buttonText}>{busy ? '...' : '登録'}</Text>
        </Pressable>
        <Link href="/(auth)/login" style={styles.link}>
          ← ログインに戻る
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, padding: 32, justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: '700', color: theme.ink, marginBottom: 30 },
  form: { gap: 14 },
  input: {
    borderWidth: 1,
    borderColor: theme.ink,
    backgroundColor: theme.bgWarm,
    padding: 14,
    fontSize: 16,
    color: theme.ink,
  },
  button: {
    backgroundColor: theme.ink,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: theme.bg, fontSize: 16, fontWeight: '600', letterSpacing: 2 },
  link: { color: theme.accentDeep, marginTop: 16, textAlign: 'center' },
  error: { color: theme.accentDeep, fontSize: 13 },
});
