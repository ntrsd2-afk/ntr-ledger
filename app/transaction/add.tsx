import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTransactions } from '../../context/TransactionContext';
import { useAuth } from '../../context/AuthContext';
import { AppColors } from '../../constants/appColors';
import { todayISO } from '../../lib/formatters';
import { uploadFile } from '../../lib/storage';
import { setPlotMetadata } from '../../lib/nagars';
import { buildLocationLabel } from '../../lib/maps';
import { TransactionCategory, TransactionInput } from '../../types';

const CATEGORIES: TransactionCategory[] = ['Buyer', 'Seller'];
const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  Buyer: 'By Cash',
  Seller: 'To Cash',
  Govt: 'Govt',
};

const CATEGORY_COLORS: Record<TransactionCategory, string> = {
  Buyer: AppColors.income,
  Seller: AppColors.expense,
  Govt: AppColors.govt,
};

type LocalFile = {
  uri: string;
  name: string;
  type: 'image' | 'pdf';
};

function FormField({
  label, value, onChangeText, placeholder, keyboardType, required,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: 'default' | 'numeric' | 'decimal-pad'; required?: boolean;
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.label}>
        {label}{required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={styles.input} value={value} onChangeText={onChangeText}
        placeholder={placeholder || label} placeholderTextColor={AppColors.textSecondary}
        keyboardType={keyboardType || 'default'}
      />
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export default function AddTransactionScreen() {
  const { nagar, plot, financialOnly, propertyOnly } = useLocalSearchParams<{
    nagar?: string; plot?: string; financialOnly?: string; propertyOnly?: string;
  }>();
  const router = useRouter();
  const { addTransaction, editTransaction, transactions } = useTransactions();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [expenseType, setExpenseType] = useState<'None' | 'Travel' | 'Food' | 'Stay' | 'Document' | 'Other'>('None');
  const [mapsUrl, setMapsUrl] = useState('');
  const [mapsCoords, setMapsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const isFinancialOnly = financialOnly === '1';
  const isPropertyOnly = propertyOnly === '1';
  const expenseTypes: Array<'None' | 'Travel' | 'Food' | 'Stay' | 'Document' | 'Other'> = ['None', 'Travel', 'Food', 'Stay', 'Document', 'Other'];
  const [entryMode, setEntryMode] = useState<'BY_CASH' | 'TO_CASH' | 'EXPENSE' | 'BROUGHT_PRICE'>('BY_CASH');
  const [singleAmount, setSingleAmount] = useState('');

  const [form, setForm] = useState<Omit<TransactionInput, 'cash_in' | 'cash_out' | 'sub_total' | 'sq_ft' | 'attachments'> & {
    cash_in: string; cash_out: string; sub_total: string; sq_ft: string;
  }>({
    date: todayISO(), name: '', category: 'Buyer',
    district: '', taluk: '', village: '', survey_no: '', patta_no: '',
    sq_ft: '', plot_no: plot ?? '', nagar_name: nagar ?? '', phone_no: '', transaction_details: '',
    cash_in: '', cash_out: '', sub_total: '', remarks: '',
  });

  const set = (key: string) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const nagarSuggestions = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.nagar_name.trim()).filter(Boolean))).sort().slice(0, 8),
    [transactions]
  );

  function parseGoogleMapsUrl(url: string): { latitude: number; longitude: number } | null {
    try {
      const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (atMatch) return { latitude: parseFloat(atMatch[1]), longitude: parseFloat(atMatch[2]) };
      const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (qMatch) return { latitude: parseFloat(qMatch[1]), longitude: parseFloat(qMatch[2]) };
    } catch {}
    return null;
  }

  function handleMapsUrl(url: string) {
    setMapsUrl(url);
    setMapsCoords(parseGoogleMapsUrl(url));
  }

  useEffect(() => {
    if (isPropertyOnly || isFinancialOnly) return;
    const cashIn = parseFloat(form.cash_in) || 0;
    const cashOut = parseFloat(form.cash_out) || 0;
    const computed = cashIn - cashOut;
    setForm((f) => ({ ...f, sub_total: computed !== 0 ? String(computed) : '' }));
  }, [form.cash_in, form.cash_out, isPropertyOnly, isFinancialOnly]);

  useEffect(() => {
    if (entryMode !== 'EXPENSE') setExpenseType('None');
  }, [entryMode]);


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
    if (!form.date.trim()) { Alert.alert('Validation', 'Date is required.'); return; }

    const parsedCashIn = isFinancialOnly
      ? ((entryMode === 'BY_CASH' || entryMode === 'BROUGHT_PRICE') ? parseFloat(singleAmount) || 0 : 0)
      : (parseFloat(form.cash_in) || 0);
    const parsedCashOut = isFinancialOnly
      ? ((entryMode === 'TO_CASH' || entryMode === 'EXPENSE') ? parseFloat(singleAmount) || 0 : 0)
      : (parseFloat(form.cash_out) || 0);

    setSaving(true);
    try {
      const input: TransactionInput = {
        date: form.date,
        name: form.name,
        category: isFinancialOnly ? ((entryMode === 'TO_CASH' || entryMode === 'EXPENSE') ? 'Seller' : 'Buyer') : (form.category as any),
        district: form.district, taluk: form.taluk, village: form.village,
        survey_no: form.survey_no, patta_no: form.patta_no,
        sq_ft: parseFloat(form.sq_ft) || 0, plot_no: form.plot_no,
        nagar_name: form.nagar_name, phone_no: form.phone_no, transaction_details: form.transaction_details,
        cash_in: isPropertyOnly ? 0 : parsedCashIn,
        cash_out: isPropertyOnly ? 0 : parsedCashOut,
        sub_total: isPropertyOnly ? 0 : (parseFloat(form.sub_total) || 0),
        remarks: isFinancialOnly && entryMode === 'BROUGHT_PRICE'
          ? `Brought Price${form.remarks ? ` | ${form.remarks}` : ''}`
          : isFinancialOnly && entryMode === 'EXPENSE'
            ? (expenseType !== 'None'
              ? `Expense: ${expenseType}${form.remarks ? ` | ${form.remarks}` : ''}`
              : `Expense${form.remarks ? ` | ${form.remarks}` : ''}`)
            : expenseType === 'None'
              ? form.remarks
              : `To Cash: ${expenseType}${form.remarks ? ` | ${form.remarks}` : ''}`,
        attachments: [],
      };

      const txId = await addTransaction(input);

      if (files.length > 0 && user && txId) {
        const urls = await Promise.all(
          files.map((f) => uploadFile(user.uid, txId, f.uri, f.name))
        );
        await editTransaction(txId, { ...input, attachments: urls });
      }

      if (user && (isPropertyOnly || input.nagar_name) && input.plot_no) {
        await setPlotMetadata(user.uid, input.nagar_name, input.plot_no, {
          name: input.name,
          location: buildLocationLabel({
            nagar_name: input.nagar_name,
            village: input.village,
            taluk: input.taluk,
            district: input.district,
            plot_no: input.plot_no,
          }),
          district: input.district,
          taluk: input.taluk,
          village: input.village,
          survey_no: input.survey_no,
          patta_no: input.patta_no,
          ...(input.sq_ft ? { sq_ft: input.sq_ft } : {}),
          phone_no: input.phone_no,
          ...(mapsCoords ? { latitude: mapsCoords.latitude, longitude: mapsCoords.longitude } : {}),
        });
      }

      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save.');
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
          <Text style={styles.navTitle}>New Entry</Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <SectionHeader title="Basic Info" />
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Date</Text>
            <TextInput style={styles.input} value={form.date} onChangeText={set('date')} placeholderTextColor={AppColors.textSecondary} />
          </View>
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={set('name')}
              placeholder="Enter name"
              placeholderTextColor={AppColors.textSecondary}
            />
          </View>

          {!isPropertyOnly && !isFinancialOnly && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.categoryRow}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryChip, { borderColor: CATEGORY_COLORS[cat] }, form.category === cat && { backgroundColor: CATEGORY_COLORS[cat] }]}
                    onPress={() => setForm((f) => ({ ...f, category: cat }))}
                  >
                    <Text style={[styles.categoryChipText, form.category === cat && { color: '#fff' }]}>
                      {CATEGORY_LABELS[cat]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {!isFinancialOnly && (
            <>
              <SectionHeader title="Property" />
              <FormField label="Phone Number" value={form.phone_no} onChangeText={set('phone_no')} placeholder="e.g. 9876543210" keyboardType="numeric" />
              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.label}>District</Text>
                  <TextInput style={styles.input} value={form.district} onChangeText={set('district')} placeholder="District" placeholderTextColor={AppColors.textSecondary} />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.label}>Taluk</Text>
                  <TextInput style={styles.input} value={form.taluk} onChangeText={set('taluk')} placeholder="Taluk" placeholderTextColor={AppColors.textSecondary} />
                </View>
              </View>
              <FormField label="Village" value={form.village} onChangeText={set('village')} />
              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.label}>Survey No</Text>
                  <TextInput style={styles.input} value={form.survey_no} onChangeText={set('survey_no')} placeholder="e.g. 101/" placeholderTextColor={AppColors.textSecondary} />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.label}>Patta No</Text>
                  <TextInput style={styles.input} value={form.patta_no} onChangeText={set('patta_no')} placeholder="e.g. P-2201" placeholderTextColor={AppColors.textSecondary} />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.label}>Sq Ft</Text>
                  <TextInput style={styles.input} value={form.sq_ft} onChangeText={set('sq_ft')} placeholder="0" placeholderTextColor={AppColors.textSecondary} keyboardType="decimal-pad" />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.label}>Plot No</Text>
                  <TextInput style={styles.input} value={form.plot_no} onChangeText={set('plot_no')} placeholder="e.g. Plot-01" placeholderTextColor={AppColors.textSecondary} />
                </View>
              </View>
              <FormField label="Nagar Name" value={form.nagar_name} onChangeText={set('nagar_name')} placeholder="e.g. VENKATESHWARA NAGAR" />
              {nagarSuggestions.length > 0 && (
                <View style={styles.suggestionRow}>
                  {nagarSuggestions.map((n) => (
                    <TouchableOpacity key={n} style={styles.suggestionChip} onPress={() => set('nagar_name')(n)}>
                      <Text style={styles.suggestionText}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Google Maps Link</Text>
                <TextInput
                  style={styles.input}
                  value={mapsUrl}
                  onChangeText={handleMapsUrl}
                  placeholder="Paste Google Maps link here..."
                  placeholderTextColor={AppColors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {mapsCoords && (
                  <Text style={styles.coordsHint}>📍 {mapsCoords.latitude.toFixed(5)}, {mapsCoords.longitude.toFixed(5)} — location will be saved</Text>
                )}
              </View>
            </>
          )}

          {!isPropertyOnly && <SectionHeader title="Financials" />}
          {!isPropertyOnly && <FormField label="Transaction Details" value={form.transaction_details} onChangeText={set('transaction_details')} placeholder="Description of this transaction" />}
          {isFinancialOnly && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Entry Type</Text>
              <View style={styles.entryModeGrid}>
                <View style={styles.entryModeRow}>
                  <TouchableOpacity
                    style={[styles.entryModeChip, entryMode === 'BY_CASH' && styles.entryModeChipIncome]}
                    onPress={() => setEntryMode('BY_CASH')}
                  >
                    <Text style={[styles.entryModeText, entryMode === 'BY_CASH' && styles.entryModeTextActive]}>By Cash</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.entryModeChip, entryMode === 'TO_CASH' && styles.entryModeChipBalance]}
                    onPress={() => setEntryMode('TO_CASH')}
                  >
                    <Text style={[styles.entryModeText, entryMode === 'TO_CASH' && styles.entryModeTextActive]}>To Cash</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.entryModeRow}>
                  <TouchableOpacity
                    style={[styles.entryModeChip, entryMode === 'EXPENSE' && styles.entryModeChipExpense]}
                    onPress={() => setEntryMode('EXPENSE')}
                  >
                    <Text style={[styles.entryModeText, entryMode === 'EXPENSE' && styles.entryModeTextActive]}>Expense</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.entryModeChip, entryMode === 'BROUGHT_PRICE' && styles.entryModeChipIncome]}
                    onPress={() => setEntryMode('BROUGHT_PRICE')}
                  >
                    <Text style={[styles.entryModeText, entryMode === 'BROUGHT_PRICE' && styles.entryModeTextActive]}>Brought Price</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          {isFinancialOnly && (
            <FormField
              label={entryMode === 'TO_CASH' ? 'To Cash Amount' : entryMode === 'EXPENSE' ? 'Expense Amount' : entryMode === 'BROUGHT_PRICE' ? 'Brought Price Amount' : 'By Cash Amount'}
              value={singleAmount}
              onChangeText={setSingleAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              required
            />
          )}
          {(!isPropertyOnly && !isFinancialOnly) || (isFinancialOnly && entryMode === 'EXPENSE') ? (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Expense Type</Text>
              <View style={styles.expenseRow}>
                {expenseTypes.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.expenseChip, expenseType === type && styles.expenseChipActive]}
                    onPress={() => setExpenseType(type)}
                  >
                    <Text style={[styles.expenseChipText, expenseType === type && styles.expenseChipTextActive]}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
          {!isFinancialOnly && !isPropertyOnly && (
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Cash In</Text>
                <TextInput style={[styles.input, styles.incomeInput]} value={form.cash_in} onChangeText={set('cash_in')} placeholder="0" placeholderTextColor={AppColors.textSecondary} keyboardType="decimal-pad" />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Cash Out</Text>
                <TextInput style={[styles.input, styles.expenseInput]} value={form.cash_out} onChangeText={set('cash_out')} placeholder="0" placeholderTextColor={AppColors.textSecondary} keyboardType="decimal-pad" />
              </View>
            </View>
          )}
          {!isFinancialOnly && !isPropertyOnly && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Sub Total <Text style={styles.autoLabel}>(auto)</Text></Text>
              <TextInput
                style={[styles.input, styles.subTotalInput]}
                value={form.sub_total}
                editable={false}
                placeholder="Auto-calculated"
                placeholderTextColor={AppColors.textSecondary}
              />
            </View>
          )}
          {!isPropertyOnly && <FormField label="Remarks" value={form.remarks} onChangeText={set('remarks')} placeholder="Optional notes..." />}

          <SectionHeader title="Documents" />
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
                <View key={i} style={styles.fileItem}>
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

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.bg },
  navbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: AppColors.goldBright, borderBottomWidth: 1, borderBottomColor: AppColors.gold,
  },
  navCancel: { fontSize: 15, color: '#1a1a2e', fontWeight: '600' },
  navTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a2e' },
  saveBtn: { backgroundColor: AppColors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, minWidth: 60, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  scrollContent: { padding: 16 },
  sectionHeader: { marginTop: 20, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: AppColors.primary, paddingLeft: 12, paddingVertical: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: AppColors.primary, textTransform: 'uppercase', letterSpacing: 0.7 },
  fieldContainer: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: AppColors.textSecondary, marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.4 },
  required: { color: AppColors.expense },
  input: { backgroundColor: AppColors.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: AppColors.text, borderWidth: 1, borderColor: AppColors.border },
  incomeInput: { borderColor: AppColors.income + '66' },
  expenseInput: { borderColor: AppColors.expense + '66' },
  row: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  halfField: { flex: 1 },
  categoryRow: { flexDirection: 'row', gap: 10 },
  categoryChip: { flex: 1, borderRadius: 10, borderWidth: 2, paddingVertical: 10, alignItems: 'center' },
  categoryChipText: { fontSize: 14, fontWeight: '700', color: AppColors.text },

  docBtnRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  docBtn: { width: 90, backgroundColor: AppColors.card, borderRadius: 12, borderWidth: 1, borderColor: AppColors.primary, borderStyle: 'dashed', paddingVertical: 12, alignItems: 'center' },
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
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  suggestionChip: { borderRadius: 16, borderWidth: 1, borderColor: AppColors.primary, backgroundColor: AppColors.primaryLight, paddingHorizontal: 10, paddingVertical: 6 },
  suggestionText: { color: AppColors.primary, fontSize: 12, fontWeight: '700' },
  expenseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  expenseChip: { borderRadius: 16, borderWidth: 1, borderColor: AppColors.border, backgroundColor: AppColors.card, paddingHorizontal: 10, paddingVertical: 7 },
  expenseChipActive: { borderColor: AppColors.primary, backgroundColor: AppColors.primaryLight },
  expenseChipText: { color: AppColors.textSecondary, fontSize: 12, fontWeight: '700' },
  expenseChipTextActive: { color: AppColors.primary },
  autoLabel: { fontSize: 10, color: AppColors.textSecondary, textTransform: 'none', fontWeight: '400' },
  coordsHint: { fontSize: 12, color: AppColors.primary, fontWeight: '600', marginTop: 6 },
  subTotalInput: { backgroundColor: AppColors.bg, color: AppColors.balance, fontWeight: '700' },
  entryModeGrid: { gap: 8 },
  entryModeRow: { flexDirection: 'row', gap: 10 },
  entryModeChip: { flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: AppColors.border, backgroundColor: AppColors.card, paddingVertical: 13, alignItems: 'center' },
  entryModeChipIncome: { borderColor: AppColors.income, backgroundColor: AppColors.incomeLight },
  entryModeChipExpense: { borderColor: AppColors.expense, backgroundColor: AppColors.expenseLight },
  entryModeChipBalance: { borderColor: AppColors.balance, backgroundColor: AppColors.balanceLight },
  entryModeText: { color: AppColors.textSecondary, fontWeight: '700', fontSize: 13 },
  entryModeTextActive: { color: AppColors.text },
});
