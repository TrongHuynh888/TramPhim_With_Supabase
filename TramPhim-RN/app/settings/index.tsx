import React from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Href, useRouter, Stack } from "expo-router";
import AccountListItem from "../../components/AccountListItem";
import { useThemeStore } from "../../stores/useThemeStore";

export default function SettingsMenuScreen() {
  const router = useRouter();
  const { primaryColor, fontSizeMultiplier, themeColors, themeMode } = useThemeStore();
  const getFontSize = (baseSize: number) => baseSize * fontSizeMultiplier;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bgPrimary }]}>
        <View style={[styles.header, { 
          backgroundColor: themeMode === 'light' 
            ? 'rgba(233, 235, 238, 0.95)' 
            : 'rgba(10, 10, 15, 0.95)',
          borderBottomColor: themeColors.bgTertiary,
        }]}>
        <TouchableOpacity
          style={[styles.backBtn, { 
            backgroundColor: themeMode === 'light' 
              ? 'rgba(0,0,0,0.05)' 
              : 'rgba(255,255,255,0.05)' 
          }]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={24} color={themeColors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: getFontSize(18), color: themeColors.textPrimary }]}>
          Cài đặt
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.list}>
          <AccountListItem
            iconName="color-palette-outline"
            title="Cài đặt giao diện"
            onPress={() => router.push("/settings/theme" as Href)}
          />
          <AccountListItem
            iconName="notifications-outline"
            title="Cài đặt thông báo"
            onPress={() => router.push("/settings/notifications" as Href)}
          />
          <AccountListItem
            iconName="play-circle-outline"
            title="Trình phát video"
            onPress={() => router.push("/settings/player" as Href)}
          />
          <AccountListItem
            iconName="hardware-chip-outline"
            title="Lịch sử thiết bị"
            onPress={() => router.push("/settings/devices" as Href)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontWeight: "700",
    marginLeft: 12,
  },
  content: {
    paddingTop: 12,
  },
  list: {
    paddingHorizontal: 16,
  },
});
