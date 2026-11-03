import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Linking } from 'react-native';

import { addCrewChemical, fetchReferenceDocumentUrl } from '@/lib/api';
import { C } from '@/lib/colors';
import type {
  ChemicalCatalog,
  ChemicalConditionsInput,
  ConditionsReading,
  VisitChemicalApplication,
} from '@/lib/types';

// The crew-side chemical pieces beyond "enter the amount": the product label, how it
// was applied, conditions, and adding a product the office didn't preload. Mirrors
// src/components/crm/crew/CrewChemicalParts.tsx on the web crew page.

type LabelFields = Pick<
  VisitChemicalApplication,
  'epaNumber' | 'reEntryInterval' | 'labelInstructions' | 'restricted'
>;

/** Opens a Reference Library document in the phone's browser/PDF viewer. */
export async function openReferenceDocument(id: string): Promise<boolean> {
  try {
    await Linking.openURL(await fetchReferenceDocumentUrl(id));
    return true;
  } catch {
    return false;
  }
}

/** The product label's directions, one tap away, plus the label / SDS documents the office filed
 *  for this product in the Reference Library. Renders nothing when there is nothing to show. */
export function ChemicalLabel({
  chemical,
  documents = [],
}: {
  chemical: LabelFields;
  documents?: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const { epaNumber, reEntryInterval, labelInstructions, restricted } = chemical;
  if (!epaNumber && !reEntryInterval && !labelInstructions && !restricted && documents.length === 0) return null;
  return (
    <View>
      <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8} style={styles.linkRow}>
        <Text style={styles.linkText}>{open ? 'Hide label' : 'View label'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.panel}>
          {restricted ? <Text style={styles.restricted}>Restricted-use product</Text> : null}
          {epaNumber ? <Text style={styles.panelText}>EPA # {epaNumber}</Text> : null}
          {reEntryInterval ? <Text style={styles.panelText}>Re-entry interval: {reEntryInterval}</Text> : null}
          {labelInstructions ? <Text style={styles.panelText}>{labelInstructions}</Text> : null}
          {documents.map((d) => (
            <Pressable
              key={d.id}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
              onPress={() =>
                void openReferenceDocument(d.id).then((ok) =>
                  setDocError(ok ? null : "Couldn't open the document — check your connection.")
                )
              }
            >
              <Text style={styles.addButtonText}>Open {d.title}</Text>
            </Pressable>
          ))}
          {docError ? <Text style={styles.error}>{docError}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** What the crew changed about HOW a chemical was applied; a key left undefined = unchanged. */
export interface ChemApplyEdit {
  methodId?: string | null;
  targetIds?: string[];
  areasTreatedIds?: string[];
}

function Chips({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <View style={styles.chipGroup}>
      <Text style={styles.chipLabel}>{label}</Text>
      <View style={styles.chipWrap}>
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <Pressable
              key={o.id}
              onPress={() => onToggle(o.id)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Method (pick one), target and treated area (pick any), starting from what the office planned. */
export function ChemicalApplyFields({
  chemical,
  catalog,
  edit,
  onChange,
}: {
  chemical: Pick<VisitChemicalApplication, 'applicationMethodId' | 'targetIds' | 'areasTreatedIds'>;
  catalog: ChemicalCatalog | null;
  edit: ChemApplyEdit | undefined;
  onChange: (next: ChemApplyEdit) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!catalog || (catalog.methods.length === 0 && catalog.targets.length === 0 && catalog.areasTreated.length === 0)) {
    return null;
  }
  const methodId = edit?.methodId !== undefined ? edit.methodId : chemical.applicationMethodId;
  const targetIds = edit?.targetIds ?? chemical.targetIds;
  const areaIds = edit?.areasTreatedIds ?? chemical.areasTreatedIds;
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <View>
      <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8} style={styles.linkRow}>
        <Text style={styles.linkText}>{open ? 'Hide how applied' : 'How applied (method, target, area)'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.panel}>
          <Chips
            label="Method"
            options={catalog.methods}
            selected={methodId ? [methodId] : []}
            onToggle={(id) => onChange({ ...edit, methodId: methodId === id ? null : id })}
          />
          <Chips
            label="Target"
            options={catalog.targets}
            selected={targetIds}
            onToggle={(id) => onChange({ ...edit, targetIds: toggle(targetIds, id) })}
          />
          <Chips
            label="Area treated"
            options={catalog.areasTreated}
            selected={areaIds}
            onToggle={(id) => onChange({ ...edit, areasTreatedIds: toggle(areaIds, id) })}
          />
        </View>
      ) : null}
    </View>
  );
}

export interface ConditionsDraft {
  temperature: string;
  windSpeed: string;
  windDirection: string;
  phLevel: string;
}

export const EMPTY_CONDITIONS: ConditionsDraft = { temperature: '', windSpeed: '', windDirection: '', phLevel: '' };

/** A weather reading as the conditions draft (pH is never from the weather). */
export function conditionsFromReading(r: ConditionsReading, keep: ConditionsDraft): ConditionsDraft {
  return {
    ...keep,
    temperature: r.temperatureF != null ? String(r.temperatureF) : keep.temperature,
    windSpeed: r.windMph != null ? String(r.windMph) : keep.windSpeed,
    windDirection: r.windDirection ?? keep.windDirection,
  };
}

/** Draft -> what the server takes, leaving out anything blank or not a number. */
export function conditionsPayload(d: ConditionsDraft): ChemicalConditionsInput {
  const num = (v: string) => {
    const n = parseFloat(v);
    return v.trim() !== '' && Number.isFinite(n) ? n : undefined;
  };
  return {
    temperature: num(d.temperature),
    windSpeed: num(d.windSpeed),
    windDirection: d.windDirection.trim() || undefined,
    phLevel: num(d.phLevel),
  };
}

/** Weather and/or pH inputs, per the company's Conditions setting. Optional for the crew. */
export function ChemicalConditionsFields({
  display,
  value,
  onChange,
  reading,
  onUseReading,
}: {
  display: ChemicalCatalog['conditionsDisplay'];
  value: ConditionsDraft;
  onChange: (next: ConditionsDraft) => void;
  /** Weather near the stop, offered as a one-tap fill (and applied automatically on first load). */
  reading?: ConditionsReading | null;
  onUseReading?: () => void;
}) {
  const showWeather = display === 'weather' || display === 'both';
  const showPh = display === 'ph' || display === 'both';
  if (!showWeather && !showPh) return null;
  const field = (key: keyof ConditionsDraft, label: string, numeric: boolean, placeholder: string) => (
    <View style={styles.condField}>
      <Text style={styles.chipLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        autoCapitalize="characters"
        value={value[key]}
        onChangeText={(t) => onChange({ ...value, [key]: t })}
        placeholder={placeholder}
        placeholderTextColor={C.textFaint}
      />
    </View>
  );
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Conditions (optional)</Text>
      {showWeather && reading ? (
        <Text style={styles.chipLabel}>
          National Weather Service{reading.source === 'forecast' ? ' forecast' : ''},{' '}
          {new Date(reading.observedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          {reading.description ? ` · ${reading.description}` : ''}.{' '}
          {onUseReading ? (
            <Text style={styles.linkText} onPress={onUseReading}>
              Update
            </Text>
          ) : null}
        </Text>
      ) : null}
      <View style={styles.condRow}>
        {showWeather ? field('temperature', 'Temp °F', true, '72') : null}
        {showWeather ? field('windSpeed', 'Wind mph', true, '5') : null}
        {showWeather ? field('windDirection', 'Wind from', false, 'NW') : null}
        {showPh ? field('phLevel', 'pH', true, '7.0') : null}
      </View>
    </View>
  );
}

/** Record a chemical the office didn't preload — an extra spot treatment, a substitute product. */
export function AddChemicalForm({
  visitId,
  catalog,
  disabled,
  onAdded,
}: {
  visitId: string;
  catalog: ChemicalCatalog | null;
  disabled?: boolean;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!catalog || catalog.products.length === 0) return null;

  function pickProduct(id: string) {
    setProductId(id);
    const dflt = catalog?.products.find((p) => p.id === id)?.defaultUnitId;
    if (dflt) setUnitId(dflt);
  }

  async function submit() {
    const n = parseFloat(amount);
    if (!productId) return setError('Choose the product.');
    if (!unitId) return setError('Choose a unit.');
    if (!Number.isFinite(n) || n <= 0) return setError('Enter how much was used.');
    setError(null);
    setBusy(true);
    try {
      await addCrewChemical({ visitId, productId, chemicalAmount: n, unitOfMeasureId: unitId });
      setProductId('');
      setAmount('');
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't add the chemical — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.addButton, disabled && styles.disabled, pressed && styles.pressed]}
      >
        <Text style={styles.addButtonText}>+ Add a chemical</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Add a chemical you applied</Text>
      <Chips
        label="Product"
        options={catalog.products}
        selected={productId ? [productId] : []}
        onToggle={pickProduct}
      />
      <View style={styles.condRow}>
        <View style={styles.condField}>
          <Text style={styles.chipLabel}>Amount used</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={C.textFaint}
          />
        </View>
      </View>
      <Chips label="Unit" options={catalog.units} selected={unitId ? [unitId] : []} onToggle={setUnitId} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.buttonRow}>
        <Pressable onPress={() => setOpen(false)} style={styles.cancelButton}>
          <Text style={styles.linkText}>Cancel</Text>
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.saveButton, busy && styles.disabled, pressed && styles.pressed]}
        >
          {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveButtonText}>Save chemical</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linkRow: { paddingVertical: 6 },
  linkText: { color: C.textMuted, fontSize: 13, fontWeight: '600' },
  panel: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    padding: 10,
    gap: 8,
  },
  panelTitle: { fontSize: 13, fontWeight: '700', color: C.text },
  panelText: { fontSize: 13, color: C.text },
  restricted: { fontSize: 13, fontWeight: '700', color: C.redText },
  chipGroup: { gap: 4 },
  chipLabel: { fontSize: 12, color: C.textMuted },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipOn: { backgroundColor: C.green, borderColor: C.green },
  chipText: { fontSize: 13, fontWeight: '600', color: C.text },
  chipTextOn: { color: '#ffffff' },
  condRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  condField: { minWidth: 88, flexGrow: 1, gap: 4 },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: C.text,
  },
  addButton: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: C.card,
  },
  addButtonText: { color: C.text, fontSize: 14, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: 10 },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButton: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center', backgroundColor: C.green },
  saveButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  error: { color: C.redText, fontSize: 13 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
