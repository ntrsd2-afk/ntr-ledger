import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Share from 'react-native-share';
import ImageManipulator, { SaveFormat } from 'expo-image-manipulator';
import { AppColors } from '../constants/appColors';
import { useAuth } from '../context/AuthContext';
import { useTransactions } from '../context/TransactionContext';
import { formatCurrency, formatDate } from '../lib/formatters';
import {
  addPlotAttachment,
  getPlotAttachments,
  getPlotMetadata,
  PlotAttachment,
  PlotMetadata,
  removePlotAttachment,
  renamePlotAttachment,
} from '../lib/nagars';
import { deleteFile, uploadPlotFile } from '../lib/storage';
import { openFile } from '../lib/openFile';
import { buildLocationLabel, openInMaps } from '../lib/maps';
import * as WebBrowser from 'expo-web-browser';
import { sharePlotReport } from '../lib/shareReport';

// Set these in your .env file:
// EXPO_PUBLIC_SERVER_URL=https://your-app.onrender.com
// EXPO_PUBLIC_CONVERT_API_KEY=your_secret_key
const PDF_SERVER = process.env.EXPO_PUBLIC_SERVER_URL ?? '';
const PDF_API_KEY = process.env.EXPO_PUBLIC_CONVERT_API_KEY ?? '';

async function shareAttachmentFile(url: string, displayName: string): Promise<void> {
  const lower = url.toLowerCase();
  const isPdf = lower.includes('.pdf') || lower.includes('application/pdf');
  const extFromName = displayName.includes('.') ? displayName.slice(displayName.lastIndexOf('.')) : '';
  const ext = isPdf ? '.pdf' : extFromName || '.jpg';
  const base = displayName.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim() || `file${ext}`;
  const localUri = `${FileSystem.cacheDirectory}share_${Date.now()}_${base.includes('.') ? base : base + ext}`;
  await FileSystem.downloadAsync(url, localUri);
  const mimeType = isPdf ? 'application/pdf' : 'image/jpeg';
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(localUri, {
      mimeType,
      dialogTitle: displayName,
    });
  }
}


