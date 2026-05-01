import * as AppleAuthentication from 'expo-apple-authentication';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
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

export default function LoginScreen() {
  const { signIn, signInWithApple } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Apple Sign-In flow state
  const [pendingApple, setPendingApple] = useState<{
    identityToken: string;
    suggestedDisplayName: string | null;
  } | null>(null);
  const [appleHandle, setAppleHandle] = useState('');
  const [appleDisplayName, setAppleDisplayName] = useState('');

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
    }
  }, []);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startApple() {
    setError(null);
    setBusy(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('Apple did not return a token');
      const fullName = credential.fullName
        ? [credential.fullName.familyName, credential.fullName.givenName]
            .filter(Boolean)
            .join(' ')
            .trim() || null
        : null;
      const res = await signInWithApple(credential.identityToken, fullName);
      if (res.needs_handle) {
        setPendingApple({
          identityToken: credential.identityToken,
          suggestedDisplayName: res.suggested_display_name ?? fullName,
        });
        setAppleDisplayName(res.suggested_display_name ?? fullName ?? '');
      }
      // else: signed in (auth context updated)
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        setError(e?.message ?? 'Apple sign-in failed');
      }
    } finally {
      setBusy(false);
    }
  }

  async function completeAppleHandle() {
    if (!pendingApple) return;
    setBusy(true);
    try {
      const handle = appleHandle.trim().replace(/^@/, '');
      if (!handle) throw new Error('ユーザーIDを入力してください');
      const res = await signInWithApple(
        pendingApple.identityToken,
        appleDisplayName.trim() || null,
        handle,
      );
      if (res.needs_handle) {
        Alert.alert('もう一度試してください');
      } else {
        setPendingApple(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (pendingApple) {
    return (
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.title}>アカウント作成</Text>
        <Text style={styles.subtitle}>Apple でサインイン中。最後にユーザーIDを決めてください。</Text>
        <View style={styles.form}>
          <TextInput
            placeholder="表示名"
            placeholderTextColor={theme.inkSoft}
            value={appleDisplayName}
            onChangeText={setAppleDisplayName}
            style={styles.input}
          />
          <TextInput
            placeholder="ユーザーID（半角英数字、3〜20文字）"
            placeholderTextColor={theme.inkSoft}
            autoCapitalize="none"
            autoCorrect={false}
            value={appleHandle}
            onChangeText={setAppleHandle}
            style={styles.input}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            style={styles.button}
            disabled={busy}
            onPress={completeAppleHandle}
          >
            <Text style={styles.buttonText}>{busy ? '...' : '完了'}</Text>
          </Pressable>
          <Pressable onPress={() => setPendingApple(null)} hitSlop={8}>
            <Text style={styles.link}>← キャンセル</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.brand}>
        <Text style={styles.brandText}>
          OKITA<Text style={{ color: theme.accent }}>.</Text>
        </Text>
        <Text style={styles.tagline}>「起きた？」を、1タップで。</Text>
      </View>

      <View style={styles.form}>
        {appleAvailable && (
          <>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={0}
              style={styles.appleBtn}
              onPress={startApple}
            />
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>または</Text>
              <View style={styles.dividerLine} />
            </View>
          </>
        )}
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
          placeholder="パスワード"
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
          <Text style={styles.buttonText}>{busy ? '...' : 'ログイン'}</Text>
        </Pressable>
        <Link href="/(auth)/register" style={styles.link}>
          アカウントを作成する →
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, padding: 32, justifyContent: 'center' },
  brand: { marginBottom: 60 },
  brandText: {
    fontSize: 80,
    fontWeight: '800',
    color: theme.ink,
    letterSpacing: -2,
  },
  tagline: { fontSize: 16, color: theme.inkSoft, marginTop: 12, fontStyle: 'italic' },
  title: { fontSize: 28, fontWeight: '700', color: theme.ink, marginBottom: 8 },
  subtitle: { fontSize: 13, color: theme.inkSoft, marginBottom: 24, lineHeight: 20 },
  form: { gap: 14 },
  appleBtn: { width: '100%', height: 48 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.inkSoft, opacity: 0.4 },
  dividerText: { fontSize: 11, color: theme.inkSoft, letterSpacing: 1 },
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
