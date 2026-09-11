import { Text } from '@/components/ui';
import { ThemeColors, typography, useTheme } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function CustomTabBar({ state, descriptors, navigation }: any) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = getStyles(colors);

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom }]}>
      <View style={styles.tabBar}>
        {/* Floating Action Button for Add Transaction (hidden on Splitwise tab which has its own FAB) */}
        {state.routes[state.index]?.name !== 'splitwise' && (
          <TouchableOpacity
            style={[styles.fab, { bottom: insets.bottom + 64 }]} // Float above the tab bar on the right
            onPress={() => {
              router.push('/add-transaction');
            }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="add" size={32} color={colors.onPrimary} />
          </TouchableOpacity>
        )}

        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          let iconName: keyof typeof MaterialIcons.glyphMap = 'home';
          if (route.name === 'index') iconName = 'home';
          else if (route.name === 'transactions') iconName = 'receipt-long';
          else if (route.name === 'splitwise') iconName = 'group';
          else if (route.name === 'plan') iconName = 'analytics';
          else if (route.name === 'goals') iconName = 'track-changes';
          else if (route.name === 'accounts') iconName = 'account-balance';

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={styles.tabItem}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={iconName}
                size={24}
                color={isFocused ? colors.primary : colors.secondary}
                style={styles.icon}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? colors.primary : colors.secondary },
                  isFocused && { fontWeight: '700' },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="splitwise" options={{ title: 'Splitwise' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Activity' }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan' }} />
      <Tabs.Screen name="goals" options={{ title: 'Goals' }} />
      <Tabs.Screen name="accounts" options={{ title: 'Accounts' }} />
    </Tabs>
  );
}


const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    tabBarContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surfaceContainerLowest,
      borderTopWidth: 0.5,
      borderTopColor: colors.outlineVariant,
      ...Platform.select({
        ios: {
          shadowColor: colors.onSurface,
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.04,
          shadowRadius: 24,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    tabBar: {
      flexDirection: 'row',
      height: 64, // Reduced base height, safe area added via paddingBottom
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingHorizontal: 8,
      position: 'relative',
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
    },
    icon: {
      marginBottom: 4,
    },
    tabLabel: {
      ...typography.labelMd,
      fontSize: 10,
    },
    fab: {
      position: 'absolute',
      right: 20, // Move to bottom right
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      ...Platform.select({
        ios: {
          shadowColor: colors.onSurface,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.15,
          shadowRadius: 24,
        },
        android: {
          elevation: 8,
        },
      }),
    },
  });
  return styles;
};
