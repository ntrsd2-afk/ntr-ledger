import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../../context/AuthContext';
import { useTransactions } from '../../context/TransactionContext';
import { AppColors } from '../../constants/appColors';
import { openFile } from '../../lib/openFile';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { uploadFile } from '../../lib/storage';
import { shareTransactionReport } from '../../lib/shareReport';
import { Transaction, TransactionCategory, TransactionInput } from '../../types';

async function shareFile(url: string): Promise<void> {
  const isPdf = url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('/raw/');
  const ext = isPdf ? '.pdf' : '.jpg';
  const localUri = `${FileSystem.cacheDirectory}${Date.now()}${ext}`;
  await FileSystem.downloadAsync(url, localUri);
  await Sharing.shareAsync(localUri);
}

function getFileName(url: string): string {
  try {
    const decoded = decodeURIComponent(url);
    const segment = decoded.split('/o/')[1]?.split('?')[0] ?? '';
    const name = segment.split('/').pop() ?? '';
    return name.replace(/^\d+_/, '') || 'File';
  } catch {
    return 'File';
  }
}

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

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

type FormState = {
  date: string;
  name: string;
  category: TransactionCategory;
  district: string;
  taluk: string;
  village: string;
  survey_no: string;
  patta_no: string;
  sq_ft: string;
  plot_no: string;
  nagar_name: string;
  phone_no: string;
  transaction_details: string;
  cash_in: string;
  cash_out: string;
  sub_total: string;
  remarks: string;
};

