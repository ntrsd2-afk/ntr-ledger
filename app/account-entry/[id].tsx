import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '../../context/AuthContext';
import { useTransactions } from '../../context/TransactionContext';
import { formatCurrency } from '../../lib/formatters';
import { openFile } from '../../lib/openFile';
import { uploadFile } from '../../lib/storage';
import { Transaction, TransactionInput } from '../../types';

type FormState = {
  date: string;
  name: string;
  details: string;
  byCash: string;
  toCash: string;
  entryKind: 'cash' | 'land';
  remarks: string;
};

export default function EditAccountEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getTransaction, editTransaction, removeTransaction, transactions } = useTransactions();
  const { user } = useAuth();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nameMode, setNameMode] = useState<'new' | 'old'>('old');
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const current = await getTransaction(id);
      setTx(current);
      if (current) {
        setForm({
          date: current.date,
          name: current.name,
          details: current.transaction_details,
          byCash: String(current.cash_in || ''),
          toCash: String(current.cash_out || ''),
          entryKind: current.category === 'Govt' ? 'land' : 'cash',
          remarks: current.remarks || '',
        });
      }
      setLoading(false);
    })();
  }, [id, getTransaction]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const existingNames = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.name.trim()).filter(Boolean))).sort(),
    [transactions]
  );

  const nameSuggestions = useMemo(() => {
    const q = form?.name.trim().toLowerCase() || '';
    if (!q) return existingNames.slice(0, 8);
    return existingNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  }, [existingNames, form?.name]);

  const detailSuggestions = useMemo(() => {
    const selectedName = form?.name.trim().toLowerCase() || '';
    if (!selectedName) return [];
    const details = transactions
      .filter((t) => t.name.trim().toLowerCase() === selectedName)
      .map((t) => t.transaction_details.trim())
      .filter(Boolean);
    return Array.from(new Set(details)).slice(0, 6);
  }, [transactions, form?.name]);

  async function handleSave() {
    if (!tx || !form) return;
    if (!form.name.trim()) {
      Alert.alert('Validation', 'Name is required.');
      return;
    }
    setSaving(true);
    try {
      const input: TransactionInput = {
        date: form.date,
        name: form.name.trim(),
        category: form.entryKind === 'land' ? 'Govt' : 'Buyer',
        district: tx.district,
        taluk: tx.taluk,
        village: tx.village,
        survey_no: tx.survey_no,
        patta_no: tx.patta_no,
        sq_ft: tx.sq_ft || 0,
        plot_no: tx.plot_no,
        nagar_name: tx.nagar_name,
        phone_no: tx.phone_no || '',
        transaction_details: form.details.trim(),
        cash_in: parseFloat(form.byCash) || 0,
        cash_out: parseFloat(form.toCash) || 0,
        sub_total: tx.sub_total || 0,
        remarks: form.remarks.trim(),
        attachments: tx.attachments || [],
      };
      await editTransaction(id, input);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to update entry.');
    } finally {
      setSaving(false);
    }
  }

  async function pickAndUpload(type: 'photo' | 'pdf') {
    if (!tx || !user) return;
    let files: { uri: string; name: string }[] = [];

    if (type === 'photo') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Gallery permission is required.');
        return;
      }
      await new Promise<void>((resolve) => {
        Alert.alert('Add Photo', 'Choose source', [
          {
            text: 'Camera', onPress: async () => {
              const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
              if (!r.canceled) files = r.assets.map((a) => ({ uri: a.uri, name: a.fileName || `photo_${Date.now()}.jpg` }));
              resolve();
            },
          },
          {
            text: 'Gallery', onPress: async () => {
              const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true });
              if (!r.canceled) files = r.assets.map((a) => ({ uri: a.uri, name: a.fileName || `photo_${Date.now()}.jpg` }));
              resolve();
            },
          },
          { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
        ]);
      });
    } else {
      const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: true });
      if (!r.canceled) files = r.assets.map((a) => ({ uri: a.uri, name: a.name }));
    }

    if (!files.length || !form) return;
    setSaving(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadFile(user.uid, id, f.uri, f.name)));
      const updatedAttachments = [...(tx.attachments ?? []), ...urls];
      const input: TransactionInput = {
        date: form.date,
        name: form.name.trim(),
        category: form.entryKind === 'land' ? 'Govt' : 'Buyer',
        district: tx.district,
        taluk: tx.taluk,
        village: tx.village,
        survey_no: tx.survey_no,
        patta_no: tx.patta_no,
        sq_ft: tx.sq_ft || 0,
        plot_no: tx.plot_no,
        nagar_name: tx.nagar_name,
        phone_no: tx.phone_no || '',
        transaction_details: form.details.trim(),
        cash_in: parseFloat(form.byCash) || 0,
        cash_out: parseFloat(form.toCash) || 0,
        sub_total: tx.sub_total || 0,
        remarks: form.remarks.trim(),
        attachments: updatedAttachments,
      };
      await editTransaction(id, input);
      setTx((prev) => (prev ? { ...prev, attachments: updatedAttachments } : prev));
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function removeAttachment(url: string) {
    if (!tx || !form) return;
    const updatedAttachments = (tx.attachments ?? []).filter((u) => u !== url);
    const input: TransactionInput = {
      date: form.date,
      name: form.name.trim(),
      category: form.entryKind === 'land' ? 'Govt' : 'Buyer',
      district: tx.district,
      taluk: tx.taluk,
      village: tx.village,
      survey_no: tx.survey_no,
      patta_no: tx.patta_no,
      sq_ft: tx.sq_ft || 0,
      plot_no: tx.plot_no,
      nagar_name: tx.nagar_name,
      phone_no: tx.phone_no || '',
      transaction_details: form.details.trim(),
      cash_in: parseFloat(form.byCash) || 0,
      cash_out: parseFloat(form.toCash) || 0,
      sub_total: tx.sub_total || 0,
      remarks: form.remarks.trim(),
      attachments: updatedAttachments,
    };
    await editTransaction(id, input);
    setTx((prev) => (prev ? { ...prev, attachments: updatedAttachments } : prev));
  }

  function handleDelete() {
    Alert.alert('Delete Entry', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeTransaction(id);
          router.back();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  if (!tx || !form) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Entry not found.</Text>
      </View>
    );
  }

  const balance = (parseFloat(form.byCash) || 0) - (parseFloat(form.toCash) || 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.navCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Edit Account Entry</Text>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>Date</Text>
            <TextInput style={styles.input} value={form.date} onChangeText={set('date')} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <View style={styles.nameModeRow}>
              <TouchableOpacity
                style={[styles.nameModeBtn, nameMode === 'new' && styles.nameModeBtnActive]}
                onPress={() => { setNameMode('new'); setNameDropdownOpen(false); }}
              >
                <Text style={[styles.nameModeBtnText, nameMode === 'new' && styles.nameModeBtnTextActive]}>New</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nameModeBtn, nameMode === 'old' && styles.nameModeBtnActive]}
                onPress={() => setNameMode('old')}
              >
                <Text style={[styles.nameModeBtnText, nameMode === 'old' && styles.nameModeBtnTextActive]}>Old</Text>
              </TouchableOpacity>
            </View>
            {nameMode === 'new' ? (
              <TextInput style={styles.input} value={form.name} onChangeText={set('name')} placeholder="Enter name" placeholderTextColor={AppColors.textSecondary} />
            ) : (
              <View>
                <TouchableOpacity
                  style={[styles.input, styles.dropdownBtn]}
                  onPress={() => setNameDropdownOpen((o) => !o)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.dropdownBtnText, !form.name && { color: AppColors.textSecondary }]}>
                    {form.name || 'Select a name…'}
                  </Text>
                  <Text style={styles.dropdownArrow}>{nameDropdownOpen ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {nameDropdownOpen && (
                  <View style={styles.dropdownList}>
                    {existingNames.length === 0 ? (
                      <Text style={styles.dropdownEmpty}>No saved names yet. Use "New" to add one.</Text>
                    ) : (
                      existingNames.map((n) => (
                        <TouchableOpacity
                          key={n}
                          style={styles.dropdownItem}
                          onPress={() => { set('name')(n); setNameDropdownOpen(false); }}
                        >
                          <Text style={styles.dropdownItemText}>{n}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Details</Text>
            <TextInput style={styles.input} value={form.details} onChangeText={set('details')} />
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
              <TextInput style={[styles.input, styles.byInput]} value={form.byCash} onChangeText={set('byCash')} keyboardType="decimal-pad" />
            </View>
            <View style={[styles.field, styles.half]}>
              <Text style={styles.label}>{form.entryKind === 'land' ? 'To Land' : 'To Cash'}</Text>
              <TextInput style={[styles.input, styles.toInput]} value={form.toCash} onChangeText={set('toCash')} keyboardType="decimal-pad" />
            </View>
          </View>

          <View style={styles.balanceBox}>
            <Text style={styles.balanceLabel}>Balance</Text>
            <Text style={[styles.balanceValue, { color: balance >= 0 ? AppColors.income : AppColors.expense }]}>
              {balance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(balance))}
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Remarks</Text>
            <TextInput style={[styles.input, styles.textArea]} value={form.remarks} onChangeText={set('remarks')} multiline />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Documents</Text>
            <View style={styles.docBtnRow}>
              <TouchableOpacity style={styles.docBtn} onPress={() => pickAndUpload('photo')}>
                <Text style={styles.docBtnIcon}>📷</Text>
                <Text style={styles.docBtnText}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.docBtn} onPress={() => pickAndUpload('pdf')}>
                <Text style={styles.docBtnIcon}>📄</Text>
                <Text style={styles.docBtnText}>PDF</Text>
              </TouchableOpacity>
            </View>

            {(tx.attachments?.length ?? 0) > 0 && (
              <View style={styles.attachList}>
                {tx.attachments.map((url, index) => {
                  const isPdf = url.toLowerCase().includes('pdf');
                  return (
                    <View key={`${url}-${index}`} style={styles.attachItem}>
                      <TouchableOpacity style={styles.attachPreview} onPress={() => openFile(url)}>
                        {isPdf ? (
                          <View style={styles.pdfThumb}><Text style={styles.pdfIcon}>PDF</Text></View>
                        ) : (
                          <Image source={{ uri: url }} style={styles.fileThumb} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.removeAttach}
                        onPress={() =>
                          Alert.alert('Remove', 'Remove this file?', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: () => void removeAttachment(url) },
                          ])
                        }
                      >
                        <Text style={styles.removeAttachText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        <TouchableOpacity style={styles.fab} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.fabText}>Save</Text>}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.bg },
  muted: { color: AppColors.textSecondary },
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
  deleteBtn: { backgroundColor: AppColors.expenseLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  deleteText: { color: AppColors.expense, fontWeight: '700', fontSize: 13 },
  content: { padding: 16, paddingBottom: 120 },
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
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: AppColors.textSecondary, marginBottom: 6, textTransform: 'uppercase' },
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
  byInput: { borderColor: AppColors.income + '66' },
  toInput: { borderColor: AppColors.expense + '66' },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
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
  attachList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  attachItem: { position: 'relative' },
  attachPreview: { borderRadius: 8, overflow: 'hidden' },
  fileThumb: { width: 70, height: 70, borderRadius: 8 },
  pdfThumb: { width: 70, height: 70, borderRadius: 8, backgroundColor: AppColors.expenseLight, alignItems: 'center', justifyContent: 'center' },
  pdfIcon: { fontSize: 12, fontWeight: '800', color: AppColors.expense },
  removeAttach: { position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  removeAttachText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  nameModeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  nameModeBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: AppColors.border, backgroundColor: AppColors.card, alignItems: 'center' },
  nameModeBtnActive: { borderColor: AppColors.primary, backgroundColor: AppColors.primaryLight },
  nameModeBtnText: { fontSize: 13, fontWeight: '700', color: AppColors.textSecondary },
  nameModeBtnTextActive: { color: AppColors.primary },
  dropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11 },
  dropdownBtnText: { fontSize: 15, color: AppColors.text, flex: 1 },
  dropdownArrow: { fontSize: 11, color: AppColors.textSecondary, marginLeft: 8 },
  dropdownList: { backgroundColor: AppColors.card, borderRadius: 12, borderWidth: 1, borderColor: AppColors.border, marginTop: 4, overflow: 'hidden' },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  dropdownItemText: { fontSize: 15, color: AppColors.text, fontWeight: '500' },
  dropdownEmpty: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 13, color: AppColors.textSecondary, fontStyle: 'italic' },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  suggestionChip: {
    backgroundColor: AppColors.primaryLight,
    borderColor: AppColors.primary,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  suggestionText: { color: AppColors.primary, fontSize: 15, fontWeight: '700' },
  balanceBox: {
    marginBottom: 14,
    backgroundColor: AppColors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: { color: AppColors.textSecondary, fontWeight: '600', fontSize: 12, textTransform: 'uppercase' },
  balanceValue: { fontWeight: '800', fontSize: 18 },
  fab: {
    position: 'absolute',
    bottom: 34,
    alignSelf: 'center',
    backgroundColor: AppColors.primary,
    borderRadius: 30,
    paddingHorizontal: 34,
    paddingVertical: 14,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
