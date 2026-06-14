import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { AppColors } from '../constants/appColors';
import {
  extractAccountFromDocument,
  extractTransactionFromDocument,
  summarizeExtractedFields,
  type ExtractedAccountFields,
  type ExtractedTransactionFields,
  type ScanDocumentType,
} from '../lib/documentExtract';

export type ScannedFile = {
  uri: string;
  name: string;
  type: ScanDocumentType;
};

type ScanDocumentButtonProps =
  | {
      mode: 'transaction';
      onExtracted: (fields: ExtractedTransactionFields, file: ScannedFile) => void;
      disabled?: boolean;
    }
  | {
      mode: 'account';
      onExtracted: (fields: ExtractedAccountFields, file: ScannedFile) => void;
      disabled?: boolean;
    };

async function pickDocument(): Promise<ScannedFile | null> {
  return new Promise((resolve) => {
    Alert.alert('AI Scan Document', 'Choose a document source', [
      {
        text: 'Camera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Camera permission is required.');
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (result.canceled || !result.assets[0]) {
            resolve(null);
            return;
          }
          resolve({
            uri: result.assets[0].uri,
            name: `scan_${Date.now()}.jpg`,
            type: 'image',
          });
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
          if (result.canceled || !result.assets[0]) {
            resolve(null);
            return;
          }
          const asset = result.assets[0];
          resolve({
            uri: asset.uri,
            name: asset.fileName || `scan_${Date.now()}.jpg`,
            type: 'image',
          });
        },
      },
      {
        text: 'PDF',
        onPress: async () => {
          const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
          if (result.canceled || !result.assets[0]) {
            resolve(null);
            return;
          }
          const asset = result.assets[0];
          resolve({
            uri: asset.uri,
            name: asset.name || 'document.pdf',
            type: 'pdf',
          });
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

export function ScanDocumentButton(props: ScanDocumentButtonProps) {
  const [scanning, setScanning] = useState(false);

  async function handleScan() {
    const file = await pickDocument();
    if (!file) return;

    setScanning(true);
    try {
      const fields =
        props.mode === 'transaction'
          ? await extractTransactionFromDocument(file.uri, file.type)
          : await extractAccountFromDocument(file.uri, file.type);

      const summary = summarizeExtractedFields(fields);
      Alert.alert('Extracted from document', summary, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply to form',
          onPress: () => {
            if (props.mode === 'transaction') {
              (props.onExtracted as (f: ExtractedTransactionFields, file: ScannedFile) => void)(
                fields as ExtractedTransactionFields,
                file
              );
            } else {
              (props.onExtracted as (f: ExtractedAccountFields, file: ScannedFile) => void)(
                fields as ExtractedAccountFields,
                file
              );
            }
          },
        },
      ]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Document scan failed.';
      Alert.alert('Scan failed', message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.btn, (scanning || props.disabled) && styles.btnDisabled]}
        onPress={handleScan}
        disabled={scanning || props.disabled}
      >
        {scanning ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Text style={styles.icon}>✨</Text>
            <Text style={styles.text}>AI Scan</Text>
          </>
        )}
      </TouchableOpacity>
      {scanning && <Text style={styles.hint}>Reading document...</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.balance,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  btnDisabled: { opacity: 0.7 },
  icon: { fontSize: 18 },
  text: { color: '#fff', fontSize: 14, fontWeight: '700' },
  hint: { marginTop: 6, fontSize: 12, color: AppColors.textSecondary, textAlign: 'center' },
});
