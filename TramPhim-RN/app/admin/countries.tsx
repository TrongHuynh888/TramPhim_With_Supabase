import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../components/admin/AdminHeader';
import { fetchCountries, createCountry, updateCountry, deleteCountry, Country } from '../../services/admin/countryService';

export default function AdminCountriesScreen() {
    const [countries, setCountries] = useState<Country[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modal state
    const [modalVisible, setModalVisible] = useState(false);
    const [editingCountry, setEditingCountry] = useState<Country | null>(null);
    const [name, setName] = useState('');
    const [code, setCode] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await fetchCountries();
            setCountries(result);
        } catch (error) {
            console.error(error);
            Alert.alert("Lỗi", "Không thể tải danh sách quốc gia.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const openModal = (country: Country | null = null) => {
        setEditingCountry(country);
        setName(country ? country.name : '');
        setCode(country?.code || '');
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Lỗi', 'Vui lòng nhập tên quốc gia');
            return;
        }
        
        try {
            if (editingCountry) {
                await updateCountry(editingCountry.id, name.trim(), code.trim());
            } else {
                await createCountry(name.trim(), code.trim());
            }
            setModalVisible(false);
            loadData();
        } catch (e) {
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi lưu quốc gia.');
        }
    };

    const handleDelete = (country: Country) => {
        Alert.alert('Xóa quốc gia', `Xóa "${country.name}"?`, [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Xóa', style: 'destructive', onPress: async () => {
                try {
                    await deleteCountry(country.id);
                    loadData();
                } catch (e) {
                    Alert.alert('Lỗi', 'Không thể xóa quốc gia.');
                }
            }}
        ]);
    };

    const renderItem = ({ item }: { item: Country }) => (
        <View style={styles.card}>
            <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                {item.code ? <Text style={styles.desc}>Mã: {item.code}</Text> : null}
            </View>
            <View style={styles.actions}>
                <TouchableOpacity style={styles.btn} onPress={() => openModal(item)}>
                    <Ionicons name="create-outline" size={20} color="#4ecdc4" />
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
                title="Quản Lý Quốc Gia" 
                rightActions={
                    <TouchableOpacity style={styles.addBtn} onPress={() => openModal()}>
                        <Ionicons name="add" size={20} color="#fff" />
                    </TouchableOpacity>
                }
            />
            
            {loading ? <ActivityIndicator size="large" color="#4ecdc4" style={{marginTop: 20}}/> : 
            <FlatList
                data={countries}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
            />}

            {/* Modal Form */}
            <Modal visible={modalVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{editingCountry ? 'Sửa quốc gia' : 'Thêm quốc gia'}</Text>
                        
                        <Text style={styles.label}>Tên quốc gia *</Text>
                        <TextInput 
                            style={styles.input} 
                            value={name} 
                            onChangeText={setName} 
                            placeholder="VD: Việt Nam" 
                            placeholderTextColor="#555"
                        />
                        
                        <Text style={styles.label}>Mã (Tùy chọn)</Text>
                        <TextInput 
                            style={styles.input} 
                            value={code} 
                            onChangeText={setCode} 
                            placeholder="VD: VN" 
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
    addBtn: { padding: 8, backgroundColor: 'rgba(78,205,196,0.2)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(78,205,196,0.4)' },
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
    saveBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#4ecdc4', borderRadius: 8 },
    saveTxt: { color: '#fff', fontWeight: 'bold' }
});
