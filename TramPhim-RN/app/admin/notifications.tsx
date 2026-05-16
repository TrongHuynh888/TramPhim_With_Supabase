import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../components/admin/AdminHeader';
import { fetchNotifications, createNotification, deleteNotification, Notification } from '../../services/admin/notificationService';

export default function AdminNotificationsScreen() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // Modal state
    const [modalVisible, setModalVisible] = useState(false);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [type, setType] = useState('info');
    const [targetUser, setTargetUser] = useState('all');
    const [link, setLink] = useState('');
    const [saving, setSaving] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        setPage(1);
        try {
            const res = await fetchNotifications(1, 50);
            setNotifications(res.notifications);
            setHasMore(res.hasMore);
        } catch (error: any) {
            Alert.alert("Lỗi", "Không thể tải thông báo: " + (error.message || ''));
        } finally {
            setLoading(false);
        }
    }, []);

    const loadMore = async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        const nextPage = page + 1;
        try {
            const res = await fetchNotifications(nextPage, 50);
            setNotifications(prev => [...prev, ...res.notifications]);
            setHasMore(res.hasMore);
            setPage(nextPage);
        } catch (error: any) {
            Alert.alert("Lỗi", "Không thể tải thêm.");
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => { loadData(); }, [loadData]);

    const handleCreate = async () => {
        if (!title.trim() || !message.trim()) {
            return Alert.alert('Lỗi', 'Vui lòng nhập đủ Tiêu đề và Nội dung.');
        }
        setSaving(true);
        try {
            await createNotification(title.trim(), message.trim(), type, targetUser.trim() || 'all', link.trim());
            setModalVisible(false);
            setTitle('');
            setMessage('');
            setLink('');
            loadData();
        } catch (error: any) {
            Alert.alert('Lỗi', 'Không thể tạo thông báo: ' + (error.message || ''));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id: string) => {
        Alert.alert('Xóa thông báo', 'Bạn có chắc chắn muốn xóa thông báo này?', [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Xóa', style: 'destructive', onPress: async () => {
                try {
                    await deleteNotification(id);
                    setNotifications(prev => prev.filter(n => n.id !== id));
                } catch (e) {
                    Alert.alert('Lỗi', 'Không thể xóa thông báo.');
                }
            }}
        ]);
    };

    const getTypeColor = (t: string) => {
        switch (t) {
            case 'success': return '#00ff88';
            case 'warning': return '#ffaa00';
            case 'error': return '#ff4444';
            default: return '#4db8ff';
        }
    };

    const renderItem = ({ item }: { item: Notification }) => {
        const date = new Date(item.created_at).toLocaleString('vi-VN');
        const color = getTypeColor(item.type || 'info');

        return (
            <View style={styles.card}>
                <View style={[styles.typeIndicator, { backgroundColor: color }]} />
                <View style={styles.info}>
                    <View style={styles.headerRow}>
                        <Text style={[styles.title, { color }]} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.date}>{date}</Text>
                    </View>
                    <Text style={styles.message}>{item.message}</Text>
                    <View style={styles.metaRow}>
                        <Text style={styles.metaText}>Đến: {item.target_user === 'all' ? 'Tất cả' : item.target_user}</Text>
                        {item.link ? <Text style={styles.metaLink} numberOfLines={1}>🔗 {item.link}</Text> : null}
                    </View>
                </View>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
                    <Ionicons name="trash" size={20} color="#ff4444" />
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <AdminHeader title="Quản lý Thông Báo" />

            <View style={styles.headerBar}>
                <Text style={styles.subTitle}>Danh sách thông báo</Text>
                <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
                    <Ionicons name="add" size={24} color="#000" />
                </TouchableOpacity>
            </View>

            {loading ? <ActivityIndicator size="large" color="#4db8ff" style={{marginTop: 20}}/> : 
            <FlatList
                data={notifications}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
                onEndReached={loadMore}
                onEndReachedThreshold={0.3}
                ListFooterComponent={() => (
                    <View style={styles.footer}>
                        {loadingMore ? (
                            <ActivityIndicator size="small" color="#4db8ff" style={{ marginVertical: 10 }} />
                        ) : hasMore ? (
                            <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore}>
                                <Text style={styles.loadMoreText}>Tải thêm...</Text>
                            </TouchableOpacity>
                        ) : (
                            <Text style={styles.footerText}>Đã hiển thị tất cả {notifications.length} thông báo</Text>
                        )}
                    </View>
                )}
            />}

            {/* Modal Form */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.modalTitle}>Tạo Thông Báo Mới</Text>
                            
                            <Text style={styles.inputLabel}>Tiêu đề (*)</Text>
                            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Nhập tiêu đề" placeholderTextColor="#666" />
                            
                            <Text style={styles.inputLabel}>Nội dung (*)</Text>
                            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={message} onChangeText={setMessage} placeholder="Nhập nội dung thông báo" placeholderTextColor="#666" multiline />
                            
                            <Text style={styles.inputLabel}>Loại</Text>
                            <View style={styles.typeSelector}>
                                {['info', 'success', 'warning', 'error'].map(t => (
                                    <TouchableOpacity 
                                        key={t}
                                        style={[styles.typeOption, type === t && { borderColor: getTypeColor(t), backgroundColor: getTypeColor(t) + '20' }]}
                                        onPress={() => setType(t)}>
                                        <Text style={[styles.typeOptionText, type === t && { color: getTypeColor(t), fontWeight: 'bold' }]}>
                                            {t.toUpperCase()}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.inputLabel}>Gửi đến (User ID hoặc 'all')</Text>
                            <TextInput style={styles.input} value={targetUser} onChangeText={setTargetUser} placeholder="all" placeholderTextColor="#666" />
                            
                            <Text style={styles.inputLabel}>Liên kết đính kèm (URL - Tuỳ chọn)</Text>
                            <TextInput style={styles.input} value={link} onChangeText={setLink} placeholder="https://..." placeholderTextColor="#666" />
                            
                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                                    <Text style={styles.cancelTxt}>Hủy</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.saveBtn} onPress={handleCreate} disabled={saving}>
                                    {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveTxt}>Gửi Thông Báo</Text>}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0f' },
    headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    subTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    addBtn: { width: 40, height: 40, backgroundColor: '#00ff88', borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 16 },
    card: { flexDirection: 'row', backgroundColor: '#1a1a2e', paddingRight: 14, borderRadius: 8, marginBottom: 12, overflow: 'hidden' },
    typeIndicator: { width: 6, height: '100%' },
    info: { flex: 1, padding: 12 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    title: { fontSize: 15, fontWeight: 'bold', flex: 1, marginRight: 10 },
    date: { color: '#888', fontSize: 11 },
    message: { color: '#ddd', fontSize: 14, lineHeight: 20, marginBottom: 8 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
    metaText: { color: '#aaa', fontSize: 12, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    metaLink: { color: '#4db8ff', fontSize: 12, flex: 1 },
    deleteBtn: { padding: 12, justifyContent: 'center', alignItems: 'center' },
    footer: { alignItems: 'center', paddingVertical: 12 },
    loadMoreBtn: { paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#1a1a2e', borderRadius: 8, borderWidth: 1, borderColor: '#4db8ff' },
    loadMoreText: { color: '#4db8ff', fontWeight: 'bold', fontSize: 14 },
    footerText: { color: '#888', fontSize: 13 },
    
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#1a1a2e', padding: 20, borderRadius: 12, maxHeight: '90%' },
    modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
    inputLabel: { color: '#aaa', fontSize: 13, marginBottom: 6, marginTop: 4 },
    input: { backgroundColor: '#0a0a0f', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
    typeSelector: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
    typeOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
    typeOptionText: { color: '#888', fontSize: 12 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
    cancelBtn: { padding: 10, borderRadius: 8 },
    cancelTxt: { color: '#aaa', fontWeight: 'bold' },
    saveBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#00ff88', borderRadius: 8 },
    saveTxt: { color: '#000', fontWeight: 'bold' }
});
