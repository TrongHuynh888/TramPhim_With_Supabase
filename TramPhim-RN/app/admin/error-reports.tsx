import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../components/admin/AdminHeader';
import { fetchErrorReports, updateErrorReportStatus, deleteErrorReport, ErrorReport } from '../../services/admin/errorReportService';

export default function AdminErrorReportsScreen() {
    const [reports, setReports] = useState<ErrorReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [filter, setFilter] = useState('pending');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await fetchErrorReports(page, 20, filter);
            setReports(result.reports);
        } catch (error) {
            console.error(error);
            Alert.alert("Lỗi", "Không thể tải báo lỗi.");
        } finally {
            setLoading(false);
        }
    }, [page, filter]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleStatusUpdate = (report: ErrorReport, newStatus: 'resolved' | 'dismissed') => {
        Alert.alert('Cập nhật trạng thái', `Đánh dấu là ${newStatus}?`, [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Đồng ý', onPress: async () => {
                await updateErrorReportStatus(report.id, newStatus);
                loadData();
            }}
        ]);
    };
    
    const handleDelete = (report: ErrorReport) => {
        Alert.alert('Xóa báo cáo', 'Xóa báo cáo lỗi này?', [
             { text: 'Hủy', style: 'cancel' },
             { text: 'Xóa', style: 'destructive', onPress: async () => {
                 await deleteErrorReport(report.id);
                 loadData();
             }}
        ]);
    }

    const renderItem = ({ item }: { item: ErrorReport }) => (
        <View style={styles.card}>
            <View style={styles.header}>
                 <Text style={styles.movieTitle}>Phim ID: {item.movie_id}</Text>
                 <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.desc}>{item.description}</Text>
            <Text style={styles.user}>Báo bởi: {item.user_id}</Text>
            
            <View style={styles.actions}>
                {item.status === 'pending' && (
                    <>
                        <TouchableOpacity style={[styles.btn, styles.resolveBtn]} onPress={() => handleStatusUpdate(item, 'resolved')}>
                            <Text style={styles.btnText}>Đã xử lý</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btn, styles.dismissBtn]} onPress={() => handleStatusUpdate(item, 'dismissed')}>
                            <Text style={styles.btnText}>Bỏ qua</Text>
                        </TouchableOpacity>
                    </>
                )}
                <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(item)}>
                    <Ionicons name="trash-outline" size={20} color="#ff4444" />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <AdminHeader title="Báo Lỗi" />
            <View style={styles.filters}>
                {['pending', 'resolved', 'dismissed', 'all'].map(f => (
                    <TouchableOpacity 
                        key={f} 
                        style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
                        onPress={() => { setFilter(f); setPage(1); }}
                    >
                        <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                            {f.toUpperCase()}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
            {loading ? <ActivityIndicator size="large" color="#ff6b6b" style={{marginTop: 20}}/> : 
            <FlatList
                data={reports}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
            />}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0f' },
    filters: { flexDirection: 'row', padding: 16, gap: 10 },
    filterBtn: { padding: 8, borderRadius: 20, backgroundColor: '#1a1a2e' },
    filterBtnActive: { backgroundColor: '#ff6b6b' },
    filterText: { color: '#888', fontSize: 12 },
    filterTextActive: { color: '#fff', fontWeight: 'bold' },
    list: { paddingHorizontal: 16 },
    card: { backgroundColor: '#1a1a2e', padding: 16, borderRadius: 8, marginBottom: 10 },
    header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    movieTitle: { color: '#4db8ff', fontSize: 16, fontWeight: 'bold' },
    date: { color: '#888', fontSize: 12 },
    desc: { color: '#fff', fontSize: 14, marginBottom: 10 },
    user: { color: '#888', fontSize: 12, fontStyle: 'italic', marginBottom: 15 },
    actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
    btn: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
    resolveBtn: { backgroundColor: '#00ff88' },
    dismissBtn: { backgroundColor: '#555' },
    btnText: { color: '#000', fontWeight: 'bold', fontSize: 12 },
    iconBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, marginLeft: 10 }
});
