import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../components/admin/AdminHeader';
import { fetchComments, deleteComment, Comment } from '../../services/admin/commentService';

export default function AdminCommentsScreen() {
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        setPage(1);
        try {
            const res = await fetchComments(1, 50);
            setComments(res.comments);
            setHasMore(res.hasMore);
        } catch (error: any) {
            Alert.alert("Lỗi", "Không thể tải bình luận: " + (error.message || ''));
        } finally {
            setLoading(false);
        }
    }, []);

    const loadMore = async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        const nextPage = page + 1;
        try {
            const res = await fetchComments(nextPage, 50);
            setComments(prev => [...prev, ...res.comments]);
            setHasMore(res.hasMore);
            setPage(nextPage);
        } catch (error: any) {
            Alert.alert("Lỗi", "Không thể tải thêm.");
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => { loadData(); }, [loadData]);

    const handleDelete = (id: string) => {
        Alert.alert('Xóa bình luận', 'Bạn có chắc chắn muốn xóa bình luận này?', [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Xóa', style: 'destructive', onPress: async () => {
                try {
                    await deleteComment(id);
                    setComments(prev => prev.filter(c => c.id !== id));
                } catch (e) {
                    Alert.alert('Lỗi', 'Không thể xóa bình luận.');
                }
            }}
        ]);
    };

    const renderItem = ({ item }: { item: Comment }) => {
        const userName = item.profiles?.display_name || 'Khách';
        const userAvatar = item.profiles?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}`;
        const movieTitle = item.movies?.title || 'Phim không xác định';
        const date = new Date(item.created_at).toLocaleString('vi-VN');

        return (
            <View style={styles.card}>
                <Image source={{ uri: userAvatar }} style={styles.avatarImg} />
                <View style={styles.info}>
                    <View style={styles.headerRow}>
                        <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
                        <Text style={styles.date}>{date}</Text>
                    </View>
                    <Text style={styles.movieTitle} numberOfLines={1}>🎬 {movieTitle}</Text>
                    <Text style={styles.content}>{item.content}</Text>
                </View>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
                    <Ionicons name="trash" size={20} color="#ff4444" />
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <AdminHeader title="Quản lý Bình Luận" />

            {loading ? <ActivityIndicator size="large" color="#4db8ff" style={{marginTop: 20}}/> : 
            <FlatList
                data={comments}
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
                            <Text style={styles.footerText}>Đã hiển thị tất cả {comments.length} bình luận</Text>
                        )}
                    </View>
                )}
            />}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0f' },
    list: { padding: 16 },
    card: { flexDirection: 'row', backgroundColor: '#1a1a2e', padding: 14, borderRadius: 8, marginBottom: 12 },
    avatarImg: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#333', marginRight: 12 },
    info: { flex: 1, marginRight: 10 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    userName: { color: '#fff', fontSize: 15, fontWeight: 'bold', flex: 1 },
    date: { color: '#888', fontSize: 11 },
    movieTitle: { color: '#4db8ff', fontSize: 12, marginBottom: 6 },
    content: { color: '#ddd', fontSize: 14, lineHeight: 20 },
    deleteBtn: { padding: 8, justifyContent: 'center', alignItems: 'center' },
    footer: { alignItems: 'center', paddingVertical: 12 },
    loadMoreBtn: { paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#1a1a2e', borderRadius: 8, borderWidth: 1, borderColor: '#4db8ff' },
    loadMoreText: { color: '#4db8ff', fontWeight: 'bold', fontSize: 14 },
    footerText: { color: '#888', fontSize: 13 }
});
