import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useThemeStore } from "../stores/useThemeStore";

interface Props {
  balance: number;
  onTopUp: () => void;
}

export default function WalletCard({ balance, onTopUp }: Props) {
  const { themeColors, primaryColor, fontSizeMultiplier } = useThemeStore();
  const getFontSize = (base: number) => base * fontSizeMultiplier;
  return (
    <View style={[styles.card, { backgroundColor: themeColors.bgTertiary }]}>
      <Text style={[styles.label, { color: themeColors.textSecondary, fontSize: getFontSize(13) }]}>Ví Ro</Text>
      <Text style={[styles.amount, { color: themeColors.textPrimary, fontSize: getFontSize(18) }]}>{balance ?? 0}</Text>
      <TouchableOpacity style={[styles.topUp, { backgroundColor: themeColors.textPrimary }]} onPress={onTopUp}>
        <Text style={[styles.topUpText, { color: themeColors.bgPrimary, fontSize: getFontSize(12) }]}>+ Nạp Ro-Coin</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    marginLeft: 8,
    alignItems: "center",
  },
  label: { fontSize: 13 },
  amount: { fontWeight: "700", fontSize: 18, marginVertical: 4 },
  topUp: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  topUpText: { fontWeight: "700", fontSize: 12 },
});