export default function PropertyPlotScreen() {
  const { nagar, plot } = useLocalSearchParams<{ nagar?: string; plot?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { transactions } = useTransactions();
  const [attachments, setAttachments] = useState<PlotAttachment[]>([]);
  const [plotMeta, setPlotMeta] = useState<PlotMetadata | null>(null);
  const [uploading, setUploading] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameUrl, setRenameUrl] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [isSharingReport, setIsSharingReport] = useState(false);

  async function handleShareReport() {
    setIsSharingReport(true);
    try {
      await sharePlotReport(nagar ?? '', plot ?? 'Unassigned', entries);
    } catch (e: any) {
      Alert.alert('Share failed', e?.message ?? 'Try again.');
    } finally {
      setIsSharingReport(false);
    }
  }

  const reloadAttachments = useCallback(async () => {
    if (!user || !nagar) return;
    const plotKey = plot ?? 'Unassigned';
    const [list, meta] = await Promise.all([
      getPlotAttachments(user.uid, nagar, plotKey),
      getPlotMetadata(user.uid, nagar, plotKey),
    ]);
    setAttachments(list);
    setPlotMeta(meta);
  }, [user, nagar, plot]);

  useEffect(() => {
    reloadAttachments();
  }, [reloadAttachments]);

  const entries = useMemo(
    () =>
      transactions
        .filter((t) => t.nagar_name === (nagar ?? '') && (t.plot_no || 'Unassigned') === (plot ?? 'Unassigned'))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactions, nagar, plot]
  );

  const summary = useMemo(
    () => {
      let byCash = 0, toCash = 0, expense = 0, broughtPrice = 0;
      for (const t of entries) {
        const r = (t.remarks || '').toLowerCase();
        if (r.startsWith('brought price') || r.startsWith('sell price')) {
          broughtPrice += t.cash_in || 0;
        } else {
          byCash += t.cash_in || 0;
        }
        if (r.startsWith('to cash:') || r.startsWith('expense')) {
          expense += t.cash_out || 0;
        } else {
          toCash += t.cash_out || 0;
        }
      }
      return { byCash, toCash, expense, broughtPrice };
    },
    [entries]
  );
  const latestEntry = entries[0];
  const locationLabel = buildLocationLabel({
    location: plotMeta?.location,
    nagar_name: nagar,
    village: plotMeta?.village || latestEntry?.village,
    taluk: plotMeta?.taluk || latestEntry?.taluk,
    district: plotMeta?.district || latestEntry?.district,
    plot_no: plot,
  });

  const detailItems = [
    { label: 'District', value: plotMeta?.district || latestEntry?.district },
    { label: 'Taluk', value: plotMeta?.taluk || latestEntry?.taluk },
    { label: 'Village', value: plotMeta?.village || latestEntry?.village },
    { label: 'Survey No', value: plotMeta?.survey_no || latestEntry?.survey_no },
    { label: 'Patta No', value: plotMeta?.patta_no || latestEntry?.patta_no },
    { label: 'Sq Ft', value: plotMeta?.sq_ft ?? latestEntry?.sq_ft },
    { label: 'Phone', value: plotMeta?.phone_no || latestEntry?.phone_no },
    { label: 'GPS Coords', value: plotMeta?.latitude != null ? `${plotMeta.latitude.toFixed(5)}, ${plotMeta.longitude?.toFixed(5)}` : undefined },
  ].filter((d) => d.value != null && String(d.value).trim() !== '' && d.value !== 0);

  async function handleOpenMaps() {
    await openInMaps({
      location: locationLabel,
      latitude: plotMeta?.latitude,
      longitude: plotMeta?.longitude,
    });
  }

  async function pickAndUpload(type: 'photo' | 'pdf') {
    if (!user || !nagar) return;
    let uri = '';
    let displayName = '';

    if (type === 'photo') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required.');
        return;
      }
      await new Promise<void>((resolve) => {
        Alert.alert('Add Photo', 'Choose source', [
          {
            text: 'Camera',
            onPress: async () => {
              const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
              if (!r.canceled && r.assets[0]) {
                uri = r.assets[0].uri;
                displayName = `photo_${Date.now()}.jpg`;
              }
              resolve();
            },
          },
          {
            text: 'Gallery',
            onPress: async () => {
              const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
              if (!r.canceled && r.assets[0]) {
                uri = r.assets[0].uri;
                displayName = r.assets[0].fileName || `photo_${Date.now()}.jpg`;
              }
              resolve();
            },
          },
          { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
        ]);
      });
    } else {
      const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
      if (!r.canceled && r.assets[0]) {
        uri = r.assets[0].uri;
        displayName = r.assets[0].name || 'document.pdf';
      }
    }

    if (!uri || !displayName) return;
    setUploading(true);
    try {
      const url = await uploadPlotFile(user.uid, nagar, plot ?? 'Unassigned', uri, displayName);
      await addPlotAttachment(user.uid, nagar, plot ?? 'Unassigned', { url, name: displayName });
      await reloadAttachments();
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  }

  function toggleSelect(url: string) {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  async function shareSelected() {
    const selected = attachments.filter((a) => selectedUrls.has(a.url));
    if (!selected.length) return;

    if (selected.length === 1) {
      await shareAttachmentFile(selected[0].url, selected[0].name);
      setSelectedUrls(new Set());
      return;
    }

    try {
      const localUris: string[] = [];
      for (const att of selected) {
        const lower = att.url.toLowerCase();
        const isPdf = lower.includes('.pdf') || lower.includes('application/pdf');
        const extFromName = att.name.includes('.') ? att.name.slice(att.name.lastIndexOf('.')) : '';
        const ext = isPdf ? '.pdf' : extFromName || '.jpg';
        const safe = att.name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_');
        const localUri = `${FileSystem.cacheDirectory}share_${Date.now()}_${safe}${att.name.includes('.') ? '' : ext}`;
        await FileSystem.downloadAsync(att.url, localUri);
        localUris.push(localUri);
      }
      await Share.open({ urls: localUris, type: 'mixed' });
    } catch (e: any) {
      if (e?.message !== 'User did not share') {
        Alert.alert('Share failed', e?.message ?? 'Try again.');
      }
    }
    setSelectedUrls(new Set());
  }

  async function shareSelectedBW() {
    const selected = attachments.filter((a) => selectedUrls.has(a.url));
    if (!selected.length) return;
    try {
      const localUris: string[] = [];
      for (const att of selected) {
        const lower = att.url.toLowerCase();
        const isPdf = lower.includes('.pdf') || lower.includes('application/pdf');
        const safe = att.name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_');
        const hasExt = /\.(jpe?g|png|gif|webp|heic|pdf)$/i.test(safe);
        const fallbackExt = isPdf ? '.pdf' : (hasExt ? '' : '.jpg');
        const downloadUri = `${FileSystem.cacheDirectory}bw_${Date.now()}_${safe}${fallbackExt}`;
        await FileSystem.downloadAsync(att.url, downloadUri);

        if (isPdf) {
          if (PDF_SERVER) {
            // Upload to local server for Ghostscript B&W conversion
            const formData = new FormData();
            formData.append('pdf', {
              uri: Platform.OS === 'ios' ? downloadUri.replace('file://', '') : downloadUri,
              type: 'application/pdf',
              name: safe + '.pdf',
            } as any);
            const resp = await fetch(`${PDF_SERVER}/convert-pdf-bw`, {
              method: 'POST',
              body: formData,
              headers: PDF_API_KEY ? { 'x-api-key': PDF_API_KEY } : {},
            });
            if (!resp.ok) throw new Error(`Server PDF conversion failed (${resp.status})`);
            const { url: bwUrl } = await resp.json();
            const bwUri = `${FileSystem.cacheDirectory}bw_server_${Date.now()}.pdf`;
            await FileSystem.downloadAsync(bwUrl, bwUri);
            localUris.push(bwUri);
          } else {
            // No server configured — share PDF as-is
            localUris.push(downloadUri);
          }
        } else {
          const img = await ImageManipulator.manipulate(downloadUri).grayscale().renderAsync();
          const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
          localUris.push(saved.uri);
        }
      }
      if (localUris.length === 1) {
        await Sharing.shareAsync(localUris[0]);
      } else {
        await Share.open({ urls: localUris, type: 'mixed' });
      }
    } catch (e: any) {
      if (e?.message !== 'User did not share') Alert.alert('B&W Share failed', e?.message ?? 'Try again.');
    }
    setSelectedUrls(new Set());
  }

  async function deleteSelected() {
    if (!user || !nagar) return;
    const selected = attachments.filter((a) => selectedUrls.has(a.url));
    if (!selected.length) return;
    for (const att of selected) {
      await deleteFile(att.url);
      await removePlotAttachment(user.uid, nagar, plot ?? 'Unassigned', att.url);
    }
    await reloadAttachments();
    setSelectedUrls(new Set());
  }

  async function applyRename() {
    if (!user || !nagar || !renameUrl) return;
    const name = renameValue.trim();
    if (!name) {
      Alert.alert('Rename', 'Enter a file name.');
      return;
    }
    try {
      await renamePlotAttachment(user.uid, nagar, plot ?? 'Unassigned', renameUrl, name);
      setRenameVisible(false);
      setRenameUrl('');
      await reloadAttachments();
    } catch (e: any) {
      Alert.alert('Rename failed', e?.message ?? 'Try again.');
    }
  }

  const listHeader = (
    <>
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: AppColors.incomeLight }]}>
          <Text style={[styles.summaryLabel, { color: AppColors.income }]}>By Cash</Text>
          <Text style={[styles.summaryValue, { color: AppColors.income }]}>{formatCurrency(summary.byCash)}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: AppColors.balanceLight }]}>
          <Text style={[styles.summaryLabel, { color: AppColors.balance }]}>To Cash</Text>
          <Text style={[styles.summaryValue, { color: AppColors.balance }]}>{formatCurrency(summary.toCash)}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: AppColors.expenseLight }]}>
          <Text style={[styles.summaryLabel, { color: AppColors.expense }]}>Expense</Text>
          <Text style={[styles.summaryValue, { color: AppColors.expense }]}>{formatCurrency(summary.expense)}</Text>
        </View>
      </View>
      {(() => {
        const balance = summary.broughtPrice + summary.expense - summary.byCash;
        return (
          <View style={[styles.netProfitCard, { backgroundColor: balance >= 0 ? AppColors.balanceLight : AppColors.expenseLight }]}>
            <Text style={[styles.netProfitLabel, { color: balance >= 0 ? AppColors.balance : AppColors.expense }]}>Balance</Text>
            <Text style={[styles.netProfitValue, { color: balance >= 0 ? AppColors.balance : AppColors.expense }]}>
              {balance >= 0 ? '' : '-'}{formatCurrency(Math.abs(balance))}
            </Text>
          </View>
        );
      })()}
      <TouchableOpacity style={styles.locationBox} onPress={handleOpenMaps} activeOpacity={0.85}>
        <View style={styles.locationIconWrap}>
          <Text style={styles.locationIcon}>📍</Text>
        </View>
        <View style={styles.locationTextWrap}>
          <Text style={styles.locationTitle}>Location</Text>
          <Text style={styles.locationValue} numberOfLines={3}>
            {locationLabel || 'Tap to add location details in property entry'}
          </Text>
          <Text style={styles.locationAction}>Open in Google Maps →</Text>
        </View>
      </TouchableOpacity>

      {detailItems.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Property details</Text>
          <View style={styles.detailGrid}>
            {detailItems.map((item) => (
              <View key={item.label} style={styles.detailCell}>
                <Text style={styles.detailLabel}>{item.label}</Text>
                <Text style={styles.detailValue} numberOfLines={2}>{String(item.value)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Plot documents</Text>
      <Text style={styles.sectionHint}>Long press a row to select, then tap more rows to multi-select</Text>
      {selectedUrls.size > 0 && (
        <View style={styles.multiBar}>
          <Text style={styles.multiCount}>{selectedUrls.size} selected</Text>
          <Text style={styles.multiHint}>Selection mode active</Text>
          <TouchableOpacity style={styles.multiAction} onPress={() => setSelectedUrls(new Set())}>
            <Text style={styles.multiActionText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.docBtnRow}>
        <TouchableOpacity style={styles.docBtn} onPress={() => pickAndUpload('photo')} disabled={uploading}>
          <Text style={styles.docBtnIcon}>📷</Text>
          <Text style={styles.docBtnText}>Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.docBtn} onPress={() => pickAndUpload('pdf')} disabled={uploading}>
          <Text style={styles.docBtnIcon}>📄</Text>
          <Text style={styles.docBtnText}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.docBtn, selectedUrls.size > 0 && styles.selectDocBtnActive]}
          onPress={() => {
            if (selectedUrls.size > 0) {
              setSelectedUrls(new Set());
              return;
            }
            const first = attachments[0];
            if (first) setSelectedUrls(new Set([first.url]));
          }}
          disabled={attachments.length === 0}
        >
          <Text style={styles.docBtnIcon}>☑</Text>
          <Text style={styles.docBtnText}>{selectedUrls.size > 0 ? 'Cancel' : 'Select'}</Text>
        </TouchableOpacity>
        {uploading && <ActivityIndicator color={AppColors.primary} style={{ marginLeft: 8 }} />}
      </View>

      {attachments.map((att) => {
        const isPdf = att.name.toLowerCase().endsWith('.pdf') || att.url.toLowerCase().includes('pdf');
        return (
          <Pressable
            key={att.url}
            style={({ pressed }) => [
              styles.docRow,
              selectedUrls.has(att.url) && styles.docRowSelected,
              pressed && styles.docRowPressed,
            ]}
            onPress={() => (selectedUrls.size > 0 ? toggleSelect(att.url) : openFile(att.url))}
            onLongPress={() => toggleSelect(att.url)}
          >
            {isPdf ? (
              <View style={styles.pdfThumb}>
                <Text style={styles.pdfIcon}>PDF</Text>
              </View>
            ) : (
              <Image source={{ uri: att.url }} style={styles.thumb} />
            )}
            <View style={styles.docInfo}>
              <Text style={styles.docName} numberOfLines={2}>{att.name}</Text>
              <Text style={styles.docTap}>
                {selectedUrls.size > 0
                  ? (selectedUrls.has(att.url) ? 'Selected' : 'Tap to select')
                  : 'Tap to open · Long press for options'}
              </Text>
            </View>
            {selectedUrls.size > 0 && (
              <View style={[styles.check, selectedUrls.has(att.url) && styles.checkOn]}>
                <Text style={[styles.checkText, selectedUrls.has(att.url) && styles.checkTextOn]}>
                  {selectedUrls.has(att.url) ? '✓' : ''}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}

      <Text style={styles.entriesTitle}>Entries</Text>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', marginHorizontal: 10 }}>
          <Text style={styles.title} numberOfLines={1}>{nagar} · {plot}</Text>
          {entries.length > 0 && <Text style={styles.entryCountLabel}>{entries.length} entries</Text>}
        </View>
        <TouchableOpacity onPress={handleShareReport} disabled={isSharingReport}>
          <Text style={styles.shareText}>{isSharingReport ? '...' : 'PDF'}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom + 110, 130) }}
        renderItem={({ item }) => {
          const r = (item.remarks || '').toLowerCase();
          const isSell = r.startsWith('sell price');
          const isBroughtPrice = r.startsWith('brought price');
          const isExpense = r.startsWith('to cash:') || r.startsWith('expense');
          let chipLabel = '';
          let chipValue = 0;
          let chipColor = AppColors.income;
          let chipBg = AppColors.incomeLight;
          if (isBroughtPrice && item.cash_in > 0) {
            chipLabel = 'Brought Price'; chipValue = item.cash_in;
            chipColor = AppColors.govt; chipBg = AppColors.govtLight;
          } else if (isSell && item.cash_in > 0) {
            chipLabel = 'Sell Price'; chipValue = item.cash_in;
            chipColor = AppColors.govt; chipBg = AppColors.govtLight;
          } else if (!isSell && !isBroughtPrice && item.cash_in > 0) {
            chipLabel = 'By Cash'; chipValue = item.cash_in;
            chipColor = AppColors.income; chipBg = AppColors.incomeLight;
          } else if (isExpense && item.cash_out > 0) {
            chipLabel = 'Expense'; chipValue = item.cash_out;
            chipColor = AppColors.expense; chipBg = AppColors.expenseLight;
          } else if (item.cash_out > 0) {
            chipLabel = 'To Cash'; chipValue = item.cash_out;
            chipColor = AppColors.balance; chipBg = AppColors.balanceLight;
          }
          const remarkDisplay = item.remarks && !isSell && !isBroughtPrice
            ? item.remarks.replace(/^(expense:|to cash:|sell price|brought price)/i, '').replace(/^\s*\|\s*/, '').trim()
            : '';
          return (
            <TouchableOpacity
              style={styles.item}
              onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id, financialOnly: '1' } })}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.itemDate}>{formatDate(item.date)}</Text>
                {remarkDisplay ? <Text style={styles.itemRemarks} numberOfLines={1}>{remarkDisplay}</Text> : null}
              </View>
              {chipLabel ? (
                <View style={[styles.amountChip, { backgroundColor: chipBg }]}>
                  <Text style={[styles.amountChipLabel, { color: chipColor }]}>{chipLabel}</Text>
                  <Text style={[styles.amountChipValue, { color: chipColor }]}>{formatCurrency(chipValue)}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No entries for this plot yet.</Text>}
      />

      {selectedUrls.size === 0 ? (
        <TouchableOpacity
          style={[styles.fab, { bottom: Math.max(insets.bottom + 24, 34) }]}
          onPress={() => router.push({ pathname: '/transaction/add', params: { nagar, plot, financialOnly: '1' } })}
        >
          <Text style={styles.fabText}>+ Add Entry</Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.selectionBar, { bottom: 28 + insets.bottom }]}>
          <TouchableOpacity style={styles.selectionBtn} onPress={() => shareSelected()}>
            <Text style={styles.selectionBtnText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.selectionBtn, styles.selectionBwBtn]} onPress={() => shareSelectedBW()}>
            <Text style={styles.selectionBwText}>B&W</Text>
          </TouchableOpacity>
          {selectedUrls.size === 1 && (
            <TouchableOpacity
              style={styles.selectionBtn}
              onPress={() => {
                const selected = attachments.find((a) => selectedUrls.has(a.url));
                if (!selected) return;
                setRenameUrl(selected.url);
                setRenameValue(selected.name);
                setRenameVisible(true);
              }}
            >
              <Text style={styles.selectionBtnText}>Rename</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.selectionBtn, styles.selectionDeleteBtn]}
            onPress={() =>
              Alert.alert('Delete selected', `Delete ${selectedUrls.size} document(s)?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteSelected() },
              ])
            }
          >
            <Text style={styles.selectionDeleteText}>Delete Selected</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectionBtn} onPress={() => setSelectedUrls(new Set())}>
            <Text style={styles.selectionBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={renameVisible} transparent animationType="fade" onRequestClose={() => setRenameVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Rename document</Text>
            <TextInput
              style={styles.modalInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="File name"
              placeholderTextColor={AppColors.textSecondary}
              autoFocus={Platform.OS === 'ios'}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnGhost} onPress={() => setRenameVisible(false)}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnPrimary} onPress={applyRename}>
                <Text style={styles.modalBtnPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.bg },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: AppColors.card, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  backText: { color: AppColors.primary, fontWeight: '700' },
  shareText: { color: AppColors.primary, fontWeight: '700' },
  title: { textAlign: 'center', fontSize: 15, fontWeight: '800', color: AppColors.text },
  entryCountLabel: { fontSize: 11, color: AppColors.textSecondary, fontWeight: '600', marginTop: 1 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  summaryCard: { flex: 1, borderRadius: 14, padding: 14 },
  summaryLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  summaryValue: { marginTop: 6, fontSize: 17, fontWeight: '900' },
  sellPriceCard: { backgroundColor: AppColors.govtLight, borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  netProfitCard: { borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  netProfitLabel: { fontSize: 13, fontWeight: '700' },
  netProfitValue: { fontSize: 20, fontWeight: '900' },
  sellPriceLabel: { fontSize: 13, fontWeight: '700', color: AppColors.govt },
  sellPriceValue: { fontSize: 20, fontWeight: '900' },
  locationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.card,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: AppColors.primary,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  locationIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: AppColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationIcon: { fontSize: 24 },
  locationTextWrap: { flex: 1 },
  locationTitle: { fontSize: 11, fontWeight: '800', color: AppColors.primary, textTransform: 'uppercase', letterSpacing: 0.4 },
  locationValue: { fontSize: 14, fontWeight: '700', color: AppColors.text, marginTop: 4 },
  locationAction: { fontSize: 12, fontWeight: '700', color: AppColors.primary, marginTop: 6 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  detailCell: {
    width: '48%',
    backgroundColor: AppColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 10,
  },
  detailLabel: { fontSize: 10, fontWeight: '800', color: AppColors.textSecondary, textTransform: 'uppercase' },
  detailValue: { fontSize: 13, fontWeight: '700', color: AppColors.text, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: AppColors.text, marginBottom: 4 },
  sectionHint: { fontSize: 12, color: AppColors.textSecondary, marginBottom: 10 },
  docBtnRow: { flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'center' },
  docBtn: { width: 92, backgroundColor: AppColors.card, borderRadius: 12, borderWidth: 1, borderColor: AppColors.primary, borderStyle: 'dashed', paddingVertical: 12, alignItems: 'center' },
  selectDocBtnActive: { backgroundColor: AppColors.primaryLight },
  docBtnIcon: { fontSize: 22, marginBottom: 4 },
  docBtnText: { fontSize: 13, fontWeight: '700', color: AppColors.primary },
  docRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: AppColors.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: AppColors.border },
  docRowPressed: { opacity: 0.92, backgroundColor: AppColors.primaryLight },
  docRowSelected: { borderColor: AppColors.primary, backgroundColor: AppColors.primaryLight },
  thumb: { width: 48, height: 48, borderRadius: 8 },
  pdfThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: AppColors.expenseLight, alignItems: 'center', justifyContent: 'center' },
  pdfIcon: { fontSize: 11, fontWeight: '800', color: AppColors.expense },
  docInfo: { flex: 1, marginLeft: 12 },
  docName: { fontSize: 14, fontWeight: '700', color: AppColors.text },
  docTap: { fontSize: 11, color: AppColors.textSecondary, marginTop: 4 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: AppColors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  checkText: { fontSize: 12 },
  checkTextOn: { color: '#fff', fontWeight: '800' },
  multiBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  multiCount: { fontSize: 12, fontWeight: '800', color: AppColors.text, marginRight: 6 },
  multiHint: { fontSize: 12, color: AppColors.textSecondary, fontWeight: '600' },
  multiAction: { backgroundColor: AppColors.card, borderWidth: 1, borderColor: AppColors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  multiActionText: { fontSize: 12, fontWeight: '700', color: AppColors.text },
  entriesTitle: { fontSize: 15, fontWeight: '800', color: AppColors.text, marginTop: 8, marginBottom: 10 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: AppColors.card, borderRadius: 14, padding: 14, marginBottom: 10, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },
  itemName: { fontSize: 15, fontWeight: '700', color: AppColors.text },
  itemDate: { fontSize: 12, color: AppColors.textSecondary, marginTop: 3 },
  itemRemarks: { fontSize: 11, color: AppColors.textSecondary, marginTop: 2 },
  amountChip: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'flex-end', minWidth: 100 },
  amountChipLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  amountChipValue: { fontSize: 16, fontWeight: '900', marginTop: 3 },
  empty: { textAlign: 'center', marginTop: 12, color: AppColors.textSecondary, fontWeight: '600' },
  fab: { position: 'absolute', bottom: 22, alignSelf: 'center', backgroundColor: AppColors.primary, borderRadius: 28, paddingHorizontal: 24, paddingVertical: 13 },
  fabText: { color: '#fff', fontWeight: '800' },
  selectionBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    backgroundColor: AppColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 10,
    flexDirection: 'row',
    gap: 8,
  },
  selectionBtn: {
    flex: 1,
    backgroundColor: AppColors.bg,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  selectionBtnText: { color: AppColors.text, fontWeight: '700', fontSize: 12 },
  selectionDeleteBtn: { backgroundColor: AppColors.expenseLight },
  selectionDeleteText: { color: AppColors.expense, fontWeight: '800', fontSize: 12 },
  selectionBwBtn: { backgroundColor: '#2d2d2d' },
  selectionBwText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: AppColors.card, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: AppColors.text, marginBottom: 12 },
  modalInput: { borderWidth: 1, borderColor: AppColors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: AppColors.text, marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtnGhost: { paddingVertical: 10, paddingHorizontal: 14 },
  modalBtnGhostText: { color: AppColors.textSecondary, fontWeight: '700' },
  modalBtnPrimary: { backgroundColor: AppColors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18 },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '800' },
  modalOverlayBottom: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end', padding: 12 },
  actionSheetBottom: { backgroundColor: AppColors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, padding: 12, borderWidth: 1, borderColor: AppColors.border },
  actionTitle: { fontSize: 14, fontWeight: '800', color: AppColors.text, marginBottom: 4, paddingHorizontal: 8 },
  actionBtnRow: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  actionText: { fontSize: 15, color: AppColors.text, fontWeight: '700' },
  actionDeleteText: { fontSize: 15, color: AppColors.expense, fontWeight: '800' },
  actionCancel: { marginTop: 4, backgroundColor: AppColors.bg, borderBottomWidth: 0 },
  pattaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a3a6b',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    gap: 12,
  },
  pattaBtnIcon: { fontSize: 22 },
  pattaBtnTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  pattaBtnSub: { color: '#a0b4d0', fontSize: 11, marginTop: 2 },
  pattaBtnArrow: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
