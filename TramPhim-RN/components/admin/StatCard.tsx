/**
 * Card thống kê cho Dashboard Admin
 * Hiệu ứng gradient + icon đẹp, tương ứng dash-stat-card trên web
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  icon: string;
  label: string;
  value: string | number;
  color: string;
  gradientColors?: [string, string];
  suffix?: string;
}

export default function StatCard({
  icon,
  label,
  value,
  color,
  gradientColors,
  suffix = '',
}: Props) {
  const bg = gradientColors || [`${color}20`, `${color}08`];

  return (
    <View style={[styles.card, { borderColor: `${color}30` }]}>
      {/* Icon */}
      <View style={[styles.iconBox, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      {/* Nội dung */}
      <Text style={styles.value}>
        {typeof value === 'number' ? value.toLocaleString('vi-VN') : value}
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: 'rgba(26, 26, 46, 0.7)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  value: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  suffix: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
  },
  label: {
    color: '#888',
    fontSize: 12,
    marginTop: 3,
    fontWeight: '500',
  },
});
