import React from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { Profile } from "../types/profile";
import { Ionicons } from "@expo/vector-icons";
import { useThemeStore } from "../stores/useThemeStore";

interface Props {
  profile: Profile | null;
  onEdit?: () => void;
}

export default function ProfileHeader({ profile, onEdit }: Props) {
  const { themeColors, themeMode, fontSizeMultiplier } = useThemeStore();
  const getFontSize = (base: number) => base * fontSizeMultiplier;
  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
    : "KH";
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: themeMode === 'light' ? 'rgba(0,0,0,0.1)' : '#222' }]}>
            <Text style={[styles.initials, { color: themeColors.textPrimary }]}>{initials}</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={[styles.name, { color: themeColors.textPrimary, fontSize: getFontSize(17) }]}>{profile?.full_name ?? "Khách"}</Text>
          <Text style={[styles.email, { color: themeColors.textMuted, fontSize: getFontSize(13) }]}>{profile?.email ?? ""}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={onEdit} style={styles.right}>
        <Ionicons name="chevron-forward" size={22} color={themeColors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  left: { flexDirection: "row", alignItems: "center" },
  right: { padding: 8 },
  avatar: { width: 56, height: 56, borderRadius: 28, marginRight: 12 },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  initials: { fontWeight: "700" },
  info: {},
  name: { fontSize: 17, fontWeight: "700" },
  email: { marginTop: 2, fontSize: 13 },
});
