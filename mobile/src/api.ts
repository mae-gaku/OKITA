import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const TOKEN_KEY = 'okita.token';

function resolveBaseUrl(): string {
  // Web: ブラウザがアクセスしているホスト名と同じホストの 8765 番に当てる。
  // - PC で http://localhost:8081 で開いていれば → http://localhost:8765 (Wi-Fi 不要)
  // - スマホで http://192.168.x.x:8081 で開いていれば → http://192.168.x.x:8765
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const proto = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${proto}//${window.location.hostname}:8765`;
  }

  const fromConfig =
    (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  if (fromConfig && fromConfig !== 'http://localhost:8765') return fromConfig;
  const hostUri =
    Constants.expoConfig?.hostUri ?? (Constants as any).expoGoConfig?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) return `http://${host}:8765`;
  }
  return fromConfig ?? 'http://localhost:8765';
}

export const API_BASE = resolveBaseUrl();
console.log('[OKITA] API_BASE =', API_BASE, 'platform =', Platform.OS);

export async function setToken(token: string | null) {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

type RequestOpts = {
  method?: string;
  body?: unknown;
  form?: Record<string, string>;
  auth?: boolean;
};

export async function api<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(opts.form).toString();
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (opts.auth !== false) {
    const t = await getToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }
  const url = `${API_BASE}${path}`;
  console.log('[OKITA] fetch ->', opts.method ?? (body ? 'POST' : 'GET'), url);
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
    });
  } catch (e) {
    console.log('[OKITA] fetch FAILED ->', url, String(e));
    throw e;
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.detail ?? `HTTP ${res.status}`;
    const err = new Error(typeof message === 'string' ? message : JSON.stringify(message)) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export function isPaymentRequired(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { status?: number }).status === 402;
}

export type Plan = 'free' | 'pro' | 'family';

export type BillingStatus = {
  plan: Plan;
  last_verified_at: string | null;
  last_source: string | null;
};

export type FamilyRole = 'parent' | 'child';

export type FamilyMember = {
  user: UserPublic;
  role: FamilyRole;
};

export type FamilyGroup = {
  id: number;
  name: string;
  owner_id: number;
  members: FamilyMember[];
};

export type Referral = {
  code: string;
  invite_url: string;
  handle_url: string;
};

export type InviteHandleInfo = {
  handle: string;
  display_name: string;
};

export type RedeemResult = {
  referrer_handle: string;
  redeemed_at: string;
};

// 曜日別起床予定時刻 (UTC分)。長さ7、Mon..Sun。null = 未設定。
export type WakeMinutes = (number | null)[];

export type User = {
  id: number;
  email: string;
  handle: string;
  display_name: string;
  plan: Plan;
  wake_minutes: WakeMinutes;
};
export type UserPublic = {
  id: number;
  handle: string;
  display_name: string;
  wake_minutes: WakeMinutes;
};

export type FollowEdge = {
  user: UserPublic;
  i_follow: boolean;
  follows_me: boolean;
  in_my_visibility: boolean;
  in_their_visibility: boolean;
};

export type TimelineItem = {
  user: UserPublic;
  woke_at: string | null;
  muted_today: boolean;
  today_target_minutes: number | null;
  is_overdue: boolean;
};

export type HomeState = {
  me: User;
  woke_today: boolean;
  today_target_minutes: number | null;
  paused_today: boolean;
  timeline: TimelineItem[];
};

export type WakeTimes = { minutes: WakeMinutes };

export type Streak = {
  current: number;
  longest: number;
  total_wakes: number;
  woke_today: boolean;
};

export type WakeLogDay = {
  date: string;
  woke_at: string;
  source: 'self' | 'request';
};

export type AuthResult = { access_token: string; token_type: string; user: User };
