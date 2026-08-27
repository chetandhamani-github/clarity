import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemeColors, useTheme } from '@/theme';

export const Loader = () => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
};

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      minHeight: 200,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 100,
    },
  });
  return styles;
};
