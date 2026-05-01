import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { theme } from './theme';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/* ---------------- TIME PICKER (HH:MM) ---------------- */

export function TimePicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  if (Platform.OS === 'ios') {
    return (
      <RNDateTimePicker
        value={value}
        mode="time"
        display="spinner"
        onChange={(_, d) => d && onChange(d)}
      />
    );
  }
  if (Platform.OS === 'android') {
    return <AndroidTimeButton value={value} onChange={onChange} />;
  }
  return <WebTimeInput value={value} onChange={onChange} />;
}

function AndroidTimeButton({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <Pressable style={styles.fieldBtn} onPress={() => setShow(true)}>
        <Text style={styles.fieldBtnText}>
          {value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </Pressable>
      {show && (
        <RNDateTimePicker
          value={value}
          mode="time"
          onChange={(_, d) => {
            setShow(false);
            if (d) onChange(d);
          }}
        />
      )}
    </>
  );
}

function WebTimeInput({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  const [hour, setHour] = useState(pad2(value.getHours()));
  const [minute, setMinute] = useState(pad2(value.getMinutes()));

  function commit(h: string, m: string) {
    const hh = clamp(parseInt(h, 10) || 0, 0, 23);
    const mm = clamp(parseInt(m, 10) || 0, 0, 59);
    const d = new Date(value);
    d.setHours(hh, mm, 0, 0);
    onChange(d);
  }

  function step(field: 'h' | 'm', delta: number) {
    if (field === 'h') {
      const next = (parseInt(hour, 10) || 0) + delta;
      const wrapped = ((next % 24) + 24) % 24;
      const s = pad2(wrapped);
      setHour(s);
      commit(s, minute);
    } else {
      const next = (parseInt(minute, 10) || 0) + delta;
      const wrapped = ((next % 60) + 60) % 60;
      const s = pad2(wrapped);
      setMinute(s);
      commit(hour, s);
    }
  }

  return (
    <View style={styles.timeRoot}>
      <View style={styles.timeUnit}>
        <Pressable style={styles.timeStep} onPress={() => step('h', 1)}>
          <Text style={styles.timeStepText}>▲</Text>
        </Pressable>
        <TextInput
          value={hour}
          onChangeText={(t) => {
            setHour(t.replace(/[^0-9]/g, '').slice(0, 2));
          }}
          onBlur={() => {
            const s = pad2(clamp(parseInt(hour, 10) || 0, 0, 23));
            setHour(s);
            commit(s, minute);
          }}
          keyboardType="number-pad"
          maxLength={2}
          style={styles.timeField}
          selectTextOnFocus
        />
        <Pressable style={styles.timeStep} onPress={() => step('h', -1)}>
          <Text style={styles.timeStepText}>▼</Text>
        </Pressable>
      </View>
      <Text style={styles.timeColon}>:</Text>
      <View style={styles.timeUnit}>
        <Pressable style={styles.timeStep} onPress={() => step('m', 5)}>
          <Text style={styles.timeStepText}>▲</Text>
        </Pressable>
        <TextInput
          value={minute}
          onChangeText={(t) => {
            setMinute(t.replace(/[^0-9]/g, '').slice(0, 2));
          }}
          onBlur={() => {
            const s = pad2(clamp(parseInt(minute, 10) || 0, 0, 59));
            setMinute(s);
            commit(hour, s);
          }}
          keyboardType="number-pad"
          maxLength={2}
          style={styles.timeField}
          selectTextOnFocus
        />
        <Pressable style={styles.timeStep} onPress={() => step('m', -5)}>
          <Text style={styles.timeStepText}>▼</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ---------------- DATE+TIME PICKER ---------------- */

export function DateTimePicker({
  value,
  onChange,
  minimumDate,
}: {
  value: Date;
  onChange: (d: Date) => void;
  minimumDate?: Date;
}) {
  if (Platform.OS === 'ios') {
    return (
      <RNDateTimePicker
        value={value}
        mode="datetime"
        display="spinner"
        onChange={(_, d) => d && onChange(d)}
        minimumDate={minimumDate}
      />
    );
  }
  if (Platform.OS === 'android') {
    return <AndroidDateTimeButton value={value} onChange={onChange} minimumDate={minimumDate} />;
  }
  return <WebDateTimeInput value={value} onChange={onChange} />;
}

function AndroidDateTimeButton({
  value,
  onChange,
  minimumDate,
}: {
  value: Date;
  onChange: (d: Date) => void;
  minimumDate?: Date;
}) {
  const [phase, setPhase] = useState<'idle' | 'date' | 'time'>('idle');
  const [draft, setDraft] = useState<Date>(value);

  return (
    <>
      <Pressable style={styles.fieldBtn} onPress={() => setPhase('date')}>
        <Text style={styles.fieldBtnText}>{value.toLocaleString()}</Text>
      </Pressable>
      {phase === 'date' && (
        <RNDateTimePicker
          value={draft}
          mode="date"
          minimumDate={minimumDate}
          onChange={(_, d) => {
            if (d) {
              setDraft(d);
              setPhase('time');
            } else {
              setPhase('idle');
            }
          }}
        />
      )}
      {phase === 'time' && (
        <RNDateTimePicker
          value={draft}
          mode="time"
          onChange={(_, d) => {
            setPhase('idle');
            if (d) {
              const merged = new Date(draft);
              merged.setHours(d.getHours(), d.getMinutes(), 0, 0);
              onChange(merged);
            }
          }}
        />
      )}
    </>
  );
}

function WebDateTimeInput({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  const [date, setDate] = useState(toDateStr(value));
  const [hour, setHour] = useState(pad2(value.getHours()));
  const [minute, setMinute] = useState(pad2(value.getMinutes()));

  function commit(nextDate: string, h: string, m: string) {
    const parts = nextDate.split('-');
    if (parts.length !== 3) return;
    const [yy, mm, dd] = parts.map((s) => parseInt(s, 10));
    if (!yy || !mm || !dd) return;
    const hh = clamp(parseInt(h, 10) || 0, 0, 23);
    const mi = clamp(parseInt(m, 10) || 0, 0, 59);
    const d = new Date(yy, mm - 1, dd, hh, mi, 0, 0);
    onChange(d);
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.dateRow}>
        <Pressable
          style={styles.dateStep}
          onPress={() => {
            const d = new Date(value);
            d.setDate(d.getDate() - 1);
            const next = toDateStr(d);
            setDate(next);
            commit(next, hour, minute);
          }}
        >
          <Text style={styles.timeStepText}>◀</Text>
        </Pressable>
        <TextInput
          value={date}
          onChangeText={(t) => setDate(t)}
          onBlur={() => commit(date, hour, minute)}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          style={styles.dateField}
        />
        <Pressable
          style={styles.dateStep}
          onPress={() => {
            const d = new Date(value);
            d.setDate(d.getDate() + 1);
            const next = toDateStr(d);
            setDate(next);
            commit(next, hour, minute);
          }}
        >
          <Text style={styles.timeStepText}>▶</Text>
        </Pressable>
      </View>
      <WebTimeInput
        value={value}
        onChange={(d) => {
          setHour(pad2(d.getHours()));
          setMinute(pad2(d.getMinutes()));
          commit(date, pad2(d.getHours()), pad2(d.getMinutes()));
        }}
      />
    </View>
  );
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const styles = StyleSheet.create({
  fieldBtn: {
    borderWidth: 1,
    borderColor: theme.ink,
    padding: 12,
    alignItems: 'center',
    backgroundColor: theme.bgWarm,
  },
  fieldBtnText: { fontSize: 18, color: theme.ink, fontWeight: '600' },
  timeRoot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeUnit: { alignItems: 'center' },
  timeStep: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: theme.bgWarm,
    borderWidth: 1,
    borderColor: theme.ink,
  },
  timeStepText: { color: theme.ink, fontSize: 14 },
  timeField: {
    width: 70,
    paddingVertical: 12,
    fontSize: 32,
    fontWeight: '700',
    color: theme.ink,
    textAlign: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.ink,
    backgroundColor: theme.bg,
  },
  timeColon: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.ink,
    paddingHorizontal: 6,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateField: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.ink,
    backgroundColor: theme.bg,
    padding: 10,
    fontSize: 16,
    color: theme.ink,
    textAlign: 'center',
  },
  dateStep: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.bgWarm,
    borderWidth: 1,
    borderColor: theme.ink,
  },
});
