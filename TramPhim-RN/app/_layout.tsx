import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from 'react-native';
import { useAuthStore } from '../stores/useAuthStore';
import { useMovieStore } from '../stores/useMovieStore';
import { ALL_GOOGLE_FONTS } from '../theme/fonts';
import { FontProvider } from '../components/FontProvider';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
    ...ALL_GOOGLE_FONTS,
  });
  
  const [appReady, setAppReady] = useState(false);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // Khởi tạo Auth & Data khi bắt đầu load app (có bảo vệ lỗi)
  useEffect(() => {
    async function init() {
      try {
        await Promise.all([
          useAuthStore.getState().initializeAuth(),
          useMovieStore.getState().loadInitialData(),
        ]);
      } catch (e) {
        console.warn('⚠️ Lỗi khởi tạo dữ liệu, app vẫn hoạt động:', e);
      } finally {
        setAppReady(true); // Luôn cho app chạy dù có lỗi
      }
    }
    init();
  }, []);

  // Ẩn splash screen khi font và data đã sẵn sàng
  useEffect(() => {
    if (loaded && appReady) {
      SplashScreen.hideAsync();
    }
  }, [loaded, appReady]);

  if (!loaded || !appReady) {
    return null; // Giữ splash screen hiển thị
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <FontProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
          <Stack.Screen name="watching" options={{ headerBackTitle: '', title: 'Đang xem' }} />
          <Stack.Screen name="filter" options={{ headerShown: false }} />
          <Stack.Screen name="movie/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="movie/watch/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="profile/edit" options={{ headerShown: false }} />
          <Stack.Screen name="admin" options={{ headerShown: false }} />
          <Stack.Screen name="auth/login" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="auth/register" options={{ presentation: 'modal', headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </FontProvider>
  );
}
