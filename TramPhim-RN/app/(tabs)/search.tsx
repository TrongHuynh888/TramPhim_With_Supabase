import React, { useState, useMemo, useCallback } from 'react';
import { StyleSheet, View, Text, TextInput, FlatList, Pressable, SafeAreaView } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMovieStore, Movie } from '../../stores/useMovieStore';
import { MovieCard } from '../../components/MovieCard';
import { Colors } from '../../theme/colors';
import { useThemeStore } from '../../stores/useThemeStore';
import { removeDiacritics } from '../../utils/helpers';
import MovieDetailPopup from '../../components/MovieDetailPopup';

export default function SearchScreen() {
  const { allMovies } = useMovieStore();
  const primaryColor = useThemeStore(s => s.primaryColor);
  const [searchQuery, setSearchQuery] = useState('');
  // State cho popup chi tiết phim kiểu Netflix
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isPopupVisible, setIsPopupVisible] = useState(false);

  // Mở popup chi tiết phim khi bấm vào MovieCard
  const handleMoviePress = useCallback((movie: Movie) => {
    setSelectedMovie(movie);
    setIsPopupVisible(true);
  }, []);

  // Logic tìm kiếm không dấu
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = removeDiacritics(searchQuery);
    return allMovies.filter(movie => {
      const title = removeDiacritics(movie.title || '');
      const originTitle = removeDiacritics(movie.originTitle || '');
      const cast = removeDiacritics(movie.cast || '');
      
      return title.includes(query) || 
             originTitle.includes(query) || 
             cast.includes(query);
    });
  }, [allMovies, searchQuery]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Thanh Tìm Kiếm */}
      <View style={styles.searchHeader}>
        <View style={styles.searchBar}>
          <FontAwesome name="search" size={18} color={Colors.dark.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm tên phim, diễn viên..."
            placeholderTextColor={Colors.dark.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} style={styles.clearIcon}>
              <FontAwesome name="times-circle" size={18} color={Colors.dark.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Trạng thái và Kết quả */}
      <View style={styles.resultsContainer}>
        {searchQuery.length > 0 ? (
          <>
            <Text style={styles.resultText}>
              Tìm thấy <Text style={{ color: primaryColor }}>{searchResults.length}</Text> kết quả
            </Text>
            
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              numColumns={3}
              contentContainerStyle={styles.listContent}
              columnWrapperStyle={styles.columnWrapper}
              renderItem={({ item }) => <MovieCard movie={item} onPress={handleMoviePress} />}
              keyboardDismissMode="on-drag" // Ẩn bàn phím khi cuộn
            />
          </>
        ) : (
          <View style={styles.emptyState}>
            <FontAwesome name="film" size={64} color={Colors.dark.bgTertiary} />
            <Text style={styles.emptyText}>Nhập tên phim bạn muốn tìm</Text>
          </View>
        )}
      </View>

      {/* Popup chi tiết phim kiểu Netflix */}
      <MovieDetailPopup
        visible={isPopupVisible}
        movie={selectedMovie}
        onClose={() => setIsPopupVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.bgPrimary,
  },
  searchHeader: {
    padding: 16,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.bgTertiary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.bgSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 10,
  },
  clearIcon: {
    padding: 4,
  },
  searchInput: {
    flex: 1,
    color: Colors.dark.textPrimary,
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
  },
  resultsContainer: {
    flex: 1,
  },
  resultText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: 'Montserrat-Regular',
    margin: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: '20%',
  },
  emptyText: {
    color: Colors.dark.textMuted,
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
    marginTop: 16,
  },
});
