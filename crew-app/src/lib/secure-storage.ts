import 'react-native-get-random-values';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Supabase auth storage adapter for React Native, following Supabase's own
 * documented pattern (https://supabase.com/docs/guides/auth/sessions —
 * "Session storage on React Native"). expo-secure-store alone can't hold a
 * Supabase session directly: it's backed by the OS keychain/keystore, which
 * on Android enforces a small per-value size limit that a session blob
 * (access token + refresh token + user object) can exceed. Instead, the
 * session is AES-encrypted with a random key, the encrypted blob (unbounded
 * size) goes in AsyncStorage, and only the small encryption key itself goes
 * in SecureStore — so the actual token content is never sitting in plain
 * AsyncStorage the way it was before (crew-app is a field-crew device that
 * gets shared/handed around, so that was a real exposure).
 */
export class LargeSecureStore {
  private async _encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async _decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return this._decrypt(key, encrypted);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}
