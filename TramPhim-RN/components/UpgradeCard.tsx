import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useThemeStore } from "../stores/useThemeStore";

interface Props {
  membershipLevel?: string | null;
  onUpgrade: () => void;
}

export default function UpgradeCard({
  membershipLevel = "free",
  onUpgrade,
}: Props) {
  const { themeColors, primaryColor, fontSizeMultiplier } = useThemeStore();
  const getFontSize = (base: number) => base * fontSizeMultiplier;
  return (
    <View style={[styles.card, { backgroundColor: themeColors.bgTertiary }]}>
      <Text style={[styles.topText, { color: themeColors.textPrimary, fontSize: getFontSize(13) }]}>
        Bạn đang là{" "}
        {membershipLevel === "free" ? "thành viên miễn phí" : membershipLevel}
      </Text>
      <TouchableOpacity style={[styles.button, { backgroundColor: primaryColor }]} onPress={onUpgrade}>
        <Text style={[styles.buttonText, { color: themeColors.bgPrimary, fontSize: getFontSize(13) }]}>Nâng cấp</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    marginRight: 8,
  },
  topText: { marginBottom: 8, fontSize: 13 },
  button: {
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: { fontWeight: "700", fontSize: 13 },
});
