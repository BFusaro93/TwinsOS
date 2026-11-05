import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchMemberTimes, saveMemberTime, type MemberTimeRow } from '@/lib/api';
import { C } from '@/lib/colors';

// Native counterpart of the web crew page's Time Summary dialog
// (src/components/crm/crew/TimeSummaryDialog.tsx): after a stop is finished,
// each person's start/finish can be nudged before the crew moves on. Opened
// from the "Job Complete" card rather than automatically, because the stop's
// Clock Out is queued offline and its punches only exist once that has synced.
// Online-only for the same reason as the crew-day controls — the server
// validates the new times against the visit.

const STEPS = [-15, -5, 5, 15];

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

interface Draft {
  crewMemberId: string;
  name: string;
  inMs: number;
  outMs: number;
  originalIn: number;
  originalOut: number;
}

export function TimeSummaryModal({
  visible,
  visitId,
  onClose,
}: {
  visible: boolean;
  visitId: string;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMemberTimes(visitId)
      .then((rows: MemberTimeRow[]) => {
        if (cancelled) return;
        setDrafts(
          rows
            .filter((r) => r.clockedInAt && r.clockedOutAt)
            .map((r) => ({
              crewMemberId: r.crewMemberId,
              name: r.name,
              inMs: new Date(r.clockedInAt!).getTime(),
              outMs: new Date(r.clockedOutAt!).getTime(),
              originalIn: new Date(r.clockedInAt!).getTime(),
              originalOut: new Date(r.clockedOutAt!).getTime(),
            }))
        );
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load the times");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, visitId]);

  const total = useMemo(() => drafts.reduce((sum, d) => sum + Math.max(0, Math.round((d.outMs - d.inMs) / 60000)), 0), [drafts]);
  const invalid = drafts.some((d) => d.outMs <= d.inMs);

  function nudge(idx: number, field: 'inMs' | 'outMs', minutes: number) {
    setDrafts((cur) => cur.map((d, i) => (i === idx ? { ...d, [field]: d[field] + minutes * 60000 } : d)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      for (const d of drafts) {
        if (d.inMs === d.originalIn && d.outMs === d.originalOut) continue;
        await saveMemberTime(visitId, d.crewMemberId, new Date(d.inMs).toISOString(), new Date(d.outMs).toISOString());
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the times");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={styles.sheet} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Time summary</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : drafts.length === 0 ? (
          <Text style={styles.muted}>
            {error ?? "No individual times are recorded yet. If you just finished, wait for the job to sync and try again."}
          </Text>
        ) : (
          <>
            <Text style={styles.muted}>Check each person&apos;s start and finish. Tap to change them if someone arrived late or left early.</Text>
            {drafts.map((d, idx) => (
              <View key={d.crewMemberId} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.name}>{d.name}</Text>
                  <Text style={[styles.minutes, d.outMs <= d.inMs && { color: C.red }]}>
                    {d.outMs > d.inMs ? fmtMinutes(Math.round((d.outMs - d.inMs) / 60000)) : '—'}
                  </Text>
                </View>
                {(['inMs', 'outMs'] as const).map((field) => (
                  <View key={field} style={styles.row}>
                    <Text style={styles.rowLabel}>
                      {field === 'inMs' ? 'Started' : 'Finished'} {clock(d[field])}
                    </Text>
                    <View style={styles.steps}>
                      {STEPS.map((s) => (
                        <Pressable key={s} style={styles.step} onPress={() => nudge(idx, field, s)}>
                          <Text style={styles.stepText}>{s > 0 ? `+${s}` : s}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.muted}>Total crew time</Text>
              <Text style={styles.name}>{fmtMinutes(total)}</Text>
            </View>
            {invalid ? <Text style={styles.error}>A finish time must be after its start.</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={[styles.done, (saving || invalid) && { opacity: 0.5 }]} onPress={() => void save()} disabled={saving || invalid}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.doneText}>Done</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: C.text },
  close: { color: C.blue, fontSize: 16, fontWeight: '600' },
  muted: { color: C.textMuted, fontSize: 13 },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '600', color: C.text },
  minutes: { fontSize: 15, fontWeight: '700', color: C.text },
  row: { gap: 6 },
  rowLabel: { fontSize: 13, color: C.textMuted },
  steps: { flexDirection: 'row', gap: 8 },
  step: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.blueBorder, backgroundColor: C.blueBg },
  stepText: { color: C.blueText, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
  error: { color: C.redText, fontSize: 13 },
  done: { backgroundColor: C.green, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  doneText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
