import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppColors } from '../../constants/appColors';

type SavedLink = { id: string; nickname: string; url: string; createdAt: number };

const STORAGE_KEY = 'ntr_saved_links';

export default function LinksScreen() {
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [nickname, setNickname] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setLinks(JSON.parse(raw));
    });
  }, []);

  async function persist(next: SavedLink[]) {
    setLinks(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function addLink() {
    const nick = nickname.trim();
    let href = url.trim();
    if (!nick || !href) {
      Alert.alert('Missing info', 'Please fill in both fields.');
      return;
    }
    if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
    setSaving(true);
    const entry: SavedLink = { id: Date.now().toString(), nickname: nick, url: href, createdAt: Date.now() };
    await persist([entry, ...links]);
    setSaving(false);
    closeModal();
  }

  function closeModal() {
    setModalVisible(false);
    setNickname('');
    setUrl('');
  }

  function confirmDelete(id: string) {
    Alert.alert('Delete link?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => persist(links.filter((l) => l.id !== id)) },
    ]);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? links.filter((l) => l.nickname.toLowerCase().includes(q) || l.url.toLowerCase().includes(q))
      : links;
  }, [links, search]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Links</Text>
        <Text style={styles.headerSub}>Saved portals &amp; references</Text>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  Search links..."
          placeholderTextColor={AppColors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={3}
        key="3col"
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.linkBox}
            onPress={() => WebBrowser.openBrowserAsync(item.url)}
            onLongPress={() => confirmDelete(item.id)}
            activeOpacity={0.8}
            delayLongPress={500}
          >
            <Text style={styles.linkIcon}>🔗</Text>
            <Text style={styles.linkName} numberOfLines={3}>{item.nickname}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔗</Text>
            <Text style={styles.emptyTitle}>{search ? 'No results' : 'No links yet'}</Text>
            <Text style={styles.emptySub}>
              {search ? 'Try a different search.' : 'Tap + to save your first link.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          filtered.length > 0 ? (
            <Text style={styles.hint}>Long press a box to delete</Text>
          ) : null
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)} activeOpacity={0.85}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayDismiss} onPress={closeModal} activeOpacity={1} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Link</Text>

            <Text style={styles.fieldLabel}>Nickname</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="e.g. Patta Chitta, TNREGINET..."
              placeholderTextColor={AppColors.textSecondary}
              value={nickname}
              onChangeText={setNickname}
              maxLength={50}
              autoFocus
              returnKeyType="next"
            />

            <Text style={styles.fieldLabel}>URL</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="https://..."
              placeholderTextColor={AppColors.textSecondary}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={addLink}
            />

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={addLink} disabled={saving}>
                <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
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
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 14,
    backgroundColor: AppColors.card,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: AppColors.text },
  headerSub: { fontSize: 12, color: AppColors.textSecondary, marginTop: 2 },

  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: AppColors.bg,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  searchInput: {
    backgroundColor: AppColors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: AppColors.text,
    borderWidth: 1,
    borderColor: AppColors.border,
  },

  grid: { padding: 12, paddingBottom: 110 },
  row: { gap: 10, marginBottom: 10 },
  linkBox: {
    flex: 1,
    backgroundColor: AppColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 12,
    alignItems: 'center',
    minHeight: 96,
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  linkIcon: { fontSize: 22, marginBottom: 6 },
  linkName: { fontSize: 11, fontWeight: '800', color: AppColors.text, textAlign: 'center', lineHeight: 15 },

  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 44, marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: AppColors.textSecondary },
  emptySub: { fontSize: 13, color: AppColors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  hint: { textAlign: 'center', fontSize: 12, color: AppColors.textSecondary, marginTop: 8 },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  fabText: { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 34 },

  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  overlayDismiss: { flex: 1 },
  sheet: {
    backgroundColor: AppColors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 24,
    paddingBottom: 44,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: AppColors.border,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: AppColors.text, marginBottom: 20 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: AppColors.bg,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: AppColors.text,
    marginBottom: 16,
  },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: AppColors.bg,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  cancelText: { color: AppColors.textSecondary, fontWeight: '700', fontSize: 15 },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: AppColors.primary,
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
