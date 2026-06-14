import { Alert, Linking, Platform } from 'react-native';

export type MapTarget = {
  location?: string;
  latitude?: number;
  longitude?: number;
};

export function buildLocationLabel(parts: {
  location?: string;
  nagar_name?: string;
  village?: string;
  taluk?: string;
  district?: string;
  plot_no?: string;
}): string {
  if (parts.location?.trim()) return parts.location.trim();
  const segments = [
    parts.plot_no ? `Plot ${parts.plot_no}` : '',
    parts.nagar_name,
    parts.village,
    parts.taluk,
    parts.district,
  ].filter(Boolean);
  return segments.join(', ');
}

export async function openInMaps(target: MapTarget): Promise<void> {
  const { location, latitude, longitude } = target;
  let url: string | undefined;

  if (latitude != null && longitude != null && !Number.isNaN(latitude) && !Number.isNaN(longitude)) {
    const label = encodeURIComponent(location || 'Property');
    url =
      Platform.OS === 'ios'
        ? `maps:0,0?q=${label}@${latitude},${longitude}`
        : Platform.OS === 'android'
          ? `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`
          : `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  } else if (location?.trim()) {
    const q = encodeURIComponent(location.trim());
    url =
      Platform.OS === 'ios'
        ? `maps:0,0?q=${q}`
        : Platform.OS === 'android'
          ? `geo:0,0?q=${q}`
          : `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  if (!url) {
    Alert.alert('No location', 'Add village, district, or location details to open Maps.');
    return;
  }

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    const webQ = encodeURIComponent(location || `${latitude},${longitude}`);
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${webQ}`);
    return;
  }
  await Linking.openURL(url);
}
