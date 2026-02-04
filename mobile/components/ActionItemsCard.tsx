import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Card, Colors, Radius, spacing } from './ui';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { haptic } from '../lib/haptics';

export type ActionItem = { id: string; title: string; subtitle: string; due?: string; critical?: boolean };

export function ActionItemsCard({ items, onAdd }: { items: ActionItem[]; onAdd: () => void }) {
  const handleAdd = () => {
    void haptic.selection();
    onAdd();
  };

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.h6}>Action Items</Text>
        <Pressable onPress={handleAdd} hitSlop={8}>
          <Ionicons name="add" size={20} color={Colors.text} />
        </Pressable>
      </View>

      {items.length === 0 ? (
        <View style={[styles.row, { marginTop: spacing(1) }]}>
          <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
          <Text style={styles.empty}>Nothing pending. You're all caught up!</Text>
        </View>
      ) : (
        <View style={{ marginTop: spacing(2) }}>
          {items.map(item => (
            <View key={item.id} style={[styles.item, { marginBottom: spacing(2) }]}>
              <View style={[styles.itemIcon, { backgroundColor: (item.critical ? '#ff6b6b26' : '#0a99a41f') }] }>
                <MaterialIcons name={item.critical ? 'warning' : 'checklist'} size={18} color={item.critical ? Colors.error : Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemSub}>{item.subtitle}</Text>
                {item.due ? <Text style={styles.itemDue}>{item.due}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#9aa3af" />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h6: { fontSize: 16, fontWeight: '600', color: Colors.text },
  row: { flexDirection: 'row', alignItems: 'center', marginLeft: spacing(3) },
  empty: { color: Colors.textMuted },
  item: { flexDirection: 'row', alignItems: 'flex-start', padding: spacing(3), backgroundColor: Colors.background, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.stroke },
  itemIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: spacing(3) },
  itemTitle: { fontWeight: '600', color: Colors.text },
  itemSub: { color: Colors.textMuted, marginTop: 2, fontSize: 13 },
  itemDue: { color: '#9ca3af', marginTop: 2, fontSize: 12 },
});

