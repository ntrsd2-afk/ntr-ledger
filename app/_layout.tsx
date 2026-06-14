import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { TransactionProvider } from '../context/TransactionContext';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { initFirebase } from '../lib/firebase/init';

SplashScreen.hideAsync().catch(() => {});
initFirebase();

export const unstable_settings = {
  anchor: '(tabs)/properties',
};

function AuthGate() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === 'login';
    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)/properties');
    }
  }, [user, isLoading, segments]);

  return null;
}

function WebUnsupportedScreen() {
  return (
    <View style={webStyles.container}>
      <Text style={webStyles.title}>Use Android or iOS</Text>
      <Text style={webStyles.body}>
        Ntr uses native Firebase and does not run in the browser preview.
      </Text>
      <Text style={webStyles.steps}>
        1. Stop the web tab{'\n'}
        2. In the terminal, press a for Android emulator{'\n'}
        3. Or run: npx expo run:android
      </Text>
    </View>
  );
}

export default function RootLayout() {
  if (Platform.OS === 'web') {
    return (
      <>
        <WebUnsupportedScreen />
        <StatusBar style="dark" backgroundColor="#f4f6f9" />
      </>
    );
  }

  return (
    <AuthProvider>
      <TransactionProvider>
        <AuthGate />
        <Stack>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="transaction/add" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="property-plot" options={{ headerShown: false }} />
          <Stack.Screen name="nagar-plots" options={{ headerShown: false }} />
          <Stack.Screen name="account-entry/add" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="account-entry/by-cash" options={{ headerShown: false }} />
          <Stack.Screen name="account-entry/to-cash" options={{ headerShown: false }} />
          <Stack.Screen name="account-entry/by-land" options={{ headerShown: false }} />
          <Stack.Screen name="account-entry/to-land" options={{ headerShown: false }} />
          <Stack.Screen name="account-entry/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="transaction/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="all-locations" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="dark" backgroundColor="#f4f6f9" />
      </TransactionProvider>
    </AuthProvider>
  );
}

const webStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f9',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#1a1a2e', marginBottom: 12 },
  body: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 16, lineHeight: 22 },
  steps: { fontSize: 14, color: '#1a6b3c', fontWeight: '600', lineHeight: 24, textAlign: 'left' },
});
