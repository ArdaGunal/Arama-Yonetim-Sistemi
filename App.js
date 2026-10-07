/**
 * Arama Yönetim Sistemi - Entry Point
 * Ana giriş dosyası. React Navigation ile sayfa yönetimi.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as NavigationBar from 'expo-navigation-bar';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './src/screens/HomeScreen';
import NewProjectScreen from './src/screens/NewProjectScreen';
import EditFormScreen from './src/screens/EditFormScreen';
import SurveyScreen from './src/screens/SurveyScreen';
import ExportScreen from './src/screens/ExportScreen';
import BackupScreen from './src/screens/BackupScreen';
import AssignmentsScreen from './src/screens/AssignmentsScreen';
import AssignmentImportScreen from './src/screens/AssignmentImportScreen';
import ResultsImportScreen from './src/screens/ResultsImportScreen';
import IncomingFileScreen from './src/screens/IncomingFileScreen';
import DeveloperPanel from './src/screens/DeveloperPanel';
import { Colors } from './src/theme/colors';
import { addBreadcrumb, installGlobalErrorHandler, loadLastDiagnostic, reportError, subscribeToDiagnostics } from './src/utils/diagnostics';

const Stack = createNativeStackNavigator();

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { report: null };
  }

  static getDerivedStateFromError() {
    return { report: true };
  }

  componentDidCatch(error, info) {
    const report = reportError(error, 'Ekran oluşturulurken', true, info?.componentStack || '');
    this.setState({ report });
  }

  render() {
    if (this.state.report) {
      return <DeveloperPanel report={this.state.report === true ? null : this.state.report} onBack={this.props.onRecover} />;
    }
    return this.props.children;
  }
}

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
  const navigationRef = useRef(createNavigationContainerRef()).current;
  const pendingUri = useRef(null);
  const lastOpen = useRef({ uri: '', at: 0 });
  const [report, setReport] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [treeKey, setTreeKey] = useState(0);

  useEffect(() => {
    installGlobalErrorHandler();
    const unsubscribe = subscribeToDiagnostics((nextReport) => {
      if (nextReport?.fatal) {
        setReport(nextReport);
        setShowPanel(true);
      }
    });
    loadLastDiagnostic().then((result) => {
      if (result?.autoShow) {
        setReport(result.report);
        setShowPanel(true);
      }
    });
    if (Platform.OS === 'android') {
      NavigationBar.setButtonStyleAsync('light').catch(() => {});
    }
    const incoming = Linking.addEventListener('url', ({ url }) => openIncoming(url));
    return () => { unsubscribe(); incoming.remove(); };
  }, []);

  const openIncoming = (uri) => {
    if (Platform.OS !== 'android' || !/^(content|file):\/\//.test(uri || '')) return;
    if (lastOpen.current.uri === uri && Date.now() - lastOpen.current.at < 1500) return;
    lastOpen.current = { uri, at: Date.now() };
    if (!navigationRef.isReady()) { pendingUri.current = uri; return; }
    navigationRef.navigate('IncomingFile', { uri, requestId: Date.now() });
  };

  const recover = () => {
    setShowPanel(false);
    setTreeKey((value) => value + 1);
  };

  return (
    <SafeAreaProvider>
      {showPanel ? (
        <DeveloperPanel report={report} onBack={recover} />
      ) : (
      <AppErrorBoundary key={treeKey} onRecover={recover}>
      <NavigationContainer ref={navigationRef} onReady={() => {
        addBreadcrumb('Ana ekran açıldı');
        if (pendingUri.current) { const uri = pendingUri.current; pendingUri.current = null;
          navigationRef.navigate('IncomingFile', { uri, requestId: Date.now() }); }
        Linking.getInitialURL().then(openIncoming).catch(() => {});
      }} onStateChange={(state) => {
        const route = state?.routes?.[state.index];
        if (route?.name) addBreadcrumb(`Ekran: ${route.name}`);
      }}>
        <StatusBar style="light" backgroundColor={Colors.bg} />
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen
          name="Home"
          children={(props) => <HomeScreen {...props} onDeveloperPanel={() => {
            setReport(null);
            setShowPanel(true);
          }} />}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="NewProject"
          component={NewProjectScreen}
          options={{ title: 'Yeni Proje Oluştur' }}
        />
        <Stack.Screen name="EditForm" component={EditFormScreen} options={{ title: 'Sorular ve Şablon' }} />
        <Stack.Screen name="Assignments" component={AssignmentsScreen} options={{ title: 'Görevleri Dağıt' }} />
        <Stack.Screen name="AssignmentImport" component={AssignmentImportScreen} options={{ title: 'Görev Dosyası Aç' }} />
        <Stack.Screen name="ResultsImport" component={ResultsImportScreen} options={{ title: 'Sonuçları Topla' }} />
        <Stack.Screen name="IncomingFile" component={IncomingFileScreen} options={{ title: 'Gelen Dosya' }} />
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
        <Stack.Screen
          name="Backup"
          component={BackupScreen}
          options={{ title: 'Etkinlik Yedekleri' }}
        />
      </Stack.Navigator>
      </NavigationContainer>
      </AppErrorBoundary>
      )}
    </SafeAreaProvider>
  );
}
