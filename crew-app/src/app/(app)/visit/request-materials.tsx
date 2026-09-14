import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { searchPickerProducts } from '@/lib/api';
import { useOfflineQueue } from '@/lib/offline/queue-context';
import type { PickerProduct } from '@/lib/types';

/**
 * Modal screen pushed from visit/[id].tsx's "Request Materials" button.
 * Search-and-pick a product_items catalog entry (stocked_material/
 * project_material only — see GET /api/crm/crew/products), enter a
 * quantity and optional note, submit. There's no free-text item field on
 * purpose: CLAUDE.md requires every requisition line item to reference a
 * Products catalog entry.
 *
 * Submitting enqueues a 'request_materials' offline-queue item (same queue
 * clock in/out and photos use — src/lib/offline/queue-context.tsx) rather
 * than calling the API directly, so a request made with no signal still
 * reaches the server once connectivity returns.
 */
export default function RequestMaterialsScreen() {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const theme = useTheme();
  const { enqueueRequestMaterials } = useOfflineQueue();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PickerProduct | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);
    const timeout = setTimeout(() => {
      void searchPickerProducts(query)
        .then((data) => {
          if (!cancelled) setResults(data);
        })
        .catch((err) => {
          if (!cancelled) setSearchError(err instanceof Error ? err.message : 'Search failed');
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 250); // debounce keystrokes
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  const qty = Math.max(1, Math.round(Number(quantity)) || 1);
  const canSubmit = !!visitId && !!selected && qty > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit || !selected || !visitId) return;
    setIsSubmitting(true);
    try {
      await enqueueRequestMaterials(visitId, selected.id, selected.name, qty, note.trim() || undefined);
      router.back();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (selected) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.form}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            ITEM
          </ThemedText>
          <View style={[styles.selectedCard, { backgroundColor: theme.backgroundElement }]}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.itemName}>{selected.name}</ThemedText>
              {selected.partNumber ? (
                <ThemedText themeColor="textSecondary" type="small">
                  #{selected.partNumber}
                </ThemedText>
              ) : null}
            </View>
            <Pressable onPress={() => setSelected(null)} hitSlop={12}>
              <ThemedText type="linkPrimary">Change</ThemedText>
            </Pressable>
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fieldLabel}>
            QUANTITY
          </ThemedText>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            keyboardType="number-pad"
            value={quantity}
            onChangeText={setQuantity}
          />

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fieldLabel}>
            NOTE (OPTIONAL)
          </ThemedText>
          <TextInput
            style={[styles.input, styles.noteInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
            placeholder="Anything the office should know"
            placeholderTextColor="#8a8a8a"
            value={note}
            onChangeText={setNote}
            multiline
          />

          <Pressable
            style={[styles.submitButton, { backgroundColor: canSubmit ? '#208AEF' : '#8a8a8a' }]}
            onPress={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.submitButtonText}>Submit Request</ThemedText>
            )}
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <TextInput
        style={[styles.searchInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
        placeholder="Search materials…"
        placeholderTextColor="#8a8a8a"
        value={query}
        onChangeText={setQuery}
        autoFocus
      />

      {isSearching ? <ActivityIndicator style={styles.searchSpinner} /> : null}
      {searchError ? <ThemedText style={styles.errorText}>{searchError}</ThemedText> : null}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !isSearching ? (
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              No materials found.
            </ThemedText>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.resultRow, { borderColor: theme.backgroundSelected }]}
            onPress={() => setSelected(item)}
          >
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.itemName}>{item.name}</ThemedText>
              {item.partNumber ? (
                <ThemedText themeColor="textSecondary" type="small">
                  #{item.partNumber}
                </ThemedText>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  searchSpinner: {
    marginTop: 12,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 8,
  },
  resultRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 16,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 24,
  },
  errorText: {
    color: '#d9342b',
    textAlign: 'center',
    marginTop: 12,
  },
  form: {
    padding: 20,
    gap: 6,
  },
  selectedCard: {
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  fieldLabel: {
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    marginTop: 24,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
});
