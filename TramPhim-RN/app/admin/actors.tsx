import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, Modal, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../components/admin/AdminHeader';
import { fetchActors, createActor, updateActor, deleteActor, Actor } from '../../services/admin/actorService';

export default function AdminActorsScreen() {
    const [actors, setActors] = useState<Actor[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [jumpPage, setJumpPage] = useState('');

    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [avatar, setAvatar] = useState('');
    const [altNames, setAltNames] = useState('');
    const [role, setRole] = useState('actor');
    const [gender, setGender] = useState('');
    const [dob, setDob] = useState('');
    const [country, setCountry] = useState('');
    const [bio, setBio] = useState('');
    const [saving, setSaving] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchActors(searchQuery, page, 50);
            setActors(res.actors);
            setHasMore(res.hasMore);
            setTotalPages(res.totalPages);
            setTotalItems(res.totalItems);
        } catch (error: any) {
            Alert.alert("Lỗi", "Không thể tải diễn viên: " + (error.message || ''));
        } finally {
            setLoading(false);
        }
    }, [searchQuery, page]);

    useEffect(() => { loadData(); }, [loadData]);

    const openModal = (actor?: Actor) => {
        if (actor) {
            setEditingId(actor.id);
            setName(actor.name);
            setAvatar(actor.avatar || '');
            setAltNames(actor.alt_names || '');
            setRole(actor.role || 'actor');
            setGender(actor.gender || '');
            setDob(actor.dob || '');
            setCountry(actor.country || '');
            setBio(actor.bio || '');
        } else {
            setEditingId(null);
            setName('');
            setAvatar('');
            setAltNames('');
            setRole('actor');
            setGender('');
            setDob('');
            setCountry('');
            setBio('');
        }
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (!name.trim()) return Alert.alert("Lỗi", "Vui lòng nhập tên diễn viên.");
        setSaving(true);
        try {
            const actorData: any = {
                name: name.trim(),
                avatar: avatar.trim() || null,
                alt_names: altNames.trim() || null,
                role: role || 'actor',
                gender: gender.trim() || null,
                dob: dob.trim() || null,
                country: country.trim() || null,
                bio: bio.trim() || null,
                updated_at: new Date().toISOString(),
            };

            if (editingId) {
                const { error } = await (await import('../../lib/supabase')).supabase
                    .from('actors').update(actorData).eq('id', editingId);
                if (error) throw error;
            } else {
                actorData.created_at = new Date().toISOString();
                const { error } = await (await import('../../lib/supabase')).supabase
                    .from('actors').insert(actorData);
                if (error) throw error;
            }
            setModalVisible(false);
            loadData();
        } catch (error: any) {
            Alert.alert("Lỗi", "Không thể lưu: " + (error.message || ''));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id: string, actorName: string) => {
        Alert.alert('Xóa', `Xóa diễn viên "${actorName}"?`, [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Xóa', style: 'destructive', onPress: async () => {
                try {
                    await deleteActor(id);
                    loadData();
                } catch (e) {
                    Alert.alert('Lỗi', 'Không thể xóa diễn viên này.');
                }
            }}
        ]);
    };

    // Lấy tên vai trò hiển thị
    const getRoleName = (r?: string) => r === 'director' ? 'Đạo diễn' : 'Diễn viên';
    const getRoleColor = (r?: string) => r === 'director' ? '#9c27b0' : '#4dabf7';

    const renderItem = ({ item, index }: { item: Actor, index: number }) => {
        const stt = (page - 1) * 50 + index + 1;
        
        return (
            <View style={styles.card}>
                <View style={styles.sttBox}>
                    <Text style={styles.sttText}>{stt}</Text>
                </View>
                <Image 
                    source={{ uri: item.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=random` }} 
                    style={styles.avatarImg} 
                />
                <View style={styles.info}>
                    <Text style={styles.actorName} numberOfLines={1}>{item.name}</Text>
                    {item.alt_names ? <Text style={styles.altNames} numberOfLines={1}>{item.alt_names}</Text> : null}
                    <View style={styles.meta}>
                        <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) }]}>
                            <Text style={styles.roleBadgeText}>{getRoleName(item.role)}</Text>
                        </View>
                        {item.gender ? <Text style={styles.metaText}>{item.gender}</Text> : null}
                        {item.country ? <Text style={styles.metaText}>🌍 {item.country}</Text> : null}
                    </View>
                </View>
                <View style={styles.actions}>
                    <TouchableOpacity style={styles.btn} onPress={() => openModal(item)}>
                        <Ionicons name="pencil" size={20} color="#4db8ff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btn} onPress={() => handleDelete(item.id, item.name)}>
                        <Ionicons name="trash" size={20} color="#ff4444" />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView 
                style={{ flex: 1 }} 
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <AdminHeader title="Quản lý Diễn Viên" />
                <View style={styles.searchContainer}>
                    <View style={styles.searchBar}>
                        <Ionicons name="search" size={20} color="#888" />
                        <TextInput 
                            style={styles.searchInput} 
                            placeholder="Tìm diễn viên..." 
                            placeholderTextColor="#888"
                            value={search}
                            onChangeText={setSearch}
                            onSubmitEditing={() => setSearchQuery(search)}
                        />
                    </View>
                    <TouchableOpacity style={styles.addBtn} onPress={() => openModal()}>
                        <Ionicons name="add" size={24} color="#000" />
                    </TouchableOpacity>
                </View>

                {loading ? <ActivityIndicator size="large" color="#4db8ff" style={{marginTop: 20}}/> : 
                <FlatList
                    data={actors}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    ListFooterComponent={
                        <View style={styles.footerWrapper}>
                            {/* Hàng 1: Nút điều hướng */}
                            <View style={styles.footerContainer}>
                                <TouchableOpacity 
                                    style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]} 
                                    disabled={page === 1}
                                    onPress={() => setPage(p => Math.max(1, p - 1))}
                                >
                                    <Ionicons name="chevron-back" size={16} color={page === 1 ? '#555' : '#4db8ff'} />
                                    <Text style={[styles.pageBtnText, page === 1 && styles.pageTextDisabled]}>Trước</Text>
                                </TouchableOpacity>
                                
                                <View style={styles.pageInfoContainer}>
                                    <Text style={styles.pageInfo}>Trang {page} / {totalPages}</Text>
                                </View>
                                
                                <TouchableOpacity 
                                    style={[styles.pageBtn, (!hasMore && page >= totalPages) && styles.pageBtnDisabled]} 
                                    disabled={!hasMore && page >= totalPages}
                                    onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                                >
                                    <Text style={[styles.pageBtnText, (!hasMore && page >= totalPages) && styles.pageTextDisabled]}>Sau</Text>
                                    <Ionicons name="chevron-forward" size={16} color={(!hasMore && page >= totalPages) ? '#555' : '#4db8ff'} />
                                </TouchableOpacity>
                            </View>
                            
                            {/* Hàng 2: Jump page và Info */}
                            <View style={styles.jumpContainer}>
                                <Text style={styles.totalText}>Tổng: {totalItems} diễn viên</Text>
                                
                                <View style={styles.jumpBox}>
                                    <TextInput 
                                        style={styles.jumpInput} 
                                        keyboardType="number-pad" 
                                        placeholder="Số trang" 
                                        placeholderTextColor="#555"
                                        value={jumpPage}
                                        onChangeText={setJumpPage}
                                        onSubmitEditing={() => {
                                            const p = parseInt(jumpPage);
                                            if (!isNaN(p) && p >= 1 && p <= totalPages) {
                                                setPage(p);
                                                setJumpPage('');
                                            } else {
                                                Alert.alert("Lỗi", `Số trang không hợp lệ (1 - ${totalPages})`);
                                            }
                                        }}
                                    />
                                    <TouchableOpacity 
                                        style={styles.jumpBtn}
                                        onPress={() => {
                                            const p = parseInt(jumpPage);
                                            if (!isNaN(p) && p >= 1 && p <= totalPages) {
                                                setPage(p);
                                                setJumpPage('');
                                            } else {
                                                Alert.alert("Lỗi", `Số trang không hợp lệ (1 - ${totalPages})`);
                                            }
                                        }}
                                    >
                                        <Text style={styles.jumpBtnText}>Đi</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    }
                />}
            </KeyboardAvoidingView>

            {/* Modal Form */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.modalTitle}>{editingId ? 'Sửa Diễn Viên' : 'Thêm Diễn Viên'}</Text>
                            
                            <Text style={styles.inputLabel}>Tên (*)</Text>
                            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Tên diễn viên" placeholderTextColor="#666" />
                            
                            <Text style={styles.inputLabel}>Link Ảnh (Avatar URL)</Text>
                            <TextInput style={styles.input} value={avatar} onChangeText={setAvatar} placeholder="https://..." placeholderTextColor="#666" />
                            
                            <Text style={styles.inputLabel}>Tên khác</Text>
                            <TextInput style={styles.input} value={altNames} onChangeText={setAltNames} placeholder="Tên khác" placeholderTextColor="#666" />
                            
                            <Text style={styles.inputLabel}>Vai trò</Text>
                            <View style={styles.roleSelector}>
                                <TouchableOpacity 
                                    style={[styles.roleOption, role === 'actor' && styles.roleOptionActive]}
                                    onPress={() => setRole('actor')}>
                                    <Text style={[styles.roleOptionText, role === 'actor' && styles.roleOptionTextActive]}>🎭 Diễn viên</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[styles.roleOption, role === 'director' && styles.roleOptionActiveDirector]}
                                    onPress={() => setRole('director')}>
                                    <Text style={[styles.roleOptionText, role === 'director' && styles.roleOptionTextActive]}>🎬 Đạo diễn</Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.inputLabel}>Giới tính</Text>
                            <TextInput style={styles.input} value={gender} onChangeText={setGender} placeholder="Nam / Nữ / Khác" placeholderTextColor="#666" />
                            
                            <Text style={styles.inputLabel}>Ngày sinh</Text>
                            <TextInput style={styles.input} value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" placeholderTextColor="#666" />
                            
                            <Text style={styles.inputLabel}>Quốc gia</Text>
                            <TextInput style={styles.input} value={country} onChangeText={setCountry} placeholder="VD: Hàn Quốc, Mỹ, Nhật..." placeholderTextColor="#666" />
                            
                            <Text style={styles.inputLabel}>Tiểu sử</Text>
                            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={bio} onChangeText={setBio} placeholder="Tiểu sử ngắn..." placeholderTextColor="#666" multiline />
                            
                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                                    <Text style={styles.cancelTxt}>Hủy</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                                    {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveTxt}>Lưu</Text>}
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
    searchContainer: { flexDirection: 'row', padding: 16, gap: 10, alignItems: 'center' },
    searchBar: { flex: 1, flexDirection: 'row', backgroundColor: '#1a1a2e', padding: 10, borderRadius: 8, alignItems: 'center' },
    searchInput: { flex: 1, color: '#fff', marginLeft: 10 },
    addBtn: { width: 44, height: 44, backgroundColor: '#00ff88', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 16 },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a2e', padding: 10, borderRadius: 8, marginBottom: 10 },
    sttBox: { width: 25, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
    sttText: { color: '#888', fontWeight: 'bold', fontSize: 12 },
    avatarImg: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#333', marginRight: 10 },
    info: { flex: 1 },
    actorName: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
    altNames: { color: '#888', fontSize: 12, marginTop: 2 },
    meta: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' },
    roleBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    roleBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    metaText: { color: '#aaa', fontSize: 11 },
    actions: { flexDirection: 'row', gap: 6 },
    btn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8 },
    footerContainer: { 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        paddingVertical: 15,
        paddingHorizontal: 0,
        marginBottom: 0,
        gap: 8
    },
    pageBtn: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#1a1a2e', 
        paddingVertical: 8, 
        paddingHorizontal: 12, 
        borderRadius: 20, 
        borderWidth: 1, 
        borderColor: 'rgba(77,184,255,0.3)' 
    },
    pageBtnDisabled: { 
        borderColor: 'transparent', 
        backgroundColor: 'rgba(255,255,255,0.05)' 
    },
    pageBtnText: { 
        color: '#4db8ff', 
        fontWeight: 'bold', 
        fontSize: 12, 
        marginHorizontal: 2 
    },
    pageTextDisabled: { 
        color: '#555' 
    },
    pageInfoContainer: {
        backgroundColor: 'rgba(77,184,255,0.1)',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 15,
    },
    pageInfo: { 
        color: '#4db8ff', 
        fontSize: 12, 
        fontWeight: 'bold' 
    },
    footerWrapper: {
        marginBottom: 20
    },
    jumpContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 10,
        marginTop: 5
    },
    totalText: {
        color: '#888',
        fontSize: 12
    },
    jumpBox: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    jumpInput: {
        backgroundColor: '#0a0a0f',
        color: '#fff',
        borderWidth: 1,
        borderColor: '#333',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        width: 80,
        fontSize: 12,
        marginRight: 8,
        textAlign: 'center'
    },
    jumpBtn: {
        backgroundColor: 'rgba(77,184,255,0.2)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    jumpBtnText: {
        color: '#4db8ff',
        fontWeight: 'bold',
        fontSize: 12
    },
    
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#1a1a2e', padding: 20, borderRadius: 12, maxHeight: '90%' },
    modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
    inputLabel: { color: '#aaa', fontSize: 13, marginBottom: 6, marginTop: 4 },
    input: { backgroundColor: '#0a0a0f', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
    roleSelector: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    roleOption: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
    roleOptionActive: { borderColor: '#4dabf7', backgroundColor: 'rgba(77,171,247,0.15)' },
    roleOptionActiveDirector: { borderColor: '#9c27b0', backgroundColor: 'rgba(156,39,176,0.15)' },
    roleOptionText: { color: '#888', fontSize: 14 },
    roleOptionTextActive: { color: '#fff', fontWeight: 'bold' },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
    cancelBtn: { padding: 10, borderRadius: 8 },
    cancelTxt: { color: '#aaa', fontWeight: 'bold' },
    saveBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#00ff88', borderRadius: 8 },
    saveTxt: { color: '#000', fontWeight: 'bold' }
});
