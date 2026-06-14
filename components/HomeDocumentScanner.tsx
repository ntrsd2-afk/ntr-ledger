import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { AppColors } from '../constants/appColors';
import { useAuth } from '../context/AuthContext';
import { useTransactions } from '../context/TransactionContext';
import { createPropertyFromScan, type ScannedFile } from '../lib/createPropertyFromScan';
import {
  extractTransactionFromDocument,
  isLandDocument,
  summarizeExtractedFields,
} from '../lib/documentExtract';

async function pickFromCamera(): Promise<ScannedFile | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission needed', 'Camera permission is required to scan documents.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
  if (result.canceled || !result.assets[0]) return null;
  return {
    uri: result.assets[0].uri,
    name: `scan_${Date.now()}.jpg`,
    type: 'image',
  };
}


async function pickFromFolderDirect(): Promise<ScannedFile | null> {
  return new Promise((resolve) => {
    Alert.alert('Choose file', 'Pick a photo or PDF from your device', [
      {
        text: 'Photo',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });
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

export function HomeDocumentScanner() {
  const router = useRouter();
  const { user } = useAuth();
  const { addTransaction, editTransaction } = useTransactions();
  const [scanning, setScanning] = useState(false);
  const [statusText, setStatusText] = useState('Reading document...');

  async function processDocument(file: ScannedFile) {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to scan and save documents.');
      return;
    }

    setScanning(true);
    setStatusText('Analyzing document with AI...');
    try {
      const fields = await extractTransactionFromDocument(file.uri, file.type);
      const summary = summarizeExtractedFields(fields);
      const landDoc = isLandDocument(fields);

      setScanning(false);

      if (landDoc) {
        Alert.alert('Land document detected', `${summary}\n\nCreate a property with these details?`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Review in form',
            onPress: () =>
              router.push({
                pathname: '/transaction/add',
                params: { propertyOnly: '1', prefill: JSON.stringify(fields) },
              }),
          },
          {
            text: 'Create property',
            onPress: async () => {
              setScanning(true);
              setStatusText('Creating property...');
              try {
                const created = await createPropertyFromScan(
                  user.uid,
                  fields,
                  file,
                  addTransaction,
                  editTransaction
                );
                router.push({
                  pathname: '/property-plot',
                  params: { nagar: created.nagar, plot: created.plot },
                });
              } catch (e: unknown) {
                Alert.alert('Failed', e instanceof Error ? e.message : 'Could not create property.');
              } finally {
                setScanning(false);
              }
            },
          },
        ]);
        return;
      }

      Alert.alert('Document scanned', summary, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open form',
          onPress: () =>
            router.push({
              pathname: '/transaction/add',
              params: { prefill: JSON.stringify(fields) },
            }),
        },
      ]);
    } catch (e: unknown) {
      Alert.alert('Scan failed', e instanceof Error ? e.message : 'Document scan failed.');
    } finally {
      setScanning(false);
    }
  }

  async function handleCamera() {
    const file = await pickFromCamera();
    if (file) await processDocument(file);
  }

  async function handleFolder() {
    const file = await pickFromFolderDirect();
    if (file) await processDocument(file);
  }

  return (
    <>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Scan Document</Text>
          <Text style={styles.cardSub}>AI reads land papers and creates properties</Text>
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCamera} activeOpacity={0.85}>
            <View style={[styles.iconCircle, { backgroundColor: AppColors.primaryLight }]}>
              <Text style={styles.actionIcon}>📷</Text>
            </View>
            <Text style={styles.actionLabel}>Camera</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionBtn} onPress={handleFolder} activeOpacity={0.85}>
            <View style={[styles.iconCircle, { backgroundColor: AppColors.balanceLight }]}>
              <Text style={styles.actionIcon}>📁</Text>
            </View>
            <Text style={styles.actionLabel}>Folder</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={scanning} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ActivityIndicator size="large" color={AppColors.primary} />
            <Text style={styles.modalTitle}>Scanning...</Text>
            <Text style={styles.modalSub}>{statusText}</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: AppColors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: AppColors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  cardHeader: { marginBottom: 14 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: AppColors.text },
  cardSub: { fontSize: 12, color: AppColors.textSecondary, marginTop: 4 },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionIcon: { fontSize: 26 },
  actionLabel: { fontSize: 14, fontWeight: '700', color: AppColors.text },
  divider: { width: 1, height: 64, backgroundColor: AppColors.border },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: AppColors.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
  },
  modalTitle: { marginTop: 14, fontSize: 17, fontWeight: '800', color: AppColors.text },
  modalSub: { marginTop: 6, fontSize: 13, color: AppColors.textSecondary, textAlign: 'center' },
});
