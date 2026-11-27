import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { addCrewPush, fetchHelperCrews, handOffStop, requestCrewHelp } from '@/lib/api';
import { C } from '@/lib/colors';
import { t } from '@/lib/i18n';
import type { CrewStop, CrewStopVisit, HelperCrew } from '@/lib/types';

// Snow-stop controls — the native counterpart of the web crew stop page's
// "Need help? Call in another crew", "Can't make it? Hand off to another crew"
// and "Going back? Add another push" (src/app/(crm)/crm/crew/stops/[visitId]/
// page.tsx). All online-only: they change who is on the stop, which only makes
// sense once the server has accepted it.

const TERMINAL = ['completed', 'cancelled', 'skipped'];

function isSnowVisit(v: CrewStopVisit): boolean {
  return !!v.stormEventId && v.jobType === 'snow';
}

/** Calling in / handing off is snow-only for now (the DB functions enforce it too). */
export function isSnowStop(stop: CrewStop): boolean {
  return stop.visits.some(isSnowVisit);
}

/** A finished snow stop the crew has to return to: the visit the next push hangs off (latest push). */
export function snowPushSource(stop: CrewStop): CrewStopVisit | undefined {
  return stop.visits
    .filter((v) => v.status === 'completed' && isSnowVisit(v))
    .sort((a, b) => (b.pushNumber ?? 1) - (a.pushNumber ?? 1))[0];
}

type HelpMode = 'help' | 'handoff';

export function SnowStopActions({
  stop,
  onCalledIn,
  onHandedOff,
}: {
  stop: CrewStop;
  /** Called after another crew was called in (the stop now shows them as a partner). */
  onCalledIn: () => void;
  /** Called after the stop moved to another crew's tablet (it is no longer ours). */
  onHandedOff: () => void;
}) {
  const [mode, setMode] = useState<HelpMode | null>(null);
  const [crews, setCrews] = useState<HelperCrew[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mode) return;
    let cancelled = false;
    setLoading(true);
    fetchHelperCrews()
      .then((list) => !cancelled && setCrews(list))
      .catch((err) => {
        if (cancelled) return;
        setCrews([]);
        Alert.alert(t("Couldn't load crews"), err instanceof Error ? err.message : '');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const pick = useCallback(
    async (crew: HelperCrew) => {
      if (!mode) return;
      const ids = stop.visits.filter((v) => !TERMINAL.includes(v.status)).map((v) => v.id);
      if (ids.length === 0) return;
      setBusy(true);
      try {
        if (mode === 'handoff') {
          const res = await handOffStop(ids, crew.id);
          setMode(null);
          Alert.alert(t('Handed off to {crew}', { crew: res.crewName || crew.name }));
          onHandedOff();
        } else {
          const res = await requestCrewHelp(ids, crew.id);
          setMode(null);
          Alert.alert(t('{crew} was called in', { crew: res.crewName || crew.name }));
          onCalledIn();
        }
      } catch (err) {
        Alert.alert(
          t("That didn't go through"),
          err instanceof Error && err.message ? err.message : t('Check your connection and try again.')
        );
      } finally {
        setBusy(false);
      }
    },
    [mode, stop.visits, onCalledIn, onHandedOff]
  );

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={() => setMode('help')}
      >
        <Text style={styles.buttonText}>{t('Need help? Call in another crew')}</Text>
      </Pressable>
      {/* Can't make it at all: only before the crew has started the stop. */}
      {!stop.clockedInAt ? (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => setMode('handoff')}
        >
          <Text style={styles.buttonText}>{t("Can't make it? Hand off to another crew")}</Text>
        </Pressable>
      ) : null}

      <Modal
        visible={mode !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !busy && setMode(null)}
      >
        <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {mode === 'handoff' ? t('Hand off this stop') : t('Call in another crew')}
            </Text>
            <Pressable onPress={() => !busy && setMode(null)} hitSlop={12}>
              <Text style={styles.cancelLink}>{t('Cancel')}</Text>
            </Pressable>
          </View>
          <Text style={styles.explain}>
            {mode === 'handoff'
              ? t('The stop moves to their tablet right away and comes off yours.')
              : t("They'll get this stop on their tablet right away, and you both stay on it.")}
          </Text>
          {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}
          {!loading && crews.length === 0 ? <Text style={styles.empty}>{t('No other crews')}</Text> : null}
          {crews.map((c) => (
            <Pressable
              key={c.id}
              style={({ pressed }) => [styles.crewRow, pressed && styles.pressed, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void pick(c)}
            >
              <Text style={styles.crewName}>{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Modal>
    </>
  );
}

/** "Going back? Add another push" on a completed snow stop. */
export function AddPushButton({
  source,
  onAdded,
}: {
  source: CrewStopVisit;
  /** Called once the next push exists, so the schedule can reload. */
  onAdded: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      style={({ pressed }) => [styles.pushButton, pressed && styles.pressed, busy && styles.disabled]}
      disabled={busy}
      onPress={async () => {
        setBusy(true);
        try {
          await addCrewPush(source.id);
          onAdded();
        } catch (err) {
          Alert.alert(
            t("That didn't go through"),
            err instanceof Error && err.message ? err.message : t('Check your connection and try again.')
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <ActivityIndicator /> : <Text style={styles.pushButtonText}>{t('Going back? Add another push')}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  button: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonText: { color: C.text, fontSize: 14, fontWeight: '600' },
  pushButton: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.greenBorder,
    backgroundColor: C.card,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pushButtonText: { color: C.greenText, fontWeight: '600', fontSize: 14 },
  sheet: { flex: 1, backgroundColor: C.bg },
  sheetContent: { padding: 20, gap: 10 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: C.text, flex: 1 },
  cancelLink: { color: C.blueText, fontWeight: '700', fontSize: 16 },
  explain: { fontSize: 13, color: C.textMuted },
  empty: { textAlign: 'center', color: C.textFaint, marginTop: 16 },
  crewRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  crewName: { fontSize: 15, fontWeight: '600', color: C.text },
});
