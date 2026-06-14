import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { AppColors } from '../constants/appColors';

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      Alert.alert('Sign-in failed', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.logoArea}>
          <View style={styles.nBadge}>
            <Text style={styles.nLetter}>N</Text>
          </View>
          <Text style={styles.appName}>NTR Ledger</Text>
          <Text style={styles.tagline}>Real Estate Transaction Manager</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.welcomeTitle}>Welcome</Text>
          <Text style={styles.welcomeSub}>
            Sign in with your Google account to access your ledger. Each account has its own private data.
          </Text>

          <TouchableOpacity
            style={[styles.googleBtn, loading && styles.googleBtnDisabled]}
            onPress={handleSignIn}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleBtnText}>Sign in with Google</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Your data is private and tied to your Google account.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.goldBright },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 32,
    backgroundColor: AppColors.goldLight,
  },
  logoArea: { alignItems: 'center', backgroundColor: AppColors.goldBright, marginHorizontal: -24, marginTop: -40, paddingTop: 56, paddingBottom: 40, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  nBadge: {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: '#1a1a2e',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    elevation: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16,
  },
  nLetter: { fontSize: 50, fontWeight: '900', color: '#F5C518', letterSpacing: -3 },
  appName: { fontSize: 36, fontWeight: '800', color: '#1a1a2e', letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: AppColors.goldDark, marginTop: 6, fontWeight: '600' },

  card: {
    backgroundColor: AppColors.card,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  welcomeTitle: { fontSize: 22, fontWeight: '700', color: AppColors.text, marginBottom: 8 },
  welcomeSub: { fontSize: 14, color: AppColors.textSecondary, lineHeight: 20, marginBottom: 24 },

  googleBtn: {
    backgroundColor: AppColors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  googleBtnDisabled: { opacity: 0.7 },
  googleIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  googleBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  footer: { fontSize: 12, color: AppColors.textSecondary, textAlign: 'center' },
});
