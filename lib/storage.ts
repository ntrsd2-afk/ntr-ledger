import * as FileSystem from 'expo-file-system/legacy';
import storage from '@react-native-firebase/storage';

async function toLocalUri(uri: string, fileName: string): Promise<string> {
  if (uri.startsWith('content://')) {
    const dest = `${FileSystem.cacheDirectory}${Date.now()}_${fileName}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  }
  return uri;
}

export async function uploadFile(
  uid: string,
  txId: string,
  uri: string,
  fileName: string
): Promise<string> {
  const localUri = await toLocalUri(uri, fileName);
  const safeLeaf = fileName.replace(/[/\\]/g, '_');
  const ref = storage().ref(`users/${uid}/transactions/${txId}/${Date.now()}_${safeLeaf}`);
  await ref.putFile(localUri);
  return await ref.getDownloadURL();
}

/** Plot-level uploads: keeps original file name in the storage object name (slashes sanitized only). */
export async function uploadPlotFile(
  uid: string,
  nagarName: string,
  plotNo: string,
  uri: string,
  fileName: string
): Promise<string> {
  const localUri = await toLocalUri(uri, fileName);
  const plotKey = plotNo || 'Unassigned';
  const nagarKey = nagarName.replace(/[/\\]/g, '_');
  const plotSeg = plotKey.replace(/[/\\]/g, '_');
  const safeLeaf = fileName.replace(/[/\\]/g, '_');
  const ref = storage().ref(`users/${uid}/nagarPlots/${nagarKey}/${plotSeg}/${Date.now()}_${safeLeaf}`);
  await ref.putFile(localUri);
  return await ref.getDownloadURL();
}

export async function deleteFile(url: string): Promise<void> {
  try {
    await storage().refFromURL(url).delete();
  } catch (_) {}
}