export default function EditTransactionScreen() {
  const { id, financialOnly } = useLocalSearchParams<{ id: string; financialOnly?: string }>();
  const router = useRouter();
  const { getTransaction, editTransaction, removeTransaction, transactions } = useTransactions();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [tx, setTx] = useState<Transaction | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [expenseType, setExpenseType] = useState<'None' | 'Travel' | 'Food' | 'Stay' | 'Document' | 'Other'>('None');
  const isFinancialOnly = financialOnly === '1';
  const expenseTypes: Array<'None' | 'Travel' | 'Food' | 'Stay' | 'Document' | 'Other'> = ['None', 'Travel', 'Food', 'Stay', 'Document', 'Other'];
  const [entryMode, setEntryMode] = useState<'BY_CASH' | 'TO_CASH' | 'EXPENSE' | 'BROUGHT_PRICE'>('BY_CASH');
  const [singleAmount, setSingleAmount] = useState('');

  const isSelecting = selectedDocs.size > 0;

  function toggleSelect(url: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  }

  function clearSelection() {
    setSelectedDocs(new Set());
  }

  useEffect(() => {
    (async () => {
      const tx = await getTransaction(id);
      if (tx) {
        const remarksText = tx.remarks || '';
        const match = remarksText.match(/^(?:Expense|To Cash):\s*(Travel|Food|Stay|Document|Other)\s*(?:\|\s*)?(.*)$/i);
        const initialExpense = match
          ? ((match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()) as 'Travel' | 'Food' | 'Stay' | 'Document' | 'Other')
          : 'None';
        const cleanedRemarks = match ? (match[2] || '') : remarksText;
        setExpenseType(initialExpense);
        const remarksLooksBrought = /^Brought Price/i.test(remarksText.trim());
        const remarksLooksExpense = /^Expense/i.test(remarksText.trim());
        const mode = remarksLooksBrought ? 'BROUGHT_PRICE' : remarksLooksExpense ? 'EXPENSE' : ((tx.cash_out || 0) > 0 ? 'TO_CASH' : 'BY_CASH');
        setEntryMode(mode);
        setSingleAmount(String((mode === 'TO_CASH' || mode === 'EXPENSE') ? (tx.cash_out || '') : (tx.cash_in || '')));
        setTx(tx);
        setForm({
          date: tx.date,
          name: tx.name,
          category: tx.category,
          district: tx.district,
          taluk: tx.taluk,
          village: tx.village,
          survey_no: tx.survey_no,
          patta_no: tx.patta_no,
          sq_ft: String(tx.sq_ft || ''),
          plot_no: tx.plot_no,
          nagar_name: tx.nagar_name,
          phone_no: tx.phone_no || '',
          transaction_details: tx.transaction_details,
          cash_in: String(tx.cash_in || ''),
          cash_out: String(tx.cash_out || ''),
          sub_total: String(tx.sub_total || ''),
          remarks: cleanedRemarks,
        });
      }
      setIsLoading(false);
    })();
  }, [id, getTransaction]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const subTotalSkipInitial = useRef(true);
  useEffect(() => {
    if (subTotalSkipInitial.current) { subTotalSkipInitial.current = false; return; }
    if (!form || isFinancialOnly) return;
    const cashIn = parseFloat(form.cash_in) || 0;
    const cashOut = parseFloat(form.cash_out) || 0;
    const computed = cashIn - cashOut;
    setForm((f) => (f ? { ...f, sub_total: computed !== 0 ? String(computed) : '' } : f));
  }, [form?.cash_in, form?.cash_out, isFinancialOnly]);
  const nagarSuggestions = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.nagar_name.trim()).filter(Boolean))).sort().slice(0, 8),
    [transactions]
  );

  async function handleSave() {
    if (!form) return;
    if (!form.name.trim()) { Alert.alert('Validation', 'Name is required.'); return; }

    const parsedCashIn = isFinancialOnly
      ? ((entryMode === 'BY_CASH' || entryMode === 'BROUGHT_PRICE') ? parseFloat(singleAmount) || 0 : 0)
      : (parseFloat(form.cash_in) || 0);
    const parsedCashOut = isFinancialOnly
      ? ((entryMode === 'TO_CASH' || entryMode === 'EXPENSE') ? parseFloat(singleAmount) || 0 : 0)
      : (parseFloat(form.cash_out) || 0);

    const input: TransactionInput = {
      date: form.date,
      name: form.name,
      category: isFinancialOnly ? ((entryMode === 'TO_CASH' || entryMode === 'EXPENSE') ? 'Seller' : 'Buyer') : form.category,
      district: form.district,
      taluk: form.taluk,
      village: form.village,
      survey_no: form.survey_no,
      patta_no: form.patta_no,
      sq_ft: parseFloat(form.sq_ft) || 0,
      plot_no: form.plot_no,
      nagar_name: form.nagar_name,
      phone_no: form.phone_no,
      transaction_details: form.transaction_details,
      cash_in: parsedCashIn,
      cash_out: parsedCashOut,
      sub_total: parseFloat(form.sub_total) || 0,
      remarks: isFinancialOnly && entryMode === 'BROUGHT_PRICE'
        ? `Brought Price${form.remarks ? ` | ${form.remarks}` : ''}`
        : isFinancialOnly && entryMode === 'EXPENSE'
          ? (expenseType !== 'None'
            ? `Expense: ${expenseType}${form.remarks ? ` | ${form.remarks}` : ''}`
            : `Expense${form.remarks ? ` | ${form.remarks}` : ''}`)
          : expenseType === 'None'
            ? form.remarks
            : `To Cash: ${expenseType}${form.remarks ? ` | ${form.remarks}` : ''}`,
      attachments: tx?.attachments ?? [],
    };
    await editTransaction(id, input);
    setIsEditing(false);
    router.back();
  }

  async function pickAndUpload(type: 'photo' | 'pdf') {
    if (!user) return;
    let files: { uri: string; name: string }[] = [];

    if (type === 'photo') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Gallery permission is required.'); return; }
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

    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadFile(user.uid, id, f.uri, f.name)));
      const updated = [...(tx?.attachments ?? []), ...urls];
      const input: TransactionInput = {
        date: form!.date, name: form!.name, category: form!.category,
        district: form!.district, taluk: form!.taluk, village: form!.village,
        survey_no: form!.survey_no, patta_no: form!.patta_no,
        sq_ft: parseFloat(form!.sq_ft) || 0, plot_no: form!.plot_no,
        nagar_name: form!.nagar_name, phone_no: form!.phone_no, transaction_details: form!.transaction_details,
        cash_in: isFinancialOnly ? ((entryMode === 'BY_CASH' || entryMode === 'BROUGHT_PRICE') ? parseFloat(singleAmount) || 0 : 0) : (parseFloat(form!.cash_in) || 0),
        cash_out: isFinancialOnly ? ((entryMode === 'TO_CASH' || entryMode === 'EXPENSE') ? parseFloat(singleAmount) || 0 : 0) : (parseFloat(form!.cash_out) || 0),
        sub_total: parseFloat(form!.sub_total) || 0,
        remarks: isFinancialOnly && entryMode === 'BROUGHT_PRICE'
          ? `Brought Price${form!.remarks ? ` | ${form!.remarks}` : ''}`
          : isFinancialOnly && entryMode === 'EXPENSE'
            ? (expenseType !== 'None'
              ? `Expense: ${expenseType}${form!.remarks ? ` | ${form!.remarks}` : ''}`
              : `Expense${form!.remarks ? ` | ${form!.remarks}` : ''}`)
            : expenseType === 'None'
              ? form!.remarks
              : `To Cash: ${expenseType}${form!.remarks ? ` | ${form!.remarks}` : ''}`,
        attachments: updated,
      };
      await editTransaction(id, input);
      setTx((prev) => prev ? { ...prev, attachments: updated } : prev);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveAttachment(url: string) {
    Alert.alert('Remove', 'Remove this document?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const updated = (tx?.attachments ?? []).filter((u) => u !== url);
          const input: TransactionInput = {
            date: form!.date, name: form!.name, category: form!.category,
            district: form!.district, taluk: form!.taluk, village: form!.village,
            survey_no: form!.survey_no, patta_no: form!.patta_no,
            sq_ft: parseFloat(form!.sq_ft) || 0, plot_no: form!.plot_no,
            nagar_name: form!.nagar_name, phone_no: form!.phone_no, transaction_details: form!.transaction_details,
            cash_in: isFinancialOnly ? ((entryMode === 'BY_CASH' || entryMode === 'BROUGHT_PRICE') ? parseFloat(singleAmount) || 0 : 0) : (parseFloat(form!.cash_in) || 0),
            cash_out: isFinancialOnly ? ((entryMode === 'TO_CASH' || entryMode === 'EXPENSE') ? parseFloat(singleAmount) || 0 : 0) : (parseFloat(form!.cash_out) || 0),
            sub_total: parseFloat(form!.sub_total) || 0,
            remarks: isFinancialOnly && entryMode === 'BROUGHT_PRICE'
              ? `Brought Price${form!.remarks ? ` | ${form!.remarks}` : ''}`
              : isFinancialOnly && entryMode === 'EXPENSE'
                ? (expenseType !== 'None'
                  ? `Expense: ${expenseType}${form!.remarks ? ` | ${form!.remarks}` : ''}`
                  : `Expense${form!.remarks ? ` | ${form!.remarks}` : ''}`)
                : expenseType === 'None'
                  ? form!.remarks
                  : `To Cash: ${expenseType}${form!.remarks ? ` | ${form!.remarks}` : ''}`,
            attachments: updated,
          };
          await editTransaction(id, input);
          setTx((prev) => prev ? { ...prev, attachments: updated } : prev);
        },
      },
    ]);
  }

  async function handleDelete() {
    Alert.alert('Delete Entry', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await removeTransaction(id);
          router.back();
        },
      },
    ]);
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  if (!form) {
    return (
      <View style={styles.center}>
        <Text style={{ color: AppColors.textSecondary }}>Transaction not found.</Text>
      </View>
    );
  }

  // ── View Mode ──────────────────────────────────────────────────────────────
  if (!isEditing) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.navCancel}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Entry Details</Text>
          <TouchableOpacity onPress={handleDelete}>
            <Text style={styles.navDelete}>Delete</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Category & Date */}
          <View style={[styles.viewCard, { backgroundColor: CATEGORY_COLORS[form.category] + '15' }]}>
            <View style={styles.viewRow}>
              <View style={[styles.badge, { backgroundColor: CATEGORY_COLORS[form.category] }]}>
                <Text style={styles.badgeText}>{CATEGORY_LABELS[form.category]}</Text>
              </View>
              <Text style={styles.viewDate}>{formatDate(form.date)}</Text>
            </View>
            <Text style={styles.viewName}>{form.name}</Text>
            {form.transaction_details ? <Text style={styles.viewDetails}>{form.transaction_details}</Text> : null}
          </View>

          {/* Financials */}
          <View style={styles.finRow}>
            <View style={[styles.finCard, { backgroundColor: AppColors.incomeLight }]}>
              <Text style={[styles.finLabel, { color: AppColors.income }]}>Cash In</Text>
              <Text style={[styles.finValue, { color: AppColors.income }]}>
                +{formatCurrency(parseFloat(form.cash_in) || 0)}
              </Text>
            </View>
            <View style={[styles.finCard, { backgroundColor: AppColors.expenseLight }]}>
              <Text style={[styles.finLabel, { color: AppColors.expense }]}>Cash Out</Text>
              <Text style={[styles.finValue, { color: AppColors.expense }]}>
                -{formatCurrency(parseFloat(form.cash_out) || 0)}
              </Text>
            </View>
          </View>
          {form.sub_total ? (
            <View style={styles.subTotalRow}>
              <Text style={styles.subTotalLabel}>Sub Total:</Text>
              <Text style={styles.subTotalValue}>{formatCurrency(parseFloat(form.sub_total) || 0)}</Text>
            </View>
          ) : null}

          {/* Property Info */}
          {!isFinancialOnly && (
            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>Property Details</Text>
              {[
                ['Nagar / Project', form.nagar_name],
                ['Phone Number', form.phone_no],
                ['Plot No', form.plot_no],
                ['Village', form.village],
                ['Taluk', form.taluk],
                ['District', form.district],
                ['Survey No', form.survey_no],
                ['Patta No', form.patta_no],
                ['Sq Ft', form.sq_ft],
              ].map(([label, value]) =>
                value ? (
                  <View key={label} style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{label}</Text>
                    <Text style={styles.infoValue}>{value}</Text>
                  </View>
                ) : null
              )}
            </View>
          )}

          {form.remarks ? (
            <View style={styles.remarksCard}>
              <Text style={styles.remarksLabel}>Remarks</Text>
              <Text style={styles.remarksValue}>{form.remarks}</Text>
            </View>
          ) : null}

          <View style={styles.attachCard}>
            <View style={styles.attachHeader}>
              <Text style={styles.remarksLabel}>Documents</Text>
              <View style={styles.attachBtnRow}>
                <TouchableOpacity style={styles.attachBtn} onPress={() => pickAndUpload('photo')} disabled={uploading}>
                  <Text style={styles.attachBtnText}>📷 Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.attachBtn} onPress={() => pickAndUpload('pdf')} disabled={uploading}>
                  <Text style={styles.attachBtnText}>📄 PDF</Text>
                </TouchableOpacity>
                {uploading && <ActivityIndicator size="small" color={AppColors.primary} />}
              </View>
            </View>
            {(tx?.attachments?.length ?? 0) > 0 && (
              <View style={styles.attachList}>
                {tx!.attachments.map((url, i) => {
                  const isPdf = url.toLowerCase().includes('pdf');
                  const selected = selectedDocs.has(url);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.attachListItem, selected && styles.attachListItemSelected]}
                      onPress={() => isSelecting ? toggleSelect(url) : openFile(url)}
                      onLongPress={() => toggleSelect(url)}
                      activeOpacity={0.7}
                    >
                      {selected && <View style={styles.attachListCheck}><Text style={styles.attachListCheckText}>✓</Text></View>}
                      {!selected && (isPdf
                        ? <View style={styles.attachListIcon}><Text style={styles.attachListIconText}>PDF</Text></View>
                        : <Image source={{ uri: url }} style={styles.attachListThumb} />)}
                      <View style={styles.attachListInfo}>
                        <Text style={styles.attachListName} numberOfLines={1}>{getFileName(url)}</Text>
                        <Text style={styles.attachListType}>{isPdf ? 'PDF File' : 'Image'}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

        </ScrollView>

        {/* Floating Action Buttons */}
        {!isSelecting && (
          <View style={styles.fabRow}>
            <TouchableOpacity style={styles.editFab} onPress={() => setIsEditing(true)}>
              <Text style={styles.editFabText}>✏ Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareFab} onPress={async () => {
              if (!tx) return;
              try { await shareTransactionReport(tx); }
              catch (e: any) { Alert.alert('Share failed', e?.message); }
            }}>
              <Text style={styles.shareFabText}>↑ Share</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Selection Action Bar */}
        {isSelecting && (
          <View style={styles.selectionBar}>
            <TouchableOpacity style={styles.selectionCancel} onPress={clearSelection}>
              <Text style={styles.selectionCancelText}>✕ Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.selectionCount}>{selectedDocs.size} selected</Text>
            <TouchableOpacity style={styles.selectionShare} onPress={async () => {
              for (const url of selectedDocs) await shareFile(url);
              clearSelection();
            }}>
              <Text style={styles.selectionShareText}>↑ Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionDelete} onPress={() => {
              Alert.alert('Delete', `Delete ${selectedDocs.size} document(s)?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: async () => {
                  for (const url of selectedDocs) await handleRemoveAttachment(url);
                  clearSelection();
                }},
              ]);
            }}>
              <Text style={styles.selectionDeleteText}>🗑 Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ── Edit Mode ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => setIsEditing(false)}>
            <Text style={styles.navCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Edit Entry</Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <SectionHeader title="Basic Info" />
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Date</Text>
            <TextInput style={styles.input} value={form.date} onChangeText={set('date')} placeholderTextColor={AppColors.textSecondary} />
          </View>
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Name *</Text>
            <TextInput style={styles.input} value={form.name} onChangeText={set('name')} placeholderTextColor={AppColors.textSecondary} />
          </View>
          {!isFinancialOnly && (
            <>
          <SectionHeader title="Property" />
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Nagar Name</Text>
            <TextInput style={styles.input} value={form.nagar_name} onChangeText={set('nagar_name')} placeholderTextColor={AppColors.textSecondary} />
            {nagarSuggestions.length > 0 && (
              <View style={styles.suggestionRow}>
                {nagarSuggestions.map((n) => (
                  <TouchableOpacity key={n} style={styles.suggestionChip} onPress={() => set('nagar_name')(n)}>
                    <Text style={styles.suggestionText}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput style={styles.input} value={form.phone_no} onChangeText={set('phone_no')} keyboardType="numeric" placeholderTextColor={AppColors.textSecondary} />
          </View>
          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>District</Text>
              <TextInput style={styles.input} value={form.district} onChangeText={set('district')} placeholderTextColor={AppColors.textSecondary} />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>Taluk</Text>
              <TextInput style={styles.input} value={form.taluk} onChangeText={set('taluk')} placeholderTextColor={AppColors.textSecondary} />
            </View>
          </View>
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Village</Text>
            <TextInput style={styles.input} value={form.village} onChangeText={set('village')} placeholderTextColor={AppColors.textSecondary} />
          </View>
          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Survey No</Text>
              <TextInput style={styles.input} value={form.survey_no} onChangeText={set('survey_no')} placeholderTextColor={AppColors.textSecondary} />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>Patta No</Text>
              <TextInput style={styles.input} value={form.patta_no} onChangeText={set('patta_no')} placeholderTextColor={AppColors.textSecondary} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Sq Ft</Text>
              <TextInput style={styles.input} value={form.sq_ft} onChangeText={set('sq_ft')} keyboardType="decimal-pad" placeholderTextColor={AppColors.textSecondary} />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>Plot No</Text>
              <TextInput style={styles.input} value={form.plot_no} onChangeText={set('plot_no')} placeholderTextColor={AppColors.textSecondary} />
            </View>
          </View>
            </>
          )}

          <SectionHeader title="Financials" />
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Transaction Details</Text>
            <TextInput style={styles.input} value={form.transaction_details} onChangeText={set('transaction_details')} placeholderTextColor={AppColors.textSecondary} />
          </View>
          {isFinancialOnly && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Entry Type</Text>
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
          )}
          {isFinancialOnly && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>{entryMode === 'TO_CASH' ? 'To Cash Amount' : entryMode === 'EXPENSE' ? 'Expense Amount' : entryMode === 'BROUGHT_PRICE' ? 'Brought Price Amount' : 'By Cash Amount'}</Text>
              <TextInput
                style={styles.input}
                value={singleAmount}
                onChangeText={setSingleAmount}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={AppColors.textSecondary}
              />
            </View>
          )}
          {(!isFinancialOnly || (isFinancialOnly && entryMode === 'EXPENSE')) && (
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
          )}
          {!isFinancialOnly && (
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Cash In</Text>
                <TextInput style={[styles.input, styles.incomeInput]} value={form.cash_in} onChangeText={set('cash_in')} keyboardType="decimal-pad" placeholderTextColor={AppColors.textSecondary} />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Cash Out</Text>
                <TextInput style={[styles.input, styles.expenseInput]} value={form.cash_out} onChangeText={set('cash_out')} keyboardType="decimal-pad" placeholderTextColor={AppColors.textSecondary} />
              </View>
            </View>
          )}
          {!isFinancialOnly && (
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
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Remarks</Text>
            <TextInput style={styles.input} value={form.remarks} onChangeText={set('remarks')} placeholderTextColor={AppColors.textSecondary} />
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.bg },
  navbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: AppColors.goldBright, borderBottomWidth: 1, borderBottomColor: AppColors.gold,
  },
  navDelete: { fontSize: 14, fontWeight: '700', color: '#fff', backgroundColor: AppColors.expense, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, overflow: 'hidden' },
  navCancel: { fontSize: 15, color: '#1a1a2e', fontWeight: '600' },
  navTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a2e' },
  saveBtn: { backgroundColor: AppColors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  editBtn: { backgroundColor: AppColors.primaryLight, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  editBtnText: { color: AppColors.primary, fontWeight: '700', fontSize: 14 },
  fabRow: {
    position: 'absolute', bottom: 34, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 12,
  },
  editFab: {
    backgroundColor: AppColors.primary, borderRadius: 30,
    paddingHorizontal: 28, paddingVertical: 14,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
  },
  editFabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  shareFab: {
    backgroundColor: AppColors.income, borderRadius: 30,
    paddingHorizontal: 28, paddingVertical: 14,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
  },
  shareFabText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  scrollContent: { padding: 16 },

  // View mode
  viewCard: { borderRadius: 14, padding: 16, marginBottom: 12 },
  viewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  viewDate: { fontSize: 13, color: AppColors.textSecondary },
  viewName: { fontSize: 20, fontWeight: '700', color: AppColors.text },
  viewDetails: { fontSize: 13, color: AppColors.textSecondary, marginTop: 4 },

  finRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  finCard: { flex: 1, borderRadius: 12, padding: 14 },
  finLabel: { fontSize: 12, fontWeight: '500', marginBottom: 4 },
  finValue: { fontSize: 18, fontWeight: '700' },

  subTotalRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: AppColors.card, borderRadius: 10, padding: 12, marginBottom: 12 },
  subTotalLabel: { fontSize: 13, color: AppColors.textSecondary },
  subTotalValue: { fontSize: 14, fontWeight: '700', color: AppColors.balance },

  infoCard: { backgroundColor: AppColors.card, borderRadius: 12, padding: 14, marginBottom: 12 },
  infoCardTitle: { fontSize: 13, fontWeight: '700', color: AppColors.primary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  infoLabel: { fontSize: 13, color: AppColors.textSecondary },
  infoValue: { fontSize: 13, fontWeight: '600', color: AppColors.text },

  remarksCard: { backgroundColor: AppColors.card, borderRadius: 12, padding: 14, marginBottom: 16 },
  remarksLabel: { fontSize: 12, color: AppColors.textSecondary, marginBottom: 4, textTransform: 'uppercase', fontWeight: '600' },
  remarksValue: { fontSize: 14, color: AppColors.text, fontStyle: 'italic' },

  deleteBtn: { backgroundColor: AppColors.expenseLight, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 16 },
  deleteBtnText: { color: AppColors.expense, fontWeight: '700', fontSize: 15 },
  attachCard: { backgroundColor: AppColors.card, borderRadius: 12, padding: 14, marginBottom: 12 },
  attachHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  attachBtnRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  attachBtn: { width: 90, paddingVertical: 12, backgroundColor: AppColors.primaryLight, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: AppColors.primary, borderStyle: 'dashed' },
  attachBtnText: { fontSize: 13, fontWeight: '700', color: AppColors.primary },
  attachList: { gap: 8, marginTop: 4 },
  attachListItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: AppColors.bg, borderRadius: 10, padding: 10, gap: 12 },
  attachListThumb: { width: 48, height: 48, borderRadius: 8 },
  attachListIcon: { width: 48, height: 48, borderRadius: 8, backgroundColor: AppColors.expenseLight, alignItems: 'center', justifyContent: 'center' },
  attachListIconText: { fontSize: 11, fontWeight: '800', color: AppColors.expense },
  attachListInfo: { flex: 1 },
  attachListName: { fontSize: 14, fontWeight: '600', color: AppColors.text },
  attachListType: { fontSize: 12, color: AppColors.primary, marginTop: 2 },
  attachListItemSelected: { backgroundColor: AppColors.primaryLight, borderColor: AppColors.primary, borderWidth: 1.5 },
  attachListCheck: { width: 36, height: 36, borderRadius: 18, backgroundColor: AppColors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  attachListCheckText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  attachListShare: { padding: 6, marginRight: 2 },
  attachListShareText: { fontSize: 18, color: AppColors.primary, fontWeight: '700' },
  attachListRemove: { padding: 6 },
  attachListRemoveText: { fontSize: 16, color: AppColors.textSecondary, fontWeight: '700' },

  selectionBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: AppColors.card,
    borderTopWidth: 1, borderTopColor: AppColors.border, paddingHorizontal: 12, paddingVertical: 12, gap: 8,
  },
  selectionCancel: { paddingHorizontal: 10, paddingVertical: 8 },
  selectionCancelText: { fontSize: 13, color: AppColors.textSecondary, fontWeight: '600' },
  selectionCount: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: AppColors.text },
  selectionShare: { backgroundColor: AppColors.primaryLight, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  selectionShareText: { fontSize: 13, fontWeight: '700', color: AppColors.primary },
  selectionDelete: { backgroundColor: AppColors.expenseLight, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  selectionDeleteText: { fontSize: 13, fontWeight: '700', color: AppColors.expense },

  // Edit mode
  sectionHeader: { marginTop: 16, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: AppColors.primary, paddingLeft: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: AppColors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldContainer: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: AppColors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: { backgroundColor: AppColors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: AppColors.text, borderWidth: 1, borderColor: AppColors.border },
  incomeInput: { borderColor: AppColors.income + '66' },
  expenseInput: { borderColor: AppColors.expense + '66' },
  row: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  halfField: { flex: 1 },
  categoryRow: { flexDirection: 'row', gap: 10 },
  categoryChip: { flex: 1, borderRadius: 10, borderWidth: 2, paddingVertical: 10, alignItems: 'center' },
  categoryChipText: { fontSize: 14, fontWeight: '700', color: AppColors.text },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  suggestionChip: { borderRadius: 16, borderWidth: 1, borderColor: AppColors.primary, backgroundColor: AppColors.primaryLight, paddingHorizontal: 10, paddingVertical: 6 },
  suggestionText: { color: AppColors.primary, fontSize: 12, fontWeight: '700' },
  expenseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  expenseChip: { borderRadius: 16, borderWidth: 1, borderColor: AppColors.border, backgroundColor: AppColors.card, paddingHorizontal: 10, paddingVertical: 7 },
  expenseChipActive: { borderColor: AppColors.primary, backgroundColor: AppColors.primaryLight },
  expenseChipText: { color: AppColors.textSecondary, fontSize: 12, fontWeight: '700' },
  expenseChipTextActive: { color: AppColors.primary },
  autoLabel: { fontSize: 10, color: AppColors.textSecondary, textTransform: 'none', fontWeight: '400' },
  subTotalInput: { backgroundColor: AppColors.bg, color: AppColors.balance, fontWeight: '700' },
  entryModeGrid: { gap: 8 },
  entryModeRow: { flexDirection: 'row', gap: 10 },
  entryModeChip: { flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: AppColors.border, backgroundColor: AppColors.card, paddingVertical: 10, alignItems: 'center' },
  entryModeChipIncome: { borderColor: AppColors.income, backgroundColor: AppColors.incomeLight },
  entryModeChipExpense: { borderColor: AppColors.expense, backgroundColor: AppColors.expenseLight },
  entryModeChipBalance: { borderColor: AppColors.balance, backgroundColor: AppColors.balanceLight },
  entryModeText: { color: AppColors.textSecondary, fontWeight: '700', fontSize: 13 },
  entryModeTextActive: { color: AppColors.text },
});
