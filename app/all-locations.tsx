import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppColors } from '../constants/appColors';
import { ACCOUNTS_LEDGER } from '../constants/appConstants';
import { useAuth } from '../context/AuthContext';
import { useTransactions } from '../context/TransactionContext';
import { getPlotMetadata, setPlotMetadata } from '../lib/nagars';
import { buildLocationLabel, openInMaps } from '../lib/maps';

type LocationItem = {
  key: string;
  nagar: string;
  plot: string;
  location: string;
  village: string;
  taluk: string;
  district: string;
  latitude?: number;
  longitude?: number;
};

export default function AllLocationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { transactions, removeTransaction } = useTransactions();
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [coordsMap, setCoordsMap] = useState<Record<string, { latitude: number; longitude: number }>>({});

  const allLocations = useMemo<LocationItem[]>(() => {
    const seen = new Set<string>();
    const result: LocationItem[] = [];
    for (const t of transactions) {
      if (t.nagar_name === ACCOUNTS_LEDGER) continue;
      const key = `${t.nagar_name}::${t.plot_no || 'Unassigned'}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          key,
          nagar: t.nagar_name,
          plot: t.plot_no || 'Unassigned',
          location: buildLocationLabel({
            nagar_name: t.nagar_name,
            village: t.village,
            taluk: t.taluk,
            district: t.district,
            plot_no: t.plot_no,
          }),
          village: t.village || '',
          taluk: t.taluk || '',
          district: t.district || '',
        });
      }
    }
    return result.sort((a, b) => a.nagar.localeCompare(b.nagar));
  }, [transactions]);

  const locations = useMemo(() => {
    let list = showHidden ? allLocations.filter(l => hiddenKeys.has(l.key)) : allLocations.filter(l => !hiddenKeys.has(l.key));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(l =>
        l.nagar.toLowerCase().includes(q) ||
        l.plot.toLowerCase().includes(q) ||
        l.location.toLowerCase().includes(q) ||
        l.village.toLowerCase().includes(q) ||
        l.district.toLowerCase().includes(q) ||
        l.taluk.toLowerCase().includes(q) ||
        (nicknames[l.key] || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allLocations, hiddenKeys, showHidden, search, nicknames]);

  useEffect(() => {
    if (!user || !allLocations.length) return;
    (async () => {
      const results = await Promise.all(
        allLocations.map(async (l) => {
          const meta = await getPlotMetadata(user.uid, l.nagar, l.plot);
          return { key: l.key, nickname: meta?.nickname || '', hidden: meta?.hidden || false, latitude: meta?.latitude, longitude: meta?.longitude };
        })
      );
      const nm: Record<string, string> = {};
      const hk = new Set<string>();
      const coordsMap: Record<string, { latitude: number; longitude: number }> = {};
      for (const { key, nickname, hidden, latitude, longitude } of results) {
        if (nickname) nm[key] = nickname;
        if (hidden) hk.add(key);
        if (latitude != null && longitude != null) coordsMap[key] = { latitude, longitude };
      }
      setNicknames(nm);
      setHiddenKeys(hk);
      setCoordsMap(coordsMap);
    })();
  }, [user, allLocations.length]);

  function openNicknameModal(key: string) {
    setModalKey(key);
    setNicknameInput(nicknames[key] || '');
  }

  async function saveNickname() {
    if (!user || !modalKey) return;
    const item = allLocations.find((l) => l.key === modalKey);
    if (!item) return;
    setSaving(true);
    try {
      await setPlotMetadata(user.uid, item.nagar, item.plot, { nickname: nicknameInput.trim() });
      setNicknames((prev) => ({ ...prev, [modalKey]: nicknameInput.trim() }));
      setModalKey(null);
    } finally {
      setSaving(false);
    }
  }

  async function hideLocation(item: LocationItem) {
    if (!user) return;
    await setPlotMetadata(user.uid, item.nagar, item.plot, { hidden: true });
    setHiddenKeys((prev) => new Set([...prev, item.key]));
  }

  async function unhideLocation(item: LocationItem) {
    if (!user) return;
    await setPlotMetadata(user.uid, item.nagar, item.plot, { hidden: false });
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      next.delete(item.key);
      return next;
    });
  }

  function deleteLocation(item: LocationItem) {
    const txIds = transactions
      .filter(t => t.nagar_name === item.nagar && (t.plot_no || 'Unassigned') === item.plot)
      .map(t => t.id);
    if (!txIds.length) { Alert.alert('Nothing to delete', 'No transactions found for this plot.'); return; }
    Alert.alert(
      'Delete Location',
      `Delete all ${txIds.length} entries for "${item.nagar} · ${item.plot}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            for (const id of txIds) await removeTransaction(id);
          },
        },
      ]
    );
  }

  function onLongPress(item: LocationItem) {
    const isHidden = hiddenKeys.has(item.key);
    Alert.alert(item.nagar, `Plot: ${item.plot}`, [
      {
        text: isHidden ? 'Unhide' : 'Hide',
        onPress: () => isHidden ? unhideLocation(item) : hideLocation(item),
      },
      { text: 'Delete', style: 'destructive', onPress: () => deleteLocation(item) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const hiddenCount = hiddenKeys.size;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>All Locations</Text>
        {hiddenCount > 0 ? (
          <TouchableOpacity onPress={() => setShowHidden(v => !v)}>
            <Text style={styles.toggleHiddenText}>{showHidden ? 'Show All' : `Hidden (${hiddenCount})`}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search locations..."
          placeholderTextColor={AppColors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={locations}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => openInMaps({ location: item.location, latitude: coordsMap[item.key]?.latitude, longitude: coordsMap[item.key]?.longitude })}
            onLongPress={() => onLongPress(item)}
            activeOpacity={0.85}
            delayLongPress={400}
          >
            <View style={styles.pinWrap}>
              <Text style={styles.pin}>📍</Text>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.nagarRow}>
                <Text style={styles.nagarName} numberOfLines={1}>{item.nagar}</Text>
                <TouchableOpacity
                  style={[styles.nicknameBadge, !nicknames[item.key] && styles.nicknameBadgeEmpty]}
                  onPress={() => openNicknameModal(item.key)}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Text style={[styles.nicknameBadgeText, !nicknames[item.key] && styles.nicknameBadgeTextEmpty]} numberOfLines={1}>
                    {nicknames[item.key] || '+ Nickname'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.plotNo}>Plot · {item.plot}</Text>
              {item.location ? (
                <Text style={styles.locationText} numberOfLines={2}>{item.location}</Text>
              ) : (
                <Text style={styles.noLocation}>No address details added</Text>
              )}
              {item.district ? (
                <View style={styles.tagRow}>
                  {item.district ? <View style={styles.tag}><Text style={styles.tagText}>{item.district}</Text></View> : null}
                  {item.taluk ? <View style={styles.tag}><Text style={styles.tagText}>{item.taluk}</Text></View> : null}
                  {item.village ? <View style={styles.tag}><Text style={styles.tagText}>{item.village}</Text></View> : null}
                </View>
              ) : null}
            </View>
            <Text style={styles.openText}>Open →</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{showHidden ? '👁' : '🗺️'}</Text>
            <Text style={styles.emptyText}>{showHidden ? 'No hidden locations.' : search ? 'No results found.' : 'No locations found.'}</Text>
            {!showHidden && !search && (
              <Text style={styles.emptySub}>Add village, district, or taluk details in property entries to see them here.</Text>
            )}
          </View>
        }
        ListFooterComponent={
          locations.length > 0 ? (
            <Text style={styles.hint}>Long press a card to hide or delete · Tap to open in Maps</Text>
          ) : null
        }
      />

      <Modal visible={!!modalKey} transparent animationType="fade" onRequestClose={() => setModalKey(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Location Nickname</Text>
            <Text style={styles.modalSub}>A short label to identify this location quickly</Text>
            <TextInput
              style={styles.modalInput}
              value={nicknameInput}
              onChangeText={setNicknameInput}
              placeholder="e.g. Main Farm, Corner Plot..."
              placeholderTextColor={AppColors.textSecondary}
              autoFocus
              maxLength={40}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setModalKey(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveNickname} disabled={saving}>
                <Text style={styles.modalSaveText}>{saving ? 'Saving...' : 'Save'}</Text>
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12,
    backgroundColor: AppColors.card, borderBottomWidth: 1, borderBottomColor: AppColors.border,
  },
  backText: { color: AppColors.primary, fontWeight: '700', fontSize: 15 },
  title: { fontSize: 17, fontWeight: '800', color: AppColors.text },
  toggleHiddenText: { fontSize: 13, fontWeight: '700', color: AppColors.primary, backgroundColor: AppColors.primaryLight, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: AppColors.bg, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  searchInput: {
    backgroundColor: AppColors.card, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    color: AppColors.text, borderWidth: 1, borderColor: AppColors.border,
  },
  list: { padding: 16, paddingBottom: 40 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: AppColors.card, borderRadius: 16, padding: 14,
    marginBottom: 12, elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
    borderWidth: 1, borderColor: AppColors.border,
  },
  pinWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: AppColors.goldLight,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, borderWidth: 1, borderColor: AppColors.gold + '55',
  },
  pin: { fontSize: 22 },
  cardBody: { flex: 1 },
  nagarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 },
  nagarName: { fontSize: 15, fontWeight: '800', color: AppColors.text },
  nicknameBadge: { backgroundColor: AppColors.goldBright, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  nicknameBadgeEmpty: { backgroundColor: AppColors.primaryLight, borderWidth: 1, borderColor: AppColors.primary, borderStyle: 'dashed' },
  nicknameBadgeText: { fontSize: 11, fontWeight: '800', color: '#1a1a2e' },
  nicknameBadgeTextEmpty: { color: AppColors.primary },
  plotNo: { fontSize: 12, color: AppColors.primary, fontWeight: '700', marginTop: 2 },
  locationText: { fontSize: 13, color: AppColors.textSecondary, marginTop: 4, lineHeight: 18 },
  noLocation: { fontSize: 12, color: AppColors.border, marginTop: 4, fontStyle: 'italic' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tag: { backgroundColor: AppColors.goldLight, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: AppColors.gold + '55' },
  tagText: { fontSize: 10, color: AppColors.goldDark, fontWeight: '600' },
  openText: { color: AppColors.primary, fontWeight: '800', fontSize: 13, marginLeft: 8, marginTop: 2 },
  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '700', color: AppColors.textSecondary, textAlign: 'center' },
  emptySub: { fontSize: 13, color: AppColors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  hint: { textAlign: 'center', fontSize: 12, color: AppColors.textSecondary, marginTop: 8, paddingHorizontal: 24 },
  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: AppColors.card, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: AppColors.text, marginBottom: 4 },
  modalSub: { fontSize: 13, color: AppColors.textSecondary, marginBottom: 14 },
  modalInput: {
    borderWidth: 1, borderColor: AppColors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: AppColors.text,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { color: AppColors.textSecondary, fontWeight: '700', fontSize: 15 },
  modalSave: { backgroundColor: AppColors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  modalSaveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
