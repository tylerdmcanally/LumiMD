import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, ScrollView, StyleSheet, Pressable, Switch, Linking, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, spacing, Radius, Card } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import {
  getNotificationPermissions,
  getExpoPushToken,
  registerPushToken,
  unregisterPushToken,
} from '../lib/notifications';

const PUSH_TOKEN_STORAGE_KEY = 'lumimd:pushToken';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isLoadingPush, setIsLoadingPush] = useState(false);

  // Check notification permission status on mount
  useEffect(() => {
    const checkPushStatus = async () => {
      try {
        const permissionStatus = await getNotificationPermissions();
        const isGranted = permissionStatus === 'granted';
        setPushEnabled(isGranted);

        if (isGranted) {
          // Try to get existing token from storage
          const storedToken = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
          if (storedToken) {
            setPushToken(storedToken);
          } else {
            // Get new token if we have permission but no stored token
            const token = await getExpoPushToken();
            if (token) {
              setPushToken(token);
              await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
              try {
                await registerPushToken(token);
              } catch (error) {
                console.error('[Settings] Failed to register push token:', error);
              }
            }
          }
        }
      } catch (error) {
        console.error('[Settings] Error checking push status:', error);
      }
    };

    if (user) {
      checkPushStatus();
    }
  }, [user]);

  const handlePushToggle = async (enabled: boolean) => {
    setIsLoadingPush(true);
    try {
      if (enabled) {
        // Enable push notifications
        const token = await getExpoPushToken();
        if (token) {
          setPushToken(token);
          await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
          await registerPushToken(token);
          setPushEnabled(true);
        } else {
          Alert.alert(
            'Permission Required',
            'Please enable notifications in your device settings to receive push notifications.',
          );
          setPushEnabled(false);
        }
      } else {
        // Disable push notifications
        if (pushToken) {
          try {
            await unregisterPushToken(pushToken);
          } catch (error) {
            console.error('[Settings] Error unregistering push token:', error);
          }
          await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
          setPushToken(null);
        }
        setPushEnabled(false);
      }
    } catch (error) {
      console.error('[Settings] Error toggling push notifications:', error);
      Alert.alert('Error', 'Failed to update notification settings. Please try again.');
      // Revert toggle state on error
      setPushEnabled(!enabled);
    } finally {
      setIsLoadingPush(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/sign-in');
          },
        },
      ]
    );
  };

  const openLink = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Account Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            
            <Card style={styles.card}>
              <View style={styles.accountInfo}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={32} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountName}>
                    {user?.displayName || 'User Account'}
                  </Text>
                  <Text style={styles.accountEmail}>
                    {user?.email || 'No email'}
                  </Text>
                </View>
              </View>
            </Card>
          </View>

          {/* Preferences Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preferences</Text>
            
            <Card style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.settingIcon}>
                  <Ionicons name="notifications" size={22} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Push Notifications</Text>
                  <Text style={styles.settingDescription}>
                    Get notified when your visit summary is ready
                  </Text>
                </View>
                <Switch
                  value={pushEnabled}
                  onValueChange={handlePushToggle}
                  disabled={isLoadingPush}
                  trackColor={{ false: '#d1d5db', true: Colors.accent }}
                  thumbColor={pushEnabled ? Colors.primary : '#f3f4f6'}
                />
              </View>
            </Card>
          </View>

          {/* Legal Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Legal</Text>
            
            <Card style={styles.card}>
              <Pressable 
                style={styles.linkRow}
                onPress={() => openLink('https://lumimd.com/terms')}
              >
                <View style={styles.settingIcon}>
                  <Ionicons name="document-text-outline" size={22} color={Colors.textMuted} />
                </View>
                <Text style={styles.linkLabel}>Terms of Service</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </Pressable>

              <View style={styles.divider} />

              <Pressable 
                style={styles.linkRow}
                onPress={() => openLink('https://lumimd.com/privacy')}
              >
                <View style={styles.settingIcon}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={Colors.textMuted} />
                </View>
                <Text style={styles.linkLabel}>Privacy Policy</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </Pressable>
            </Card>
          </View>

          {/* Sign Out */}
          <View style={styles.section}>
            <Pressable 
              style={styles.signOutButton}
              onPress={handleSignOut}
            >
              <Ionicons name="log-out-outline" size={22} color={Colors.error} />
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          </View>

          {/* App Version */}
          <View style={styles.versionSection}>
            <Text style={styles.versionText}>LumiMD v1.0.0</Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing(5),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing(4),
  },
  backButton: {
    padding: spacing(1),
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
  },
  section: {
    marginBottom: spacing(6),
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing(3),
  },
  card: {
    padding: 0,
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(4),
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(4),
  },
  accountName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: spacing(1),
  },
  accountEmail: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(4),
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(4),
  },
  linkLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    marginLeft: spacing(3),
  },
  divider: {
    height: 1,
    backgroundColor: Colors.stroke,
    marginLeft: spacing(4) + 36 + spacing(3),
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(4),
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.error,
    marginLeft: spacing(2),
  },
  versionSection: {
    alignItems: 'center',
    paddingVertical: spacing(8),
  },
  versionText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
});

