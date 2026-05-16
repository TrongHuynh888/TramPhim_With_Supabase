import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeStore } from "../stores/useThemeStore";

interface Props {
  iconName: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  trailing?: React.ReactNode;
  danger?: boolean;
}

export default function AccountListItem({
  iconName,
  title,
  subtitle,
  onPress,
  trailing,
  danger,
}: Props) {
  const { fontSizeMultiplier, themeColors } = useThemeStore();
  const getFontSize = (base: number) => base * fontSizeMultiplier;
  const itemColor = danger ? '#e53935' : themeColors.textPrimary;

  return (
    <TouchableOpacity style={[styles.row, { borderBottomColor: themeColors.bgTertiary }]} onPress={onPress}>
      <View style={styles.left}>
        <Ionicons name={iconName as any} size={20} color={itemColor} />
        <View style={styles.textWrap}>
          <Text style={[styles.title, { fontSize: getFontSize(15), color: itemColor }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { fontSize: getFontSize(13), color: themeColors.textMuted }]}>{subtitle}</Text> : null}
        </View>
      </View>
      {trailing ?? <Ionicons name="chevron-forward" size={18} color={danger ? itemColor : themeColors.textMuted} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  left: { flexDirection: "row", alignItems: "center" },
  textWrap: { marginLeft: 12 },
  title: { fontSize: 15 },
  subtitle: { marginTop: 2 },
});
