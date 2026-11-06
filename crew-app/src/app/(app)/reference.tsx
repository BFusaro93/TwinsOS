import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';

import { openReferenceDocument } from '@/components/chemical-crew';
import { fetchReferenceDocuments } from '@/lib/api';
import { C } from '@/lib/colors';
import type { ReferenceDocument } from '@/lib/types';
import { t } from '@/lib/i18n';

const CATEGORIES: { value: ReferenceDocument['category'] | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sds', label: 'Safety Data Sheets' },
  { value: 'label', label: 'Labels' },
  { value: 'sop', label: 'SOPs' },
  { value: 'training', label: 'Training' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'other', label: 'Other' },
];

/**
 * The company's Reference Library: chemical labels and Safety Data Sheets, SOPs, training and
 * equipment lists. Mirrors the web crew page at /crm/crew/reference. Online-only — a document
 * opens through a short-lived link.
 */
export default function ReferenceScreen() {
  const [docs, setDocs] = useState<ReferenceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('all');
  const [openError, setOpenError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchReferenceDocuments().then(
        (list) => {
          if (cancelled) return;
          setDocs(list);
          setError(null);
          setLoading(false);
        },
        () => {
          if (cancelled) return;
          setError(t('Couldn\'t load the library — check your connection.'));
          setLoading(false);
        }
      );
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const present = useMemo(() => new Set(docs.map((d) => d.category)), [docs]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter(
      (d) =>
        (category === 'all' || d.category === category) &&
        (!q || `${d.title} ${d.description ?? ''}`.toLowerCase().includes(q))
    );
  }, [docs, search, category]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Reference' }} />
      <View style={styles.top}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder={t('Search labels, SDS, procedures…')}
          placeholderTextColor={C.textFaint}
          autoCorrect={false}
        />
        <View style={styles.chips}>
          {CATEGORIES.filter((c) => c.value === 'all' || present.has(c.value as ReferenceDocument['category'])).map((c) => (
            <Pressable
              key={c.value}
              onPress={() => setCategory(c.value)}
              style={[styles.chip, category === c.value && styles.chipOn]}
            >
              <Text style={[styles.chipText, category === c.value && styles.chipTextOn]}>{t(c.label)}</Text>
            </Pressable>
          ))}
        </View>
        {openError ? <Text style={styles.error}>{openError}</Text> : null}
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={[styles.error, { margin: 16 }]}>{error}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {docs.length === 0 ? t('Your office hasn\'t added any documents yet.') : t('Nothing matches.')}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
              onPress={() =>
                void openReferenceDocument(item.id).then((ok) =>
                  setOpenError(ok ? null : t('Couldn\'t open the document — check your connection.'))
                )
              }
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {t(CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category)}
                {item.revisionDate ? ` · revised ${item.revisionDate}` : ''}
              </Text>
              {item.description ? <Text style={styles.cardMeta}>{item.description}</Text> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  top: { padding: 16, gap: 10, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  search: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: C.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: C.border, paddingVertical: 8, paddingHorizontal: 12 },
  chipOn: { backgroundColor: C.green, borderColor: C.green },
  chipText: { fontSize: 13, fontWeight: '600', color: C.text },
  chipTextOn: { color: '#ffffff' },
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 3,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  cardMeta: { fontSize: 12, color: C.textMuted },
  empty: { textAlign: 'center', color: C.textMuted, marginTop: 24 },
  error: { color: C.redText, fontSize: 13 },
});
