/**
 * Arama Yönetim Sistemi - Entry Point
 * Ana giriş dosyası. React Navigation ile sayfa yönetimi.
 */
import React, { useEffect } from 'react';
import { StatusBar, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as NavigationBar from 'expo-navigation-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './src/screens/HomeScreen';
import NewProjectScreen from './src/screens/NewProjectScreen';
import SurveyScreen from './src/screens/SurveyScreen';
import ExportScreen from './src/screens/ExportScreen';
import { Colors } from './src/theme/colors';

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: {
    backgroundColor: Colors.bg,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTintColor: Colors.textPrimary,
  headerTitleStyle: {
    fontWeight: '600',
    fontSize: 17,
  },
  contentStyle: {
    backgroundColor: Colors.bg,
  },
  animation: 'slide_from_right',
};

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setBackgroundColorAsync(Colors.bg);
      NavigationBar.setButtonStyleAsync('light');
    }
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="NewProject"
          component={NewProjectScreen}
          options={{ title: 'Yeni Proje Oluştur' }}
        />
        <Stack.Screen
          name="Survey"
          component={SurveyScreen}
          options={({ route }) => ({
            title: route.params.projectName || 'Anket',
          })}
        />
        <Stack.Screen
          name="Export"
          component={ExportScreen}
          options={{ title: 'Dışa Aktar' }}
        />
      </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
