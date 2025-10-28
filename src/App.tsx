import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AuthProvider} from './shared/context/AuthContext';
import {ErrorBoundary} from './shared/components/ErrorBoundary';

// Import screens
import AuthScreen from './features/auth/AuthScreen';
import HomeScreen from './features/home/HomeScreen';
import VisitList from './features/visits/VisitList';
import VisitDetail from './features/visits/VisitDetail';
import VisitRecorder from './features/visits/VisitRecorder';
import FolderList from './features/folders/FolderList';
import FolderDetail from './features/folders/FolderDetail';
import ActionItemsList from './features/action-items/ActionItemsList';
import HealthProfile from './features/profile/HealthProfile';
import CaregiversScreen from './features/profile/CaregiversScreen';

const Stack = createStackNavigator();

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer>
            <Stack.Navigator
              initialRouteName="Auth"
              screenOptions={{
                headerShown: false,
              }}>
              <Stack.Screen name="Auth" component={AuthScreen} />
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen name="Visits" component={VisitList} />
              <Stack.Screen name="VisitDetail" component={VisitDetail} />
              <Stack.Screen name="VisitRecorder" component={VisitRecorder} />
              <Stack.Screen name="Folders" component={FolderList} />
              <Stack.Screen name="FolderDetail" component={FolderDetail} />
              <Stack.Screen name="ActionItems" component={ActionItemsList} />
              <Stack.Screen name="Profile" component={HealthProfile} />
              <Stack.Screen name="Caregivers" component={CaregiversScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
};

export default App;
