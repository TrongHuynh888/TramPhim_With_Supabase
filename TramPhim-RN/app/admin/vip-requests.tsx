import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../components/admin/AdminHeader';
import { fetchVipRequests, processVipRequest, deleteVipRequest, VipRequest } from '../../services/admin/vipService';

export default function AdminVipRequestsScreen() {
    const [requests, setRequests] = useState<VipRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [filter, setFilter] = useState('pending');

    // VIP Modal state
    const [vipModalVisible, setVipModalVisible] = useState(false);
    const [vipDaysInput, setVipDaysInput] = useState('30');
    const [selectedRequest, setSelectedRequest] = useState<VipRequest | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await fetchVipRequests(page, 20, filter);
            setRequests(result.requests);
        } catch (error) {
            console.error(error);
            Alert.alert("Lỗi", "Không thể tải yêu cầu VIP.");
        } finally {
            setLoading(false);
        }
    }, [page, filter]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleProcess = (req: VipRequest, action: 'approve' | 'reject') => {
        if (action === 'approve') {
            setSelectedRequest(req);
            setVipDaysInput('30');
            setVipModalVisible(true);
        } else {
            Alert.alert('Từ chối VIP', `Xác nhận từ chối cho ${req.user_id}?`, [
                { text: 'Hủy', style: 'cancel' },
                { text: 'Đồng ý', onPress: async () => {
                    await processVipRequest(req.id, req.user_id, 'reject');
                    loadData();
                }}
            ]);
        }
    };

    const handleConfirmApprove = async () => {
        if (!selectedRequest) return;
        const days = parseInt(vipDaysInput);
        if (isNaN(days) || (days < 1 && days !== -1)) {
            Alert.alert('Lỗi', 'Số ngày không hợp lệ. Hãy nhập số ngày > 0 hoặc -1 (vĩnh viễn).');
            return;
        }
        setVipModalVisible(false);
        try {
            await processVipRequest(selectedRequest.id, selectedRequest.user_id, 'approve', days);
            Alert.alert('Thành công', 'Đã duyệt yêu cầu VIP!');
            loadData();
        } catch (e) {
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi duyệt VIP.');
        }
    };
    
    const handleDelete = (req: VipRequest) => {
        Alert.alert('Xóa yêu cầu', `Xóa yêu cầu của ${req.profiles?.email}?`, [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Xóa', style: 'destructive', onPress: async () => {
                await deleteVipRequest(req.id);
                loadData();
            }}
        ]);
    }

    const renderItem = ({ item }: { item: VipRequest }) => (
        <View style={styles.card}>
            <View style={styles.info}>
                <Text style={styles.email}>User: {item.user_id}</Text>
                <Text style={styles.detail}>Số tiền: {item.amount} CRO</Text>
                <Text style={styles.detail}>Mã GD: {item.transaction_id}</Text>
                <Text style={[styles.status, item.status === 'approved' ? styles.approved : item.status === 'rejected' ? styles.rejected : null]}>
                    Trạng thái: {item.status.toUpperCase()}
                </Text>
            </View>
            {item.status === 'pending' ? (
                <View style={styles.actions}>
                    <TouchableOpacity style={[styles.btn, styles.approveBtn]} onPress={() => handleProcess(item, 'approve')}>
                        <Ionicons name="checkmark" size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btn, styles.rejectBtn]} onPress={() => handleProcess(item, 'reject')}>
                        <Ionicons name="close" size={20} color="#fff" />
                    </TouchableOpacity>
                </View>
            ) : (
                <TouchableOpacity style={styles.btn} onPress={() => handleDelete(item)}>
                     <Ionicons name="trash" size={20} color="#ff4444" />
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <AdminHeader title="Yêu Cầu Nâng Cấp VIP" />
            <View style={styles.filters}>
                {['pending', 'approved', 'rejected', 'all'].map(f => (
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
            {loading ? <ActivityIndicator size="large" color="#ffd700" style={{marginTop: 20}}/> : 
            <FlatList
                data={requests}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
            />}

            {/* Modal Nhập Ngày VIP */}
            <Modal visible={vipModalVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Duyệt Yêu Cầu VIP</Text>
                        <Text style={styles.modalDesc}>
                            Nhập số ngày VIP để cấp. Nhập -1 nếu muốn cấp vĩnh viễn.
                        </Text>
                        
                        <TextInput 
                            style={styles.modalInput} 
                            value={vipDaysInput} 
                            onChangeText={setVipDaysInput} 
                            placeholder="Số ngày (VD: 30 hoặc -1)" 
                            placeholderTextColor="#555"
                            keyboardType="numeric"
                        />
                        
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setVipModalVisible(false)}>
                                <Text style={styles.cancelTxt}>Hủy</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleConfirmApprove}>
                                <Text style={styles.saveTxt}>Duyệt</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0f' },
    filters: { flexDirection: 'row', padding: 16, gap: 10 },
    filterBtn: { padding: 8, borderRadius: 20, backgroundColor: '#1a1a2e' },
    filterBtnActive: { backgroundColor: '#ffd700' },
    filterText: { color: '#888', fontSize: 12 },
    filterTextActive: { color: '#000', fontWeight: 'bold' },
    list: { paddingHorizontal: 16 },
    card: { flexDirection: 'row', backgroundColor: '#1a1a2e', padding: 16, borderRadius: 8, marginBottom: 10, alignItems: 'center' },
    info: { flex: 1 },
    email: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
    detail: { color: '#aaa', fontSize: 12 },
    status: { color: '#ffaa00', fontSize: 12, marginTop: 5, fontWeight: 'bold' },
    approved: { color: '#00ff88' },
    rejected: { color: '#ff4444' },
    actions: { flexDirection: 'row', gap: 10 },
    btn: { padding: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
    approveBtn: { backgroundColor: '#00ff88' },
    rejectBtn: { backgroundColor: '#ff4444' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#1a1a2e', padding: 20, borderRadius: 12 },
    modalTitle: { color: '#00ff88', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    modalDesc: { color: '#aaa', fontSize: 13, marginBottom: 15, lineHeight: 20 },
    modalInput: { backgroundColor: '#0a0a0f', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
    cancelBtn: { padding: 10, borderRadius: 8 },
    cancelTxt: { color: '#aaa', fontWeight: 'bold' },
    saveBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#00ff88', borderRadius: 8 },
    saveTxt: { color: '#000', fontWeight: 'bold' }
});
