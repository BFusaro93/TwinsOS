import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchCrewDay, postCrewDay, setMemberAbsent } from '@/lib/api';
import { C } from '@/lib/colors';
import type { CrewDay, CrewDayAction } from '@/lib/types';

// The crew's paid day (shop to shop) and per-member attendance — the native
// counterpart of the web crew home's Start Day / End Day banner and Edit Crew
// dialog (src/app/(crm)/crm/crew/page.tsx, EditCrewDialog.tsx). Deliberately
// online-only: /api/crm/crew/day and /attendance stamp the server's own `now`
// (no occurredAt / Idempotency-Key), so replaying one from an offline queue
// hours later would credit the wrong time against payroll. A failed tap shows
// its error and can simply be tapped again.

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function useCrewDay() {
  const [day, setDay] = useState<CrewDay | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDay(await fetchCrewDay());
      setError(null);
    } catch (err) {
      // Not a crew login (403) or offline — the banner just stays hidden/stale.
      setError(err instanceof Error ? err.message : 'Couldn\'t load the crew day');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Runs one online-only mutation, then re-reads the day. `key` marks which control is busy. */
  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>): Promise<boolean> => {
      setBusyKey(key);
      try {
        await fn();
        await refresh();
        return true;
      } catch (err) {
        Alert.alert(
          "That didn't go through",
          err instanceof Error && err.message ? err.message : 'Check your connection and try again.'
        );
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [refresh]
  );

  const act = useCallback(
    (action: CrewDayAction, opts: { crewMemberId?: string; visitId?: string } = {}) =>
      run(`${action}:${opts.crewMemberId ?? ''}`, () => postCrewDay(action, opts)),
    [run]
  );

  const absent = useCallback(
    (crewMemberId: string, value: boolean, visitId?: string) =>
      run(`absent:${crewMemberId}`, () => setMemberAbsent(crewMemberId, value, visitId)),
    [run]
  );

  return { day, error, busyKey, refresh, act, absent };
}

type CrewDayState = ReturnType<typeof useCrewDay>;

/** Start Day button / "Day started" banner with End Day, plus the Edit Crew entry point. */
export function CrewDayBanner({
  crewDay,
  anyJobActive,
  onEditCrew,
}: {
  crewDay: CrewDayState;
  anyJobActive: boolean;
  onEditCrew: () => void;
}) {
  const { day, busyKey, act } = crewDay;
  if (!day) return null;

  const members = day.members;
  const startedAt = members.map((m) => m.startedAt).filter((t): t is string => !!t).sort()[0] ?? null;
  const onClock = members.filter((m) => m.startedAt && !m.endedAt);
  const dayOpen = onClock.length > 0;
  const dayEnded = !!startedAt && !dayOpen;

  const endDay = () => {
    const go = () => void act('end_day');
    if (anyJobActive) {
      Alert.alert('A job is still in progress', 'End the day anyway?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End Day', style: 'destructive', onPress: go },
      ]);
    } else {
      go();
    }
  };

  return (
    <View style={styles.wrap}>
      {!startedAt ? (
        <Pressable
          style={({ pressed }) => [
            styles.startDay,
            pressed && styles.pressed,
            (busyKey === 'start_day:' || members.length === 0) && styles.disabled,
          ]}
          disabled={busyKey === 'start_day:' || members.length === 0}
          onPress={() => void act('start_day')}
        >
          {busyKey === 'start_day:' ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.startDayText}>Start Day</Text>
          )}
        </Pressable>
      ) : dayOpen ? (
        <View style={styles.dayBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dayBannerTitle}>Day started {formatClock(startedAt)}</Text>
            <Text style={styles.dayBannerSubtitle}>{onClock.length} on the clock</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.endDay, pressed && styles.pressed, busyKey === 'end_day:' && styles.disabled]}
            disabled={busyKey === 'end_day:'}
            onPress={endDay}
          >
            <Text style={styles.endDayText}>End Day</Text>
          </Pressable>
        </View>
      ) : dayEnded ? (
        <Text style={styles.dayEnded}>Day ended — everyone is clocked out.</Text>
      ) : null}

      <Pressable onPress={onEditCrew} hitSlop={8} style={styles.editCrewLink}>
        <Text style={styles.editCrewLinkText}>Edit crew</Text>
      </Pressable>
    </View>
  );
}

/**
 * Per-member attendance, same controls as the web Edit Crew dialog: "Clock In" /
 * "Back" / "Left for the day" / "Not working", plus pulling someone from another
 * crew onto this one for today. `visitId` is the in-progress stop's anchor visit
 * (when there is one) so that stop's job punch stays in step with the shift.
 */
