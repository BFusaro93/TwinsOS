import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';

export interface CapturedPhoto {
  localUri: string;
  mimeType: string;
  fileName: string;
}

/**
 * Launches the camera or photo library, then immediately copies the
 * selected image into this app's own document directory under
 * visit-photos/{visitId}/ — the picker's own uri (especially straight out
 * of the camera) can point at a transient cache location the OS may
 * reclaim before the queued upload runs, so this copy is what the offline
 * queue actually references (see queue-context.tsx's enqueueAddPhoto).
 *
 * Returns null if the user canceled.
 */
export async function captureVisitPhoto(
  visitId: string,
  source: 'camera' | 'library'
): Promise<CapturedPhoto | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
    throw new Error(
      source === 'camera'
        ? 'Camera permission was denied. Enable it in Settings to add job photos.'
        : 'Photo library permission was denied. Enable it in Settings to add job photos.'
    );
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: 'images' });

  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const extFromMime = mimeType.split('/')[1] ?? 'jpg';
  const ext = (asset.fileName ? asset.fileName.split('.').pop() : null) || extFromMime;

  const destDir = new Directory(Paths.document, 'visit-photos', visitId);
  destDir.create({ intermediates: true, idempotent: true });

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const destFile = new File(destDir, fileName);
  await new File(asset.uri).copy(destFile);

  return { localUri: destFile.uri, mimeType, fileName };
}
