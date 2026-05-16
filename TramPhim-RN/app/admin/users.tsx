import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { SafeAreaView, View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, Modal, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../components/admin/AdminHeader';
import { fetchUsers, updateUserRole, toggleVipStatus, banUser, deleteUser, UserProfile } from '../../services/admin/userService';

export default function AdminUsersScreen() {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('');

    // VIP Modal state
    const [vipModalVisible, setVipModalVisible] = useState(false);
    const [vipDaysInput, setVipDaysInput] = useState('30');
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    // Realtime timer cho VIP status
    const [currentTime, setCurrentTime] = useState(Date.now());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const getVipStatusText = (user: UserProfile) => {
        if (!user.is_vip) return null;
        if (!user.vip_expires_at) return "Vĩnh viễn";
        
        const expiryTime = new Date(user.vip_expires_at).getTime();
        const diffTime = expiryTime - currentTime;
        if (diffTime <= 0) return "Hết hạn";
        
        const d = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const h = Math.floor((diffTime / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diffTime / 1000 / 60) % 60);
        const s = Math.floor((diffTime / 1000) % 60);
        
        return `${d}d ${h}h ${m}m ${s}s`;
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await fetchUsers(page, 20, search, filter);
            setUsers(result.users);
            setTotalPages(result.totalPages);
        } catch (error) {
            console.error(error);
            Alert.alert("Lỗi", "Không thể tải danh sách người dùng.");
        } finally {
            setLoading(false);
        }
    }, [page, search, filter]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleRoleChange = async (user: UserProfile) => {
        const newRole = user.role === 'admin' ? 'user' : 'admin';
        Alert.alert('Đổi quyền', `Đổi quyền của ${user.email} thành ${newRole}?`, [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Đồng ý', onPress: async () => {
                await updateUserRole(user.id, newRole);
                loadData();
            }}
        ]);
    };

    const handleVipChange = async (user: UserProfile) => {
        if (!user.is_vip) {
            setSelectedUser(user);
            setVipDaysInput('30');
            setVipModalVisible(true);
        } else {
            Alert.alert('Thu hồi VIP', `Thu hồi VIP của ${user.email}?`, [
                { text: 'Hủy', style: 'cancel' },
                { text: 'Đồng ý', onPress: async () => {
                    await toggleVipStatus(user.id, false);
                    loadData();
                }}
            ]);
        }
    };

    const handleConfirmVip = async () => {
        if (!selectedUser) return;
        const days = parseInt(vipDaysInput);
        if (isNaN(days) || (days < 1 && days !== -1)) {
            Alert.alert('Lỗi', 'Số ngày không hợp lệ. Hãy nhập số ngày > 0 hoặc -1 (vĩnh viễn).');
            return;
        }
        setVipModalVisible(false);
        try {
            await toggleVipStatus(selectedUser.id, true, days);
            Alert.alert('Thành công', 'Đã cấp VIP!');
            loadData();
        } catch (e) {
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi cấp VIP.');
        }
    };
    
    const handleBanChange = async (user: UserProfile) => {
        const newBanStatus = !user.banned;
        Alert.alert(newBanStatus ? 'Ban User' : 'Unban User', `Xác nhận hành động cho ${user.email}?`, [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Đồng ý', style: 'destructive', onPress: async () => {
                await banUser(user.id, newBanStatus);
                loadData();
            }}
        ]);
    };

    const handleDeleteUser = async (user: UserProfile) => {
        Alert.alert('Xóa tài khoản', `Bạn có chắc chắn muốn xóa tài khoản ${user.email}?`, [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Xóa', style: 'destructive', onPress: async () => {
                try {
                    await deleteUser(user.id);
                    Alert.alert('Thành công', 'Đã xóa tài khoản.');
                    loadData();
                } catch (error) {
                    Alert.alert('Lỗi', 'Không thể xóa tài khoản này.');
                }
            }}
        ]);
    };

    const renderItem = ({ item }: { item: UserProfile }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Image 
                    source={{ uri: item.avatar || item.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.display_name || item.full_name || item.email || 'U')}&background=random` }} 
                    style={styles.avatar} 
                />
                <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>{item.display_name || item.full_name || 'No Name'}</Text>
                    <Text style={styles.email}>{item.email}</Text>
                    <Text style={styles.date}>Tạo: {new Date(item.created_at).toLocaleDateString('vi-VN')}</Text>
                    <View style={styles.badges}>
                        {item.role === 'admin' ? 
                            <View style={[styles.badge, styles.adminBadge]}><Text style={styles.badgeText}>Admin</Text></View> :
                            <View style={[styles.badge, styles.memberBadge]}><Text style={styles.badgeText}>Member</Text></View>
                        }
                        {item.is_vip && <View style={[styles.badge, styles.vipBadge]}><Text style={styles.badgeText}>VIP • {getVipStatusText(item)}</Text></View>}
                        {item.banned && <View style={[styles.badge, styles.bannedBadge]}><Text style={styles.badgeText}>Banned</Text></View>}
                    </View>
                </View>
            </View>
            <View style={styles.actions}>
                <TouchableOpacity style={styles.btn} onPress={() => handleRoleChange(item)}>
                    <Ionicons name="shield-outline" size={20} color="#4db8ff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={() => handleVipChange(item)}>
                    <Ionicons name="star-outline" size={20} color="#ffd700" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={() => handleBanChange(item)}>
                    <Ionicons name="ban-outline" size={20} color="#ffaa00" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={() => handleDeleteUser(item)}>
                    <Ionicons name="trash-outline" size={20} color="#ff4444" />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <AdminHeader title="Quản lý Người Dùng" />
            <View style={styles.searchBar}>
                <Ionicons name="search" size={20} color="#888" />
                <TextInput 
                    style={styles.searchInput} 
                    placeholder="Tìm email hoặc tên..." 
                    placeholderTextColor="#888"
                    value={search}
                    onChangeText={setSearch}
                    onSubmitEditing={() => setPage(1)}
                />
            </View>
            <View style={styles.filters}>
                {['', 'admin', 'vip', 'banned'].map(f => (
                    <TouchableOpacity 
                        key={f} 
                        style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
                        onPress={() => { setFilter(f); setPage(1); }}
                    >
                        <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                            {f === '' ? 'Tất cả' : f.toUpperCase()}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
            {loading ? <ActivityIndicator size="large" color="#4db8ff" style={{marginTop: 20}}/> : 
            <FlatList
                data={users}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
            />}

            {/* Modal Nhập Ngày VIP */}
            <Modal visible={vipModalVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Cấp VIP cho User</Text>
                        <Text style={styles.modalDesc}>
                            Nhập số ngày VIP. Nhập -1 nếu muốn cấp vĩnh viễn. Để trống hoặc hủy để từ chối.
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
                            <TouchableOpacity style={styles.saveBtn} onPress={handleConfirmVip}>
                                <Text style={styles.saveTxt}>Xác nhận</Text>
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
    searchBar: { flexDirection: 'row', backgroundColor: '#1a1a2e', margin: 16, padding: 10, borderRadius: 8, alignItems: 'center' },
    searchInput: { flex: 1, color: '#fff', marginLeft: 10 },
    filters: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 10 },
    filterBtn: { padding: 8, borderRadius: 20, backgroundColor: '#1a1a2e' },
    filterBtnActive: { backgroundColor: '#4db8ff' },
    filterText: { color: '#888', fontSize: 12 },
    filterTextActive: { color: '#fff' },
    list: { padding: 16 },
    card: { flexDirection: 'column', backgroundColor: '#1a1a2e', padding: 16, borderRadius: 8, marginBottom: 10 },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
    avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: '#333' },
    info: { flex: 1 },
    name: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    email: { color: '#aaa', fontSize: 13, marginBottom: 4 },
    date: { color: '#888', fontSize: 11, marginBottom: 8 },
    badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
    adminBadge: { backgroundColor: 'rgba(77,184,255,0.2)' },
    memberBadge: { backgroundColor: 'rgba(136,136,136,0.2)' },
    vipBadge: { backgroundColor: 'rgba(255,215,0,0.2)' },
    bannedBadge: { backgroundColor: 'rgba(255,68,68,0.2)' },
    badgeText: { color: '#fff', fontSize: 11 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 10, marginTop: 10 },
    btn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
    
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#1a1a2e', padding: 20, borderRadius: 12 },
    modalTitle: { color: '#ffd700', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    modalDesc: { color: '#aaa', fontSize: 13, marginBottom: 15, lineHeight: 20 },
    modalInput: { backgroundColor: '#0a0a0f', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
    cancelBtn: { padding: 10, borderRadius: 8 },
    cancelTxt: { color: '#aaa', fontWeight: 'bold' },
    saveBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#ffd700', borderRadius: 8 },
    saveTxt: { color: '#000', fontWeight: 'bold' }
});
