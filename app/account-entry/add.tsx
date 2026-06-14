import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { AppColors } from '../../constants/appColors';
import { ACCOUNTS_LEDGER } from '../../constants/appConstants';
import { useAuth } from '../../context/AuthContext';
import { useTransactions } from '../../context/TransactionContext';
import { todayISO } from '../../lib/formatters';
import { uploadFile } from '../../lib/storage';
import { TransactionInput } from '../../types';

type LocalFile = {
  uri: string;
  name: string;
  type: 'image' | 'pdf';
};

export default function AddAccountEntryScreen() {
  const router = useRouter();
  const { addTransaction, editTransaction, transactions } = useTransactions();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [nameMode, setNameMode] = useState<'new' | 'old'>('new');
  const [form, setForm] = useState({
    date: todayISO(),
    name: '',
    details: '',
    byCash: '',
    toCash: '',
    entryKind: 'cash' as 'cash' | 'land',
    remarks: '',
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const existingNames = useMemo(
    () => Array.from(new Set(
      transactions
        .filter((t) => t.nagar_name === ACCOUNTS_LEDGER)
        .map((t) => t.name.trim())
        .filter(Boolean)
    )).sort(),
    [transactions]
  );

  const detailSuggestions = useMemo(() => {
    const selectedName = form.name.trim().toLowerCase();
    if (!selectedName) return [];
    const details = transactions
      .filter((t) => t.name.trim().toLowerCase() === selectedName)
      .map((t) => t.transaction_details.trim())
      .filter(Boolean);
    return Array.from(new Set(details)).slice(0, 6);
  }, [transactions, form.name]);

  async function pickPhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required.');
      return;
    }
    Alert.alert('Add Photo', 'Choose source', [
      {
        text: 'Camera', onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const name = `photo_${Date.now()}.jpg`;
            setFiles((f) => [...f, { uri: asset.uri, name, type: 'image' }]);
          }
        },
      },
      {
        text: 'Gallery', onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const name = asset.fileName || `photo_${Date.now()}.jpg`;
            setFiles((f) => [...f, { uri: asset.uri, name, type: 'image' }]);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function pickPDF() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setFiles((f) => [...f, { uri: asset.uri, name: asset.name, type: 'pdf' }]);
    }
  }

  function removeFile(index: number) {
    setFiles((f) => f.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert('Validation', 'Name is required.');
      return;
    }
    if (!form.date.trim()) {
      Alert.alert('Validation', 'Date is required.');
      return;
    }

    setSaving(true);
    try {
      const input: TransactionInput = {
        date: form.date,
        name: form.name.trim(),
        category: form.entryKind === 'land' ? 'Govt' : 'Buyer',
        district: '',
        taluk: '',
        village: '',
        survey_no: '',
        patta_no: '',
        sq_ft: 0,
        plot_no: '',
        nagar_name: ACCOUNTS_LEDGER,
        phone_no: '',
        transaction_details: form.details.trim(),
        cash_in: parseFloat(form.byCash) || 0,
        cash_out: parseFloat(form.toCash) || 0,
        sub_total: 0,
        remarks: form.remarks.trim(),
        attachments: [],
      };
      const txId = await addTransaction(input);
      if (files.length > 0 && user && txId) {
        const urls = await Promise.all(files.map((f) => uploadFile(user.uid, txId, f.uri, f.name)));
        await editTransaction(txId, { ...input, attachments: urls });
      }
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save account entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.navCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Add Account Entry</Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>Date *</Text>
            <TextInput
              style={styles.input}
              value={form.date}
              onChangeText={set('date')}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={AppColors.textSecondary}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Name *</Text>
            <View style={styles.nameModeRow}>
              <TouchableOpacity
                style={[styles.nameModeChip, nameMode === 'new' && styles.nameModeChipActive]}
                onPress={() => { setNameMode('new'); set('name')(''); }}
              >
                <Text style={[styles.nameModeText, nameMode === 'new' && styles.nameModeTextActive]}>New</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nameModeChip, nameMode === 'old' && styles.nameModeChipActive]}
                onPress={() => setNameMode('old')}
              >
                <Text style={[styles.nameModeText, nameMode === 'old' && styles.nameModeTextActive]}>Old</Text>
              </TouchableOpacity>
            </View>
            {nameMode === 'new' ? (
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={set('name')}
                placeholder="Type new account name"
                placeholderTextColor={AppColors.textSecondary}
              />
            ) : (
              <View style={styles.oldNameList}>
                {existingNames.length === 0 ? (
                  <Text style={styles.oldNameEmpty}>No previous names yet. Use New to add one.</Text>
                ) : (
                  existingNames.map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.oldNameItem, form.name === n && styles.oldNameItemActive]}
                      onPress={() => set('name')(n)}
                    >
                      <Text style={[styles.oldNameText, form.name === n && styles.oldNameTextActive]}>{n}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Details</Text>
            <TextInput
              style={styles.input}
              value={form.details}
              onChangeText={set('details')}
              placeholder="Transaction details"
              placeholderTextColor={AppColors.textSecondary}
            />
            {detailSuggestions.length > 0 && (
              <View style={styles.suggestionRow}>
                {detailSuggestions.map((d) => (
                  <TouchableOpacity key={d} style={styles.suggestionChip} onPress={() => set('details')(d)}>
                    <Text style={styles.suggestionText} numberOfLines={1}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeChip, form.entryKind === 'cash' && styles.typeChipActive]}
                onPress={() => set('entryKind')('cash')}
              >
                <Text style={[styles.typeChipText, form.entryKind === 'cash' && styles.typeChipTextActive]}>By Cash / To Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeChip, form.entryKind === 'land' && styles.typeChipActive]}
                onPress={() => set('entryKind')('land')}
              >
                <Text style={[styles.typeChipText, form.entryKind === 'land' && styles.typeChipTextActive]}>By Land / To Land</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.field, styles.half]}>
              <Text style={styles.label}>{form.entryKind === 'land' ? 'By Land' : 'By Cash'}</Text>
              <TextInput
                style={[styles.input, styles.byInput]}
                value={form.byCash}
                onChangeText={set('byCash')}
                placeholder="0"
                placeholderTextColor={AppColors.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={[styles.field, styles.half]}>
              <Text style={styles.label}>{form.entryKind === 'land' ? 'To Land' : 'To Cash'}</Text>
              <TextInput
                style={[styles.input, styles.toInput]}
                value={form.toCash}
                onChangeText={set('toCash')}
                placeholder="0"
                placeholderTextColor={AppColors.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Remarks</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.remarks}
              onChangeText={set('remarks')}
              placeholder="Optional notes"
              placeholderTextColor={AppColors.textSecondary}
              multiline
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Documents</Text>
            <View style={styles.docBtnRow}>
              <TouchableOpacity style={styles.docBtn} onPress={pickPhoto}>
                <Text style={styles.docBtnIcon}>📷</Text>
                <Text style={styles.docBtnText}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.docBtn} onPress={pickPDF}>
                <Text style={styles.docBtnIcon}>📄</Text>
                <Text style={styles.docBtnText}>PDF</Text>
              </TouchableOpacity>
            </View>
            {files.length > 0 && (
              <View style={styles.fileList}>
                {files.map((f, i) => (
                  <View key={`${f.uri}-${i}`} style={styles.fileItem}>
                    {f.type === 'image'
                      ? <Image source={{ uri: f.uri }} style={styles.fileThumb} />
                      : <View style={styles.pdfThumb}><Text style={styles.pdfIcon}>PDF</Text></View>}
                    <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
                    <TouchableOpacity onPress={() => removeFile(i)} style={styles.removeBtn}>
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.bg },
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: AppColors.card,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  navCancel: { fontSize: 15, color: AppColors.textSecondary },
  navTitle: { fontSize: 17, fontWeight: '700', color: AppColors.text },
  saveBtn: {
    backgroundColor: AppColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  content: { padding: 16 },
  field: { marginBottom: 14 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: AppColors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: AppColors.text,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  row: { flexDirection: 'row', gap: 12 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.card,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  typeChipActive: {
    borderColor: AppColors.primary,
    backgroundColor: AppColors.primaryLight,
  },
  typeChipText: { fontSize: 12, fontWeight: '700', color: AppColors.textSecondary },
  typeChipTextActive: { color: AppColors.primary },
  half: { flex: 1 },
  byInput: { borderColor: AppColors.income + '66' },
  toInput: { borderColor: AppColors.expense + '66' },
  textArea: { minHeight: 84, textAlignVertical: 'top' },
  docBtnRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  docBtn: {
    width: 90,
    backgroundColor: AppColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.primary,
    borderStyle: 'dashed',
    paddingVertical: 12,
    alignItems: 'center',
  },
  docBtnIcon: { fontSize: 24, marginBottom: 4 },
  docBtnText: { fontSize: 13, fontWeight: '700', color: AppColors.primary },
  fileList: { gap: 8 },
  fileItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: AppColors.card, borderRadius: 10, padding: 8, gap: 10 },
  fileThumb: { width: 44, height: 44, borderRadius: 6 },
  pdfThumb: { width: 44, height: 44, borderRadius: 6, backgroundColor: AppColors.expenseLight, alignItems: 'center', justifyContent: 'center' },
  pdfIcon: { fontSize: 11, fontWeight: '800', color: AppColors.expense },
  fileName: { flex: 1, fontSize: 13, color: AppColors.text },
  removeBtn: { padding: 4 },
  removeBtnText: { fontSize: 14, color: AppColors.textSecondary },
  nameModeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  nameModeChip: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.card,
  },
  nameModeChipActive: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  nameModeText: { fontSize: 13, fontWeight: '700', color: AppColors.textSecondary },
  nameModeTextActive: { color: '#fff' },
  oldNameList: {
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 10,
    overflow: 'hidden',
    maxHeight: 220,
  },
  oldNameEmpty: { padding: 14, color: AppColors.textSecondary, fontSize: 13, textAlign: 'center' },
  oldNameItem: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
    backgroundColor: AppColors.card,
  },
  oldNameItemActive: { backgroundColor: AppColors.primaryLight },
  oldNameText: { fontSize: 15, fontWeight: '600', color: AppColors.text },
  oldNameTextActive: { color: AppColors.primary, fontWeight: '700' },
});
