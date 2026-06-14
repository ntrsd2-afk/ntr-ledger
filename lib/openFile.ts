import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { ToastAndroid } from 'react-native';

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export async function openFile(url: string): Promise<void> {
  const isPdf = url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('/raw/');
  const ext = isPdf ? '.pdf' : '.jpg';
  const localUri = `${FileSystem.cacheDirectory}doc_${hashString(url)}${ext}`;

  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    ToastAndroid.show('Downloading...', ToastAndroid.SHORT);
    const result = await FileSystem.downloadAsync(url, localUri);
    if (result.status !== 200) throw new Error(`Download failed: ${result.status}`);
  } else {
    ToastAndroid.show('Opening local file...', ToastAndroid.SHORT);
  }

  const contentUri = await FileSystem.getContentUriAsync(localUri);
  const mimeType = isPdf ? 'application/pdf' : 'image/*';

  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1,
    type: mimeType,
  });
}
