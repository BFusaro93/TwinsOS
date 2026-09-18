import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { SyncStatusChip } from '@/components/sync-status-chip';
import { ThemedText } from '@/components/themed-text';
import {
  fetchJobProducts,
  fetchVisitChemicals,
  fetchVisitPhotos,
  fetchVisitRequisitions,
  todayLocalDate,
} from '@/lib/api';
import { C } from '@/lib/colors';
import { useCrewStops } from '@/lib/hooks/use-crew-stops';
import {
  elapsedSince,
  formatStopAddress,
  formatStopTimeWindow,
  STATUS_LABEL,
  stopProgress,
  STOP_PROGRESS_COLOR,
  STOP_PROGRESS_LABEL,
} from '@/lib/format';
import { applyStopQueueOverlay } from '@/lib/offline/overlay';
import { captureVisitPhoto } from '@/lib/offline/photos';
import { useOfflineQueue } from '@/lib/offline/queue-context';
import type { AddPhotoPayload, RecordMaterialUsagePayload, RequestMaterialsPayload } from '@/lib/offline/types';
import type {
  CrewStopVisit,
  JobProductMaterial,
  VisitChemicalApplication,
  VisitPhoto,
  VisitRequisition,
} from '@/lib/types';

const REQUISITION_STATUS_LABEL: Record<VisitRequisition['status'], string> = {
  draft: 'Submitted',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  ordered: 'Ordered',
  closed: 'Closed',
};

const REQUISITION_STATUS_COLOR: Record<VisitRequisition['status'], string> = {
  draft: C.amberTextStrong,
  pending_approval: C.amberTextStrong,
  approved: C.green,
  rejected: C.red,
  ordered: C.green,
  closed: '#8a8a8a',
};

const TODAY = todayLocalDate();

/** HH:mm in the device's local time, captured at the moment of the tap. */
function localTimeNow(): string {
  return new Date().toTimeString().slice(0, 5);
}

/**
 * Stop detail screen — clock in/out, pause/resume, notes, photos, materials
 * for one "stop" (everything the crew does at one client/address today,
 * possibly spanning several crm_job_visits rows — see
 * src/lib/utils/visit-stops.ts). The route param is still named `id` (kept
 * for minimal churn from the previous per-visit screen) but it's now the
 * stop's anchorVisitId. Photos and materials requests are still filed
 * against this one anchor visit id, matching the web stop page.
 */
