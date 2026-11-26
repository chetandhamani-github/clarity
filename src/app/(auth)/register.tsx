import React from 'react';
import { StyleSheet } from 'react-native';
import { Screen, Text } from '@/components/ui';

export default function RegisterScreen() {
  return (
    <Screen style={styles.screen}>
      <Text variant="displayLg">Register</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 16,
  },
});
