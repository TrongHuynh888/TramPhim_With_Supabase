import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { AppText } from './AppText';
import { Image } from 'expo-image';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useThemeStore } from '../stores/useThemeStore';
import { Colors } from '../theme/colors';

interface Profile {
  display_name: string;
  avatar: string;
}

interface Comment {
  id: string;
  user_id: string;
  movie_id: string;
  content: string;
  created_at: string;
  profiles?: Profile;
}

interface MovieCommentsProps {
  movieId: string;
}

export function MovieComments({ movieId }: MovieCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { user } = useAuthStore();
  const { themeColors, primaryColor } = useThemeStore();

  useEffect(() => {
    fetchComments();
  }, [movieId]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('comments')
        .select(`
          id, user_id, movie_id, content, created_at,
          profiles (display_name, avatar)
        `)
        .eq('movie_id', movieId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setComments(data as unknown as Comment[]);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePostComment = async () => {
    if (!user) {
      Alert.alert('Yêu cầu đăng nhập', 'Bạn cần đăng nhập để bình luận.');
      return;
    }
    if (!inputText.trim()) return;

    try {
      setSubmitting(true);
      const newComment = {
        user_id: user.id,
        movie_id: movieId,
        content: inputText.trim(),
      };

      const { data, error } = await supabase
        .from('comments')
        .insert(newComment)
        .select(`
          id, user_id, movie_id, content, created_at,
          profiles (display_name, avatar)
        `)
        .single();

      if (error) throw error;

      setComments((prev) => [data as unknown as Comment, ...prev]);
      setInputText('');
    } catch (error) {
      console.error('Error posting comment:', error);
      Alert.alert('Lỗi', 'Không thể gửi bình luận lúc này. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000); // seconds

    if (diff < 60) return 'Vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} ngày trước`;
    
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeaderRow}>
        <AppText style={[styles.sectionTitle, { color: themeColors.textPrimary, borderLeftColor: primaryColor }]}>
          Bình Luận ({comments.length})
        </AppText>
      </View>

      {/* Input box */}
      {user ? (
        <View style={[styles.inputContainer, { backgroundColor: themeColors.bgSecondary }]}>
          <Image
            source={user.user_metadata?.avatar_url || 'https://via.placeholder.com/150'}
            style={styles.avatar}
            contentFit="cover"
          />
          <TextInput
            style={[styles.input, { color: themeColors.textPrimary }]}
            placeholder="Viết bình luận..."
            placeholderTextColor={themeColors.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity 
            style={[styles.sendButton, { backgroundColor: inputText.trim() ? primaryColor : themeColors.bgTertiary }]}
            onPress={handlePostComment}
            disabled={submitting || !inputText.trim()}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <FontAwesome name="paper-plane" size={16} color={inputText.trim() ? '#fff' : themeColors.textMuted} />
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.loginPrompt, { backgroundColor: themeColors.bgSecondary }]}>
          <AppText style={{ color: themeColors.textSecondary }}>
            Vui lòng đăng nhập để bình luận.
          </AppText>
        </View>
      )}

      {/* Comment List */}
      <View style={styles.commentsList}>
        {loading ? (
          <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 20 }} />
        ) : comments.length > 0 ? (
          comments.map((comment) => (
            <View key={comment.id} style={[styles.commentItem, { borderBottomColor: themeColors.bgSecondary }]}>
              <Image
                source={comment.profiles?.avatar || 'https://via.placeholder.com/150'}
                style={styles.avatar}
                contentFit="cover"
              />
              <View style={styles.commentContent}>
                <View style={styles.commentHeader}>
                  <AppText style={[styles.authorName, { color: themeColors.textPrimary }]}>
                    {comment.profiles?.display_name || 'Người dùng'}
                  </AppText>
                  <AppText style={[styles.timeText, { color: themeColors.textMuted }]}>
                    {formatDate(comment.created_at)}
                  </AppText>
                </View>
                <AppText style={[styles.commentText, { color: themeColors.textSecondary }]}>
                  {comment.content}
                </AppText>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <FontAwesome name="comments-o" size={40} color={themeColors.textMuted} style={{ marginBottom: 12 }} />
            <AppText style={{ color: themeColors.textMuted }}>
              Chưa có bình luận nào. Hãy là người đầu tiên!
            </AppText>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  sectionHeaderRow: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Montserrat-Bold',
    borderLeftWidth: 3,
    paddingLeft: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    fontFamily: 'Montserrat-Regular',
    fontSize: 14,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    alignSelf: 'flex-end',
  },
  loginPrompt: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  commentsList: {
    marginTop: 8,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  authorName: {
    fontFamily: 'Montserrat-SemiBold',
    fontSize: 14,
  },
  timeText: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 12,
  },
  commentText: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
});