export default function StopDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Today's schedule is the only data source this phase has — there's no
  // single-stop GET route yet, so this screen shares useCrewStops() with
  // home.tsx and looks its stop up by anchorVisitId.
  const { stops, isLoading, error, refetch } = useCrewStops(TODAY);
  const {
    itemsForVisit,
    enqueueClockIn,
    enqueueClockOut,
    enqueuePause,
    enqueueResume,
    enqueueAddPhoto,
    enqueueRecordMaterialUsage,
    retry,
    discard,
  } = useOfflineQueue();
  const [notes, setNotes] = useState('');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [confirmedPhotos, setConfirmedPhotos] = useState<VisitPhoto[]>([]);
  const [requisitions, setRequisitions] = useState<VisitRequisition[]>([]);
  const [chemicals, setChemicals] = useState<VisitChemicalApplication[]>([]);
  const [plannedMaterials, setPlannedMaterials] = useState<JobProductMaterial[]>([]);
  const [, forceTick] = useState(0);

  const serverStop = useMemo(() => stops.find((s) => s.anchorVisitId === id), [stops, id]);
  const queueItems = useMemo(() => (id ? itemsForVisit(id) : []), [id, itemsForVisit]);
  const stop = useMemo(
    () => (serverStop ? applyStopQueueOverlay(serverStop, queueItems) : undefined),
    [serverStop, queueItems]
  );
  const progress = stop ? stopProgress(stop) : null;

  const clockQueueItems = queueItems.filter((i) => i.type === 'clock_in' || i.type === 'clock_out');
  const failedClockItem = clockQueueItems.find((i) => i.status === 'failed');
  const isClockActionPending = clockQueueItems.some((i) => i.status === 'pending' || i.status === 'syncing');

  const pauseQueueItems = queueItems.filter((i) => i.type === 'pause' || i.type === 'resume');
  const failedPauseItem = pauseQueueItems.find((i) => i.status === 'failed');
  const isPauseActionPending = pauseQueueItems.some((i) => i.status === 'pending' || i.status === 'syncing');

  const photoQueueItems = queueItems.filter((i) => i.type === 'add_photo');
  const materialsQueueItems = queueItems.filter((i) => i.type === 'request_materials');
  const materialUsageQueueItems = queueItems.filter((i) => i.type === 'record_material_usage');

  // Once every queue item for this stop clears (synced), pull fresh server
  // truth — e.g. server-computed actual_hours after a clock-out, or a newly
  // created requisition's real status.
  const prevActiveCountRef = useRef(0);
  useEffect(() => {
    const activeCount = queueItems.filter((i) => i.status !== 'failed').length;
    if (prevActiveCountRef.current > 0 && activeCount === 0) {
      void refetch();
      void loadPhotos();
      void loadRequisitions();
      void loadChemicals();
      void loadPlannedMaterials();
    }
    prevActiveCountRef.current = activeCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueItems]);

  async function loadPhotos() {
    if (!id) return;
    try {
      const photos = await fetchVisitPhotos(id);
      setConfirmedPhotos(photos);
    } catch {
      // Offline or transient failure — the queued/local photos still render below,
      // so this silently keeping the last-known confirmed list is acceptable.
    }
  }

  async function loadRequisitions() {
    if (!id) return;
    try {
      const data = await fetchVisitRequisitions(id);
      setRequisitions(data);
    } catch {
      // Same tolerance as loadPhotos() above — a stale "My Requests" list
      // while offline is acceptable; queued/unsynced requests still render.
    }
  }

  async function loadChemicals() {
    if (!id) return;
    try {
      const data = await fetchVisitChemicals(id);
      setChemicals(data);
    } catch {
      // Same tolerance as loadPhotos()/loadRequisitions() above — a stale
      // (or empty) chemical list while offline is acceptable; this is
      // read-only reference info, not something crew acts on here.
    }
  }

  async function loadPlannedMaterials() {
    if (!id) return;
    try {
      const data = await fetchJobProducts(id);
      setPlannedMaterials(data);
    } catch {
      // Same tolerance as the other load*() functions above.
    }
  }

  useEffect(() => {
    void loadPhotos();
    void loadRequisitions();
    void loadChemicals();
    void loadPlannedMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Re-render every 30s so the "clocked in for Xh Ym"/"on break for Xh Ym" readout stays live.
  useEffect(() => {
    if (progress !== 'clocked_in' && progress !== 'on_break') return;
    const interval = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, [progress]);

  const handleClockIn = () => {
    if (!stop) return;
    // Written to the local queue immediately — this resolves synchronously
    // from the UI's perspective (no network wait), which is what makes the
    // "Clocked In" state below reflect the tap right away.
    void enqueueClockIn(stop.anchorVisitId, localTimeNow());
  };

  const handleClockOut = () => {
    if (!stop) return;
    void enqueueClockOut(stop.anchorVisitId, localTimeNow(), notes.trim() || undefined);
  };

  const handlePause = () => {
    if (!stop) return;
    void enqueuePause(stop.anchorVisitId);
  };

  const handleResume = () => {
    if (!stop) return;
    void enqueueResume(stop.anchorVisitId);
  };

  const handleAddPhoto = async (source: 'camera' | 'library') => {
    if (!stop) return;
    setPhotoError(null);
    setIsCapturing(true);
    try {
      const captured = await captureVisitPhoto(stop.anchorVisitId, source);
      if (!captured) return; // user canceled
      await enqueueAddPhoto(stop.anchorVisitId, captured.localUri, captured.mimeType, captured.fileName);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Failed to add photo');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRequestMaterials = () => {
    if (!stop) return;
    router.push({ pathname: '/visit/request-materials', params: { visitId: stop.anchorVisitId } });
  };

  const handleMarkUsed = (material: JobProductMaterial, usedQty: number) => {
    if (!stop) return;
    void enqueueRecordMaterialUsage(stop.anchorVisitId, material.id, material.productName, { usedQty });
  };

  const handleMarkNotUsed = (material: JobProductMaterial) => {
    if (!stop) return;
    Alert.alert('Mark as not used?', `${material.productName} won't be counted as used on this job.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Not Used',
        style: 'destructive',
        onPress: () =>
          void enqueueRecordMaterialUsage(stop.anchorVisitId, material.id, material.productName, {
            notUsed: true,
          }),
      },
    ]);
  };

  const confirmDiscard = (queueItemId: string, description: string) => {
    Alert.alert('Discard this?', description, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void discard(queueItemId) },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, styles.screenBg]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, styles.screenBg]}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={() => void refetch()}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!stop) {
    return (
      <View style={[styles.centered, styles.screenBg]}>
        <ThemedText type="subtitle" style={styles.emptyTitle}>
          Job not found
        </ThemedText>
        <Text style={styles.emptyBody}>This job isn&apos;t in today&apos;s schedule anymore.</Text>
      </View>
    );
  }

  const totalActualHours = stop.visits.reduce((sum, v) => sum + (v.actualHours ?? 0), 0);
  const completionNotes = stop.visits.map((v) => v.completionNotes).find(Boolean) ?? null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: stop.clientName ?? 'Job' }} />

      <SyncStatusChip />

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.clientName}>{stop.clientName ?? 'Unknown client'}</Text>
          <View style={[styles.statusPill, { backgroundColor: STOP_PROGRESS_COLOR[progress!] }]}>
            <Text style={styles.statusPillText}>{STOP_PROGRESS_LABEL[progress!]}</Text>
          </View>
        </View>

        <View style={styles.infoStack}>
          <InfoRow label="Time window" value={formatStopTimeWindow(stop)} />
          {formatStopAddress(stop) ? <InfoRow label="Address" value={formatStopAddress(stop)!} /> : null}
          {stop.clientPhone ? <InfoRow label="Phone" value={stop.clientPhone} /> : null}
        </View>
      </View>

      {stop.notesToCrew ? (
        <View style={styles.amberBox}>
          <Text style={styles.amberBoxTitle}>Notes from the office</Text>
          <Text style={styles.amberBoxText}>{stop.notesToCrew}</Text>
        </View>
      ) : null}

      <ServicesSection visits={stop.visits} />

      <ChemicalsSection chemicals={chemicals} />

      {progress === 'on_break' && stop.pausedAt ? (
        <View style={styles.blueBanner}>
          <View>
            <Text style={styles.blueBannerTitle}>On Break</Text>
            <Text style={styles.blueBannerSubtitle}>
              {isPauseActionPending ? 'Not yet synced' : 'On break'}
            </Text>
          </View>
          <Text style={styles.bannerTimer}>{elapsedSince(stop.pausedAt)}</Text>
        </View>
      ) : progress === 'clocked_in' && stop.clockedInAt ? (
        <View style={styles.amberBanner}>
          <View>
            <Text style={styles.amberBannerTitle}>Job Running</Text>
            <Text style={styles.amberBannerSubtitle}>
              {isClockActionPending ? 'Not yet synced' : 'In progress'}
            </Text>
          </View>
          <Text style={[styles.bannerTimer, { color: C.amberTextStrong }]}>
            {elapsedSince(stop.clockedInAt)}
          </Text>
        </View>
      ) : null}

      {progress === 'completed' ? (
        <View style={styles.greenBox}>
          <Text style={styles.greenBoxTitle}>Job Complete</Text>
          {totalActualHours > 0 ? (
            <Text style={styles.greenBoxSubtitle}>Actual hours: {totalActualHours.toFixed(2)}</Text>
          ) : null}
          {completionNotes ? <Text style={styles.greenBoxSubtitle}>{completionNotes}</Text> : null}
          {isClockActionPending ? (
            <Text style={styles.greenBoxSubtitle}>Not yet synced — will confirm once back online.</Text>
          ) : null}
        </View>
      ) : null}

      {failedClockItem ? (
        <ConflictBox
          message={failedClockItem.lastError ?? 'This action failed to sync.'}
          onRetry={() => void retry(failedClockItem.id)}
          onDiscard={() =>
            confirmDiscard(
              failedClockItem.id,
              'This will drop the unsynced action. Pull to refresh afterwards to see the current state.'
            )
          }
        />
      ) : null}

      {failedPauseItem ? (
        <ConflictBox
          message={failedPauseItem.lastError ?? "This didn't sync."}
          onRetry={() => void retry(failedPauseItem.id)}
          onDiscard={() =>
            confirmDiscard(failedPauseItem.id, 'This will drop the unsynced break action.')
          }
        />
      ) : null}

      {progress === 'clocked_in' || progress === 'on_break' ? (
        <TextInput
          style={styles.notesInput}
          placeholder="Completion notes (optional)"
          placeholderTextColor="#94a3b8"
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      ) : null}

      {progress === 'not_started' ? (
        <ActionButton label="Clock In" variant="solidGreen" onPress={handleClockIn} />
      ) : null}

      {progress === 'on_break' ? (
        <ActionButton label="Resume Job" variant="solidGreen" onPress={handleResume} />
      ) : progress === 'clocked_in' ? (
        <ActionButton label="Take a Break" variant="outlineBlue" onPress={handlePause} />
      ) : null}

      {progress === 'clocked_in' || progress === 'on_break' ? (
        <ActionButton label="Clock Out" variant="solidRed" onPress={handleClockOut} />
      ) : null}

      {progress === 'skipped' ? (
        <View style={styles.card}>
          <Text style={styles.doneText}>This job was skipped or cancelled.</Text>
        </View>
      ) : null}

      <PhotosSection
        confirmedPhotos={confirmedPhotos}
        photoQueueItems={photoQueueItems}
        isCapturing={isCapturing}
        photoError={photoError}
        onAdd={handleAddPhoto}
        onRetry={(itemId) => void retry(itemId)}
        onDiscard={(itemId) =>
          confirmDiscard(itemId, 'This photo will not be uploaded. It stays saved on this device.')
        }
      />

      <PlannedMaterialsSection
        materials={plannedMaterials}
        usageQueueItems={materialUsageQueueItems}
        onMarkUsed={handleMarkUsed}
        onMarkNotUsed={handleMarkNotUsed}
        onRetry={(itemId) => void retry(itemId)}
        onDiscard={(itemId) => confirmDiscard(itemId, "This won't be recorded as used.")}
      />

      <MaterialsSection
        requisitions={requisitions}
        materialsQueueItems={materialsQueueItems}
        onRequest={handleRequestMaterials}
        onRetry={(itemId) => void retry(itemId)}
        onDiscard={(itemId) =>
          confirmDiscard(itemId, 'This materials request will not be submitted.')
        }
      />
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  variant,
  onPress,
}: {
  label: string;
  variant: 'solidGreen' | 'solidRed' | 'outlineBlue';
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionButton,
        variant === 'solidGreen' && styles.actionButtonGreen,
        variant === 'solidRed' && styles.actionButtonRed,
        variant === 'outlineBlue' && styles.actionButtonOutlineBlue,
        pressed && styles.actionButtonPressed,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === 'outlineBlue' && styles.actionButtonTextBlue,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ConflictBox({
  message,
  onRetry,
  onDiscard,
}: {
  message: string;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <View style={styles.conflictBox}>
      <Text style={styles.conflictText}>{message}</Text>
      <View style={styles.conflictActions}>
        <Pressable style={styles.conflictButton} onPress={onRetry}>
          <Text style={styles.conflictButtonText}>Retry</Text>
        </Pressable>
        <Pressable style={[styles.conflictButton, styles.conflictButtonSecondary]} onPress={onDiscard}>
          <Text style={styles.conflictButtonText}>Discard</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** One row per underlying visit in the stop — mirrors the web stop page's services checklist. */
function ServicesSection({ visits }: { visits: CrewStopVisit[] }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardHeaderTitle}>
          Services {visits.length > 1 ? `(${visits.length})` : ''}
        </Text>
      </View>
      {visits.length === 0 ? (
        <Text style={styles.mutedRowText}>No services listed</Text>
      ) : (
        visits.map((v, index) => (
          <View
            key={v.id}
            style={[styles.serviceRow, index === visits.length - 1 && styles.lastRow]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.serviceRowTitle}>{v.serviceName ?? 'Service'}</Text>
              {v.budgetedHours != null ? (
                <Text style={styles.serviceRowSubtitle}>Budgeted: {v.budgetedHours}h</Text>
              ) : null}
            </View>
            <Text
              style={[
                styles.serviceStatus,
                v.status === 'skipped'
                  ? styles.serviceStatusSkipped
                  : v.status === 'completed'
                    ? styles.serviceStatusDone
                    : undefined,
              ]}
            >
              {STATUS_LABEL[v.status]}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

/**
 * What to use and how much finished-mix solution to prepare, computed from
 * the product's application rate + dilution ratio when the office has it
 * configured. Mirrors the web crew stop page's "Chemical Mix" card. Renders
 * nothing when there's nothing marked used for this visit — most visits
 * have no chemical tracking at all.
 */
function ChemicalsSection({ chemicals }: { chemicals: VisitChemicalApplication[] }) {
  const used = chemicals.filter((c) => c.used);
  if (used.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardHeaderTitle}>Chemical Mix</Text>
      </View>
      <View style={styles.cardBody}>
        {used.map((a) => (
          <View key={a.id} style={styles.chemicalRow}>
            <Text style={styles.chemicalProductName}>{a.productName ?? 'Chemical'}</Text>
            {a.solutionAmount != null ? (
              <Text style={styles.chemicalAmountText}>
                Use{' '}
                <Text style={styles.chemicalAmountStrong}>
                  {a.solutionAmount} {a.solutionUnitName ?? ''}
                </Text>{' '}
                of finished mix
                {a.chemicalAmount != null ? ` (${a.chemicalAmount} ${a.unitName ?? ''} active)` : ''}
              </Text>
            ) : a.chemicalAmount != null ? (
              <Text style={styles.chemicalAmountText}>
                {a.chemicalAmount} {a.unitName ?? ''}
              </Text>
            ) : null}
            {a.applicationRateLabel ? (
              <Text style={styles.chemicalRateLabel}>{a.applicationRateLabel}</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function PhotosSection({
  confirmedPhotos,
  photoQueueItems,
  isCapturing,
  photoError,
  onAdd,
  onRetry,
  onDiscard,
}: {
  confirmedPhotos: VisitPhoto[];
  photoQueueItems: ReturnType<typeof useOfflineQueue>['items'];
  isCapturing: boolean;
  photoError: string | null;
  onAdd: (source: 'camera' | 'library') => void;
  onRetry: (itemId: string) => void;
  onDiscard: (itemId: string) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardHeaderTitle}>
          Photos {confirmedPhotos.length + photoQueueItems.length > 0
            ? `(${confirmedPhotos.length + photoQueueItems.length})`
            : ''}
        </Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.photoButtonRow}>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => onAdd('camera')}
            disabled={isCapturing}
          >
            <Text style={styles.secondaryButtonText}>Take Photo</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => onAdd('library')}
            disabled={isCapturing}
          >
            <Text style={styles.secondaryButtonText}>Choose from Library</Text>
          </Pressable>
          {isCapturing ? <ActivityIndicator size="small" /> : null}
        </View>

        {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}

        {confirmedPhotos.length === 0 && photoQueueItems.length === 0 ? (
          <Text style={styles.mutedCentered}>No photos yet</Text>
        ) : (
          <View style={styles.photoGrid}>
            {confirmedPhotos.map((photo) => (
              <View key={photo.id} style={styles.photoTile}>
                {photo.signedUrl ? (
                  <Image source={{ uri: photo.signedUrl }} style={styles.photoImage} />
                ) : (
                  <View style={[styles.photoImage, styles.photoPlaceholder]} />
                )}
              </View>
            ))}

            {photoQueueItems.map((item) => {
              const payload = item.payload as AddPhotoPayload;
              return (
                <View key={item.id} style={styles.photoTile}>
                  <Image source={{ uri: payload.localUri }} style={[styles.photoImage, styles.photoDimmed]} />
                  <View
                    style={[
                      styles.photoBadge,
                      { backgroundColor: item.status === 'failed' ? C.red : C.amberTextStrong },
                    ]}
                  >
                    <Text style={styles.photoBadgeText}>
                      {item.status === 'failed' ? 'Failed' : item.status === 'syncing' ? 'Uploading…' : 'Queued'}
                    </Text>
                  </View>
                  {item.status === 'failed' ? (
                    <View style={styles.photoFailedActions}>
                      <Pressable onPress={() => onRetry(item.id)}>
                        <Text style={styles.linkText}>Retry</Text>
                      </Pressable>
                      <Pressable onPress={() => onDiscard(item.id)}>
                        <Text style={styles.linkText}>Discard</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Materials office staff already planned/called for on this job
 * (crm_job_products) — distinct from MaterialsSection below, which is an
 * ad-hoc NEW request for something not already planned. Lets the crew
 * confirm or correct the actual quantity used against what was called for,
 * since the two often differ in the field. A queued-but-unsynced usage item
 * replaces that row's editable controls with its pending/failed state,
 * mirroring how PhotosSection/MaterialsSection show queued items — once
 * confirmed by the server (row removed from the queue), the next
 * loadPlannedMaterials() refetch shows the resolved, read-only state.
 */
function PlannedMaterialsSection({
  materials,
  usageQueueItems,
  onMarkUsed,
  onMarkNotUsed,
  onRetry,
  onDiscard,
}: {
  materials: JobProductMaterial[];
  usageQueueItems: ReturnType<typeof useOfflineQueue>['items'];
  onMarkUsed: (material: JobProductMaterial, usedQty: number) => void;
  onMarkNotUsed: (material: JobProductMaterial) => void;
  onRetry: (itemId: string) => void;
  onDiscard: (itemId: string) => void;
}) {
  if (materials.length === 0) return null;

  const queuedByJobProductId = new Map(
    usageQueueItems.map((item) => [(item.payload as RecordMaterialUsagePayload).jobProductId, item])
  );

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardHeaderTitle}>Materials called for</Text>
      </View>
      <View style={styles.materialsList}>
        {materials.map((material, index) => {
          const queueItem = queuedByJobProductId.get(material.id);
          return (
            <View
              key={material.id}
              style={[styles.plannedMaterialRow, index === materials.length - 1 && styles.lastRow]}
            >
              {queueItem ? (
                <QueuedMaterialRow item={queueItem} material={material} onRetry={onRetry} onDiscard={onDiscard} />
              ) : material.status === 'pending' ? (
                <PendingMaterialRow material={material} onMarkUsed={onMarkUsed} onMarkNotUsed={onMarkNotUsed} />
              ) : (
                <ResolvedMaterialRow material={material} />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function PendingMaterialRow({
  material,
  onMarkUsed,
  onMarkNotUsed,
}: {
  material: JobProductMaterial;
  onMarkUsed: (material: JobProductMaterial, usedQty: number) => void;
  onMarkNotUsed: (material: JobProductMaterial) => void;
}) {
  const [qtyText, setQtyText] = useState(String(material.plannedQty));

  const parsedQty = Number(qtyText);
  const isValid = qtyText.trim() !== '' && Number.isFinite(parsedQty) && parsedQty >= 0;

  return (
    <>
      <View style={styles.plannedMaterialHeader}>
        <Text style={styles.materialsItemName}>{material.productName}</Text>
        <Text style={styles.plannedQtyText}>Called for: {material.plannedQty}</Text>
      </View>
      <View style={styles.plannedMaterialActionsRow}>
        <TextInput
          style={styles.qtyInput}
          keyboardType="decimal-pad"
          value={qtyText}
          onChangeText={setQtyText}
        />
        <Pressable
          style={({ pressed }) => [
            styles.markUsedButton,
            pressed && styles.markUsedButtonPressed,
            !isValid && styles.markUsedButtonDisabled,
          ]}
          disabled={!isValid}
          onPress={() => onMarkUsed(material, parsedQty)}
        >
          <Text style={styles.markUsedButtonText}>Mark Used</Text>
        </Pressable>
        <Pressable onPress={() => onMarkNotUsed(material)} hitSlop={8}>
          <Text style={styles.linkText}>Not Used</Text>
        </Pressable>
      </View>
    </>
  );
}

function QueuedMaterialRow({
  item,
  material,
  onRetry,
  onDiscard,
}: {
  item: ReturnType<typeof useOfflineQueue>['items'][number];
  material: JobProductMaterial;
  onRetry: (itemId: string) => void;
  onDiscard: (itemId: string) => void;
}) {
  const payload = item.payload as RecordMaterialUsagePayload;
  const summary = payload.notUsed ? 'Not used' : `Used: ${payload.usedQty}`;
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.plannedMaterialHeader}>
        <Text style={styles.materialsItemName}>{material.productName}</Text>
        <Text style={styles.plannedQtyText}>Called for: {material.plannedQty}</Text>
      </View>
      <View style={styles.queuedMaterialFooter}>
        <Text style={styles.plannedQtyText}>{summary}</Text>
        {item.status === 'failed' ? (
          <View style={styles.materialsFailedActions}>
            <Pressable onPress={() => onRetry(item.id)}>
              <Text style={styles.linkText}>Retry</Text>
            </Pressable>
            <Pressable onPress={() => onDiscard(item.id)}>
              <Text style={styles.linkText}>Discard</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.materialsStatusPill, { backgroundColor: C.amberTextStrong }]}>
            <Text style={styles.materialsStatusPillText}>
              {item.status === 'syncing' ? 'Sending…' : 'Queued'}
            </Text>
          </View>
        )}
      </View>
      {item.status === 'failed' ? (
        <Text style={[styles.errorText, styles.materialsErrorText]}>{item.lastError}</Text>
      ) : null}
    </View>
  );
}

function ResolvedMaterialRow({ material }: { material: JobProductMaterial }) {
  const color = material.status === 'not_used' ? C.amberTextStrong : C.green;
  return (
    <View style={styles.plannedMaterialHeader}>
      <View>
        <Text style={styles.materialsItemName}>{material.productName}</Text>
        <Text style={styles.plannedQtyText}>Called for: {material.plannedQty}</Text>
      </View>
      <View style={[styles.materialsStatusPill, { backgroundColor: color }]}>
        <Text style={styles.materialsStatusPillText}>
          {material.status === 'not_used' ? 'Not used' : `Used: ${material.qty}`}
        </Text>
      </View>
    </View>
  );
}

/**
 * "Request Materials" action + "My Requests" status list — Equipt's
 * Requisition system surfaced for the field. A queued-but-not-yet-synced
 * request (materialsQueueItems, status 'pending'/'syncing'/'failed') renders
 * alongside server-confirmed ones (requisitions, from GET
 * /api/crm/crew/visits/:id/requisitions) rather than merging into a single
 * list — unlike clock/pause state (see src/lib/offline/overlay.ts) a
 * materials request has no server "current value" to optimistically
 * overwrite; it's purely additive, so there's nothing to merge, only two
 * lists to show together.
 */
function MaterialsSection({
  requisitions,
  materialsQueueItems,
  onRequest,
  onRetry,
  onDiscard,
}: {
  requisitions: VisitRequisition[];
  materialsQueueItems: ReturnType<typeof useOfflineQueue>['items'];
  onRequest: () => void;
  onRetry: (itemId: string) => void;
  onDiscard: (itemId: string) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardHeaderRow, styles.materialsHeaderRow]}>
        <Text style={styles.cardHeaderTitle}>Materials requests</Text>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
          onPress={onRequest}
        >
          <Text style={styles.secondaryButtonText}>Request Materials</Text>
        </Pressable>
      </View>

      <View style={styles.cardBody}>
        {requisitions.length === 0 && materialsQueueItems.length === 0 ? (
          <Text style={styles.mutedRowText}>No materials requested for this job.</Text>
        ) : (
          <View style={styles.materialsList}>
            {materialsQueueItems.map((item) => {
              const payload = item.payload as RequestMaterialsPayload;
              return (
                <View key={item.id} style={styles.materialsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.materialsItemName}>
                      {payload.quantity} × {payload.productItemName}
                    </Text>
                    {item.status === 'failed' ? (
                      <Text style={[styles.errorText, styles.materialsErrorText]}>{item.lastError}</Text>
                    ) : null}
                  </View>
                  {item.status === 'failed' ? (
                    <View style={styles.materialsFailedActions}>
                      <Pressable onPress={() => onRetry(item.id)}>
                        <Text style={styles.linkText}>Retry</Text>
                      </Pressable>
                      <Pressable onPress={() => onDiscard(item.id)}>
                        <Text style={styles.linkText}>Discard</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={[styles.materialsStatusPill, { backgroundColor: C.amberTextStrong }]}>
                      <Text style={styles.materialsStatusPillText}>
                        {item.status === 'syncing' ? 'Sending…' : 'Queued'}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}

            {requisitions.map((req) => (
              <View key={req.id} style={styles.materialsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.materialsItemName}>{req.title}</Text>
                  <Text style={styles.serviceRowSubtitle}>{req.requisitionNumber}</Text>
                </View>
                <View
                  style={[styles.materialsStatusPill, { backgroundColor: REQUISITION_STATUS_COLOR[req.status] }]}
                >
                  <Text style={styles.materialsStatusPillText}>{REQUISITION_STATUS_LABEL[req.status]}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenBg: {
    backgroundColor: C.bg,
  },
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 60,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },

  // Generic white card, matching the web page's `bg-white rounded-xl border`
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  cardHeaderRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.headerBorder,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },
  cardBody: {
    padding: 16,
    gap: 12,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    padding: 16,
  },
  clientName: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    flex: 1,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  infoStack: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  infoRow: {
    gap: 2,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: C.textFaint,
  },
  infoValue: {
    fontSize: 15,
    color: C.text,
  },

  amberBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.amberBorder,
    backgroundColor: C.amberBg,
    padding: 14,
    gap: 4,
  },
  amberBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.amberText,
  },
  amberBoxText: {
    fontSize: 14,
    color: C.text,
  },

  amberBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.amberBorder,
    backgroundColor: C.amberBg,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  amberBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.amberText,
  },
  amberBannerSubtitle: {
    fontSize: 12,
    color: C.amberTextStrong,
    marginTop: 2,
  },
  blueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.blueBorder,
    backgroundColor: C.blueBg,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  blueBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.blueText,
  },
  blueBannerSubtitle: {
    fontSize: 12,
    color: C.blue,
    marginTop: 2,
  },
  bannerTimer: {
    fontSize: 18,
    fontWeight: '800',
    color: C.blueText,
    fontVariant: ['tabular-nums'],
  },

  greenBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.greenBorder,
    backgroundColor: C.greenBg,
    padding: 16,
    alignItems: 'center',
    gap: 2,
  },
  greenBoxTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.greenText,
  },
  greenBoxSubtitle: {
    fontSize: 12,
    color: C.green,
  },

  conflictBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.redBorder,
    backgroundColor: C.redBg,
    padding: 14,
    gap: 10,
  },
  conflictText: {
    color: C.redText,
    fontSize: 14,
  },
  conflictActions: {
    flexDirection: 'row',
    gap: 12,
  },
  conflictButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: C.red,
  },
  conflictButtonSecondary: {
    backgroundColor: '#8a8a8a',
  },
  conflictButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },

  notesInput: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: C.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Primary full-width actions — bold, tall, high-contrast, matching the
  // web page's h-14 buttons so it's unambiguous what to tap next.
  actionButton: {
    borderRadius: 12,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonGreen: {
    backgroundColor: C.green,
  },
  actionButtonRed: {
    backgroundColor: C.red,
  },
  actionButtonOutlineBlue: {
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.blue,
  },
  actionButtonPressed: {
    opacity: 0.85,
  },
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  actionButtonTextBlue: {
    color: C.blue,
  },

  doneText: {
    textAlign: 'center',
    color: C.textMuted,
    padding: 16,
  },
  errorText: {
    color: C.redText,
    textAlign: 'center',
    fontSize: 13,
  },
  materialsErrorText: {
    textAlign: 'left',
    marginTop: 2,
  },
  retryButton: {
    backgroundColor: C.blue,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
    color: C.textMuted,
  },

  // Secondary actions inside a card (Take Photo, Choose from Library, Request
  // Materials) — a clearly-bordered pill so it doesn't blend into the card
  // background the way an unstyled flat Pressable would.
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: C.blue,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: C.blueBg,
  },
  secondaryButtonPressed: {
    backgroundColor: C.blueBorder,
  },
  secondaryButtonText: {
    color: C.blueText,
    fontWeight: '600',
    fontSize: 13,
  },
  linkText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  mutedRowText: {
    color: C.textFaint,
    fontSize: 14,
    padding: 16,
  },
  mutedCentered: {
    color: C.textFaint,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
  },

  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.headerBorder,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  serviceRowTitle: {
    fontSize: 14,
    color: C.text,
  },
  serviceRowSubtitle: {
    fontSize: 12,
    color: C.textFaint,
    marginTop: 2,
  },
  serviceStatus: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textMuted,
  },
  serviceStatusDone: {
    color: C.green,
  },
  serviceStatusSkipped: {
    color: C.amberTextStrong,
  },

  chemicalRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.greenBorder,
    backgroundColor: C.greenBg,
    padding: 12,
    gap: 2,
  },
  chemicalProductName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.greenText,
  },
  chemicalAmountText: {
    fontSize: 13,
    color: C.greenText,
  },
  chemicalAmountStrong: {
    fontWeight: '700',
  },
  chemicalRateLabel: {
    fontSize: 12,
    color: C.green,
  },

  photoButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoTile: {
    width: 96,
    gap: 4,
  },
  photoImage: {
    width: 96,
    height: 96,
    borderRadius: 8,
  },
  photoPlaceholder: {
    backgroundColor: '#e2e8f0',
  },
  photoDimmed: {
    opacity: 0.55,
  },
  photoBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    borderRadius: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  photoBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  photoFailedActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  plannedMaterialRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.headerBorder,
    gap: 8,
  },
  plannedMaterialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  plannedQtyText: {
    fontSize: 12,
    color: C.textFaint,
    marginTop: 2,
  },
  plannedMaterialActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyInput: {
    width: 64,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: C.text,
    textAlign: 'center',
  },
  markUsedButton: {
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: C.green,
  },
  markUsedButtonPressed: {
    opacity: 0.85,
  },
  markUsedButtonDisabled: {
    opacity: 0.4,
  },
  markUsedButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  queuedMaterialFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  materialsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  materialsList: {
    gap: 10,
  },
  materialsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.headerBorder,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  materialsItemName: {
    fontSize: 14,
    color: C.text,
  },
  materialsFailedActions: {
    flexDirection: 'row',
    gap: 14,
  },
  materialsStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  materialsStatusPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
