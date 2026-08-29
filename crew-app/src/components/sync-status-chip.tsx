import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useOfflineQueue } from '@/lib/offline/queue-context';

import { ThemedText } from './themed-text';

/**
 * Small honest-feedback chip for offline sync state — payroll-consequential
 * actions (clock in/out) need the crew member to know whether their tap has
 * actually reached the server yet, not just that it was accepted locally.
 * Reads straight from the offline queue (src/lib/offline/queue-context.tsx),
 * so it reflects every screen's queued actions, not just the current one.
 */
export function SyncStatusChip() {
  const { isReady, isSyncing, pendingCount, failedItems } = useOfflineQueue();

  if (!isReady) return null;

  if (failedItems.length > 0) {
    return (
      <Chip color="#d9342b" label={`${failedItems.length} didn't sync`} />
    );
  }

  if (isSyncing) {
    return (
      <View style={[styles.chip, { backgroundColor: '#208AEF22' }]}>
        <ActivityIndicator size="small" color="#208AEF" />
        <ThemedText style={[styles.chipText, { color: '#208AEF' }]}>Syncing…</ThemedText>
      </View>
    );
  }

  if (pendingCount > 0) {
    return <Chip color="#c98a1f" label={`${pendingCount} pending`} />;
  }

  return <Chip color="#2fa84f" label="All synced" />;
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: `${color}22` }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText style={[styles.chipText, { color }]}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
