import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, View, StyleSheet, Text } from 'react-native';
import { Colors, spacing } from '../../components/ui';
import { HeroBanner } from '../../components/HeroBanner';
import { StartVisitCTA } from '../../components/StartVisitCTA';
import { GlanceableCard } from '../../components/GlanceableCard';
import { openWebDashboard, openWebActions, openWebVisit } from '../../lib/linking';

export default function HomeScreen() {
  // Mock data - will be replaced with real API calls
  const stats = {
    openActions: 3,
    unreadVisits: 1,
    medications: 2,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <HeroBanner />
        
        {/* Primary CTA - Now at top */}
        <View style={styles.ctaSection}>
          <StartVisitCTA onPress={() => { /* TODO: start recording flow */ }} />
        </View>
        
        {/* Glanceable Stats Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Overview</Text>
          
          <GlanceableCard
            title="Action Items"
            count={stats.openActions}
            countLabel="pending"
            icon="checkmark-circle-outline"
            onPress={openWebActions}
          />
          
          <GlanceableCard
            title="Recent Visits"
            count={stats.unreadVisits}
            countLabel="to review"
            icon="document-text-outline"
            onPress={openWebDashboard}
          />
        </View>
        
        {/* Helper text */}
        <Text style={styles.helperText}>
          Tap any card above to view details in your web portal
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    paddingHorizontal: spacing(5), 
    paddingVertical: spacing(3),
  },
  ctaSection: {
    marginTop: spacing(5),
    marginBottom: spacing(2),
  },
  section: {
    marginTop: spacing(5),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: spacing(3),
  },
  helperText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: spacing(5),
    paddingHorizontal: spacing(4),
  },
});
