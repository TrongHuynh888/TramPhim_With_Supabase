import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from "react-native";
import { useThemeStore } from "../stores/useThemeStore";

interface Props {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  style?: StyleProp<ViewStyle>;
}

export default function PrimaryButton({
  label,
  onPress,
  variant = "primary",
  style,
}: Props) {
  const { primaryColor, themeColors, fontSizeMultiplier } = useThemeStore();
  const getFontSize = (base: number) => base * fontSizeMultiplier;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.button,
        variant === "primary" ? { backgroundColor: primaryColor } : styles.secondary,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          { fontSize: getFontSize(15) },
          variant === "primary" ? { color: "#fff" } : { color: themeColors.textPrimary },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 12,
  },
  primary: {
  },
  secondary: {
    backgroundColor: "rgba(100,100,100,0.3)",
  },
  label: {
    fontWeight: "700",
    fontSize: 15,
  },
  labelPrimary: {},
  labelSecondary: {},
});
