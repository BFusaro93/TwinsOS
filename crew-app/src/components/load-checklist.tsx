import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchCrewEquipment, fetchCrewMaterials, setCrewLoaded } from '@/lib/api';
import type { CrewLoadEquipment, CrewLoadMaterial } from '@/lib/api';
import { C } from '@/lib/colors';
import { t } from '@/lib/i18n';

interface Row {
  key: string;
  label: string;
  qty?: string;
  sub?: string | null;
  loaded: boolean;
}

/**
 * "Equipment today" and "Materials to load" tick-off lists for the day (what the office put on this
 * crew's truck, and the pending materials for today's dispatched stops). Tap a row to mark it
 * loaded; tap again to undo. The office sees the ticks on the Crew Board.
 *
 * Online-only, like the reference library: the check-off is a live "it's on the truck" signal for the
 * shop, so it is not queued for later — a failed tap reverts and says so.
 */
export function LoadChecklists({ date, refreshKey }: { date: string | null; refreshKey?: number }) {
  const [equipment, setEquipment] = useState<CrewLoadEquipment[]>([]);
  const [materials, setMaterials] = useState<CrewLoadMaterial[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!date) return;
    try {
      const [e, m] = await Promise.all([fetchCrewEquipment(date), fetchCrewMaterials(date)]);
      setEquipment(e);
      setMaterials(m);
      setFailed(false);
    } catch {
      // Keep whatever is on screen; the lists are a convenience, not a gate.
      setFailed(true);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const toggle = (key: string, loaded: boolean) => {
    if (!date) return;
    const apply = (value: boolean) => {
      setEquipment((rows) => rows.map((r) => (r.key === key ? { ...r, loaded: value } : r)));
      setMaterials((rows) => rows.map((r) => (r.key === key ? { ...r, loaded: value } : r)));
    };
    apply(loaded);
    setCrewLoaded(date, key, loaded).catch(() => {
      apply(!loaded);
      setFailed(true);
    });
  };

  if (equipment.length === 0 && materials.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {equipment.length > 0 && (
        <Checklist
          title={t('Equipment today')}
          rows={equipment.map((e) => ({ key: e.key, label: e.name, sub: e.tag, loaded: e.loaded }))}
          onToggle={toggle}
        />
      )}
      {materials.length > 0 && (
        <Checklist
          title={t('Materials to load')}
          rows={materials.map((m) => ({
            key: m.key,
            label: m.name,
            qty: Number.isInteger(m.qty) ? String(m.qty) : m.qty.toFixed(2),
            sub: m.stops.join(', ') || null,
            loaded: m.loaded,
          }))}
          onToggle={toggle}
        />
      )}
      {failed && <Text style={styles.error}>{t("Couldn't save — check your connection and try again.")}</Text>}
    </View>
  );
}

function Checklist({ title, rows, onToggle }: { title: string; rows: Row[]; onToggle: (key: string, loaded: boolean) => void }) {
  const done = rows.filter((r) => r.loaded).length;
  const allDone = done === rows.length;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        <View style={[styles.count, allDone && styles.countDone]}>
          <Text style={[styles.countText, allDone && styles.countTextDone]}>
            {t('{n} of {total} loaded', { n: done, total: rows.length })}
          </Text>
        </View>
      </View>
      {rows.map((r) => (
        <Pressable
          key={r.key}
          onPress={() => onToggle(r.key, !r.loaded)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: r.loaded }}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={[styles.box, r.loaded && styles.boxChecked]}>
            {r.loaded ? <Text style={styles.tick}>✓</Text> : null}
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.label, r.loaded && styles.labelDone]} numberOfLines={1}>
              {r.label}
              {r.sub && !r.qty ? <Text style={styles.sub}>{`  ${r.sub}`}</Text> : null}
            </Text>
            {r.qty && r.sub ? <Text style={styles.sub} numberOfLines={1}>{r.sub}</Text> : null}
          </View>
          {r.qty ? <Text style={styles.qty}>{r.qty}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  card: { backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: C.textMuted },
  count: { backgroundColor: C.headerBorder, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  countDone: { backgroundColor: C.greenBg },
  countText: { fontSize: 12, fontWeight: '600', color: C.textMuted },
  countTextDone: { color: C.greenText },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderTopColor: C.headerBorder, borderTopWidth: 1 },
  rowPressed: { opacity: 0.6 },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: C.textFaint, alignItems: 'center', justifyContent: 'center' },
  boxChecked: { backgroundColor: C.green, borderColor: C.green },
  tick: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  rowText: { flex: 1 },
  label: { fontSize: 15, color: C.text },
  labelDone: { color: C.textFaint, textDecorationLine: 'line-through' },
  sub: { fontSize: 12, color: C.textMuted },
  qty: { fontSize: 15, fontWeight: '700', color: C.text },
  error: { fontSize: 12, color: C.redText },
});