export function EditCrewModal({
  visible,
  onClose,
  crewDay,
  visitId,
}: {
  visible: boolean;
  onClose: () => void;
  crewDay: CrewDayState;
  visitId?: string;
}) {
  const { day, busyKey, act, absent } = crewDay;
  const [showAvailable, setShowAvailable] = useState(false);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Edit crew</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.doneLink}>Done</Text>
          </Pressable>
        </View>

        {(day?.members ?? []).map((m) => {
          const onClock = !!m.startedAt && !m.endedAt;
          const done = !!m.startedAt && !!m.endedAt;
          const busy = busyKey?.endsWith(`:${m.id}`) ?? false;
          return (
            <View key={m.id} style={styles.memberRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.name}</Text>
                {m.role ? <Text style={styles.memberMeta}>{m.role}</Text> : null}
                {m.startedAt ? (
                  <Text style={styles.memberMeta}>
                    In: {formatClock(m.startedAt)}
                    {m.endedAt ? ` · Out: ${formatClock(m.endedAt)}` : ''}
                  </Text>
                ) : null}
                {m.absent && !m.startedAt ? <Text style={styles.memberMeta}>Not working today</Text> : null}
              </View>

              {busy ? (
                <ActivityIndicator />
              ) : onClock ? (
                <Pressable
                  style={[styles.memberButton, styles.memberButtonOut]}
                  onPress={() => void act('member_out', { crewMemberId: m.id, visitId })}
                >
                  <Text style={styles.memberButtonOutText}>Left for the day</Text>
                </Pressable>
              ) : (
                <View style={styles.memberActions}>
                  {!done && !m.absent ? (
                    <Pressable onPress={() => void absent(m.id, true, visitId)} hitSlop={8}>
                      <Text style={styles.memberLink}>Not working</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={[styles.memberButton, styles.memberButtonIn]}
                    onPress={() => void act('member_in', { crewMemberId: m.id, visitId })}
                  >
                    <Text style={styles.memberButtonInText}>{done ? 'Back' : 'Clock In'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        {(day?.available.length ?? 0) > 0 ? (
          <View style={styles.addBlock}>
            <Pressable onPress={() => setShowAvailable((v) => !v)}>
              <Text style={styles.addTitle}>
                {showAvailable ? 'Hide' : 'Add someone to my crew today'}
              </Text>
            </Pressable>
            {showAvailable
              ? day!.available.map((a) => {
                  const busy = busyKey === `add_member:${a.id}`;
                  return (
                    <View key={a.id} style={styles.memberRow}>
                      <Text style={[styles.memberName, { flex: 1 }]}>{a.name}</Text>
                      {busy ? (
                        <ActivityIndicator />
                      ) : (
                        <Pressable
                          style={[styles.memberButton, styles.memberButtonIn]}
                          onPress={() => void act('add_member', { crewMemberId: a.id, visitId })}
                        >
                          <Text style={styles.memberButtonInText}>Add</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })
              : null}
          </View>
        ) : null}

        <Text style={styles.footnote}>
          Start Day clocks in everyone working. Use this for anyone who arrives late, is out today, or leaves early.
        </Text>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginTop: 16,
    gap: 8,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  startDay: {
    backgroundColor: C.green,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  startDayText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  dayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.greenBorder,
    backgroundColor: C.greenBg,
    padding: 14,
  },
  dayBannerTitle: { fontSize: 14, fontWeight: '700', color: C.greenText },
  dayBannerSubtitle: { fontSize: 12, color: C.green, marginTop: 2 },
  endDay: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: C.red,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: C.card,
  },
  endDayText: { color: C.red, fontWeight: '700', fontSize: 13 },
  dayEnded: { textAlign: 'center', fontSize: 12, color: C.textFaint },
  editCrewLink: { alignSelf: 'flex-start' },
  editCrewLinkText: { color: C.blueText, fontWeight: '600', fontSize: 13 },

  sheet: { flex: 1, backgroundColor: C.bg },
  sheetContent: { padding: 20, gap: 10 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  doneLink: { color: C.blueText, fontWeight: '700', fontSize: 16 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
  },
  memberName: { fontSize: 15, fontWeight: '600', color: C.text },
  memberMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  memberActions: { alignItems: 'flex-end', gap: 8 },
  memberLink: { color: C.textMuted, fontSize: 12, fontWeight: '600' },
  memberButton: { borderRadius: 8, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 12 },
  memberButtonIn: { borderColor: C.green, backgroundColor: C.greenBg },
  memberButtonInText: { color: C.greenText, fontWeight: '700', fontSize: 13 },
  memberButtonOut: { borderColor: C.red, backgroundColor: C.redBg },
  memberButtonOutText: { color: C.redText, fontWeight: '700', fontSize: 13 },
  addBlock: { gap: 10, marginTop: 6 },
  addTitle: { color: C.blueText, fontWeight: '700', fontSize: 14 },
  footnote: { textAlign: 'center', fontSize: 12, color: C.textFaint, marginTop: 6 },
});
