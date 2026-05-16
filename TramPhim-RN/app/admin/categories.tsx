import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../components/admin/AdminHeader';
import { fetchCategories, createCategory, updateCategory, deleteCategory, Category } from '../../services/admin/categoryService';

export default function AdminCategoriesScreen() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modal state
    const [modalVisible, setModalVisible] = useState(false);
    const [editingCat, setEditingCat] = useState<Category | null>(null);
    const [catName, setCatName] = useState('');
    const [catDesc, setCatDesc] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await fetchCategories();
            setCategories(result);
        } catch (error) {
            console.error(error);
            Alert.alert("Lỗi", "Không thể tải danh sách thể loại.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const openModal = (cat: Category | null = null) => {
        setEditingCat(cat);
        setCatName(cat ? cat.name : '');
        setCatDesc(cat?.description || '');
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (!catName.trim()) {
            Alert.alert('Lỗi', 'Vui lòng nhập tên thể loại');
            return;
        }
        
        try {
            if (editingCat) {
                await updateCategory(editingCat.id, catName.trim(), catDesc.trim());
            } else {
                await createCategory(catName.trim(), catDesc.trim());
            }
            setModalVisible(false);
            loadData();
        } catch (e) {
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi lưu thể loại.');
        }
    };

    const handleDelete = (cat: Category) => {
        Alert.alert('Xóa thể loại', `Xóa "${cat.name}"?`, [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Xóa', style: 'destructive', onPress: async () => {
                try {
                    await deleteCategory(cat.id);
                    loadData();
                } catch (e) {
                    Alert.alert('Lỗi', 'Không thể xóa thể loại.');
                }
            }}
        ]);
    };

    const renderItem = ({ item }: { item: Category }) => (
        <View style={styles.card}>
            <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
            </View>
            <View style={styles.actions}>
                <TouchableOpacity style={styles.btn} onPress={() => openModal(item)}>
                    <Ionicons name="create-outline" size={20} color="#4db8ff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={() => handleDelete(item)}>
                    <Ionicons name="trash-outline" size={20} color="#ff4444" />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <AdminHeader 
                title="Quản Lý Thể Loại" 
                rightActions={
                    <TouchableOpacity style={styles.addBtn} onPress={() => openModal()}>
                        <Ionicons name="add" size={20} color="#fff" />
                    </TouchableOpacity>
                }
            />
            
            {loading ? <ActivityIndicator size="large" color="#da77f2" style={{marginTop: 20}}/> : 
            <FlatList
                data={categories}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
            />}

            {/* Modal Form */}
            <Modal visible={modalVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{editingCat ? 'Sửa thể loại' : 'Thêm thể loại'}</Text>
                        
                        <Text style={styles.label}>Tên thể loại *</Text>
                        <TextInput 
                            style={styles.input} 
                            value={catName} 
                            onChangeText={setCatName} 
                            placeholder="VD: Hành động" 
                            placeholderTextColor="#555"
                        />
                        
                        <Text style={styles.label}>Mô tả</Text>
                        <TextInput 
                            style={styles.input} 
                            value={catDesc} 
                            onChangeText={setCatDesc} 
                            placeholder="Mô tả thể loại..." 
                            placeholderTextColor="#555"
                        />
                        
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                                <Text style={styles.cancelTxt}>Hủy</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                                <Text style={styles.saveTxt}>Lưu</Text>
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
    addBtn: { padding: 8, backgroundColor: 'rgba(218,119,242,0.2)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(218,119,242,0.4)' },
    list: { padding: 16 },
    card: { flexDirection: 'row', backgroundColor: '#1a1a2e', padding: 16, borderRadius: 8, marginBottom: 10, alignItems: 'center' },
    info: { flex: 1 },
    name: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    desc: { color: '#aaa', fontSize: 12, marginTop: 4 },
    actions: { flexDirection: 'row', gap: 10 },
    btn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8 },
    
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#1a1a2e', padding: 20, borderRadius: 12 },
    modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
    label: { color: '#aaa', fontSize: 12, marginBottom: 5 },
    input: { backgroundColor: '#0a0a0f', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
    cancelBtn: { padding: 10, borderRadius: 8 },
    cancelTxt: { color: '#aaa', fontWeight: 'bold' },
    saveBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#da77f2', borderRadius: 8 },
    saveTxt: { color: '#fff', fontWeight: 'bold' }
});
