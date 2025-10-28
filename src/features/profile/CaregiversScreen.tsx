import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

const CaregiversScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Caregivers</Text>
      <Text style={styles.subtitle}>Manage your trusted caregivers</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
});

export default CaregiversScreen;
