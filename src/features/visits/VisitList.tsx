import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { COLORS, FONTS, SIZES } from '@/shared/constants/AppConstants';
import { listVisits, PaginatedVisits, Visit, deleteVisit } from '@/shared/services/api/visits';
import { listFolders, moveVisitToFolder, VisitFolder } from '@/shared/services/api/folders';
import { TagDisplay } from '@/shared/components/tags/TagDisplay';

interface VisitListProps {
  onSelectVisit?: (visitId: string) => void;
  onBack?: () => void;
}

export const VisitList: React.FC<VisitListProps> = ({ onSelectVisit, onBack }) => {
  const [visits, setVisits] = useState<PaginatedVisits | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Folder management state
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [folders, setFolders] = useState<VisitFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [movingVisit, setMovingVisit] = useState(false);

  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedVisitIds, setSelectedVisitIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'move' | 'delete' | null>(null);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([]);

  const load = useCallback(
    async (showSpinner = true) => {
      try {
        if (showSpinner) setLoading(true);
        const data = await listVisits();
        setVisits(data);
        setError(null);
      } catch (err: any) {
        console.error('Failed to load visits', err);
        setError(err.response?.data?.error?.message ?? 'Unable to load visits');
      } finally {
        if (showSpinner) setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load(false);
  };

  const loadFolders = useCallback(async () => {
    try {
      setLoadingFolders(true);
      const data = await listFolders();
      setFolders(data);
    } catch (err: any) {
      console.error('Failed to load folders', err);
      Alert.alert('Error', 'Unable to load folders');
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  const handleOpenFolderPicker = useCallback(
    (visit: Visit) => {
      setSelectedVisit(visit);
      setShowFolderPicker(true);
      if (folders.length === 0) {
        loadFolders();
      }
    },
    [folders.length, loadFolders]
  );

  const handleMoveToFolder = useCallback(
    async (folderId: string | null) => {
      if (!selectedVisit) return;

      try {
        setMovingVisit(true);
        await moveVisitToFolder(selectedVisit.id, folderId);

        // Update the visit in the local state
        setVisits((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            visits: prev.visits.map((v) =>
              v.id === selectedVisit.id
                ? { ...v, folderId, folder: folderId ? folders.find((f) => f.id === folderId) : undefined }
                : v
            ),
          };
        });

        setShowFolderPicker(false);
        setSelectedVisit(null);
        Alert.alert('Success', folderId ? 'Visit moved to folder' : 'Visit removed from folder');
      } catch (err: any) {
        console.error('Failed to move visit', err);
        Alert.alert('Error', err.response?.data?.error?.message ?? 'Unable to move visit');
      } finally {
        setMovingVisit(false);
      }
    },
    [folders, selectedVisit]
  );

  // Multi-select handlers
  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => !prev);
    setSelectedVisitIds(new Set());
  }, []);

  const toggleVisitSelection = useCallback((visitId: string) => {
    setSelectedVisitIds((prev) => {
      const next = new Set(prev);
      if (next.has(visitId)) {
        next.delete(visitId);
      } else {
        next.add(visitId);
      }
      return next;
    });
  }, []);

  const selectAllVisits = useCallback(() => {
    if (!visits) return;
    setSelectedVisitIds(new Set(visits.visits.map((v) => v.id)));
  }, [visits]);

  const deselectAllVisits = useCallback(() => {
    setSelectedVisitIds(new Set());
  }, []);

  const handleBulkMove = useCallback(() => {
    if (selectedVisitIds.size === 0) return;
    setBulkAction('move');
    if (folders.length === 0) {
      loadFolders();
    }
  }, [folders.length, loadFolders, selectedVisitIds.size]);

  const handleBulkDelete = useCallback(() => {
    if (selectedVisitIds.size === 0) return;

    Alert.alert(
      'Delete Visits',
      `Are you sure you want to delete ${selectedVisitIds.size} ${selectedVisitIds.size === 1 ? 'visit' : 'visits'}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete all selected visits
              await Promise.all(
                Array.from(selectedVisitIds).map((id) => deleteVisit(id))
              );

              Alert.alert('Success', `${selectedVisitIds.size} ${selectedVisitIds.size === 1 ? 'visit' : 'visits'} deleted`);

              // Reset selection and reload
              setSelectedVisitIds(new Set());
              setIsSelectionMode(false);
              await load(true);
            } catch (err: any) {
              console.error('Failed to delete visits', err);
              Alert.alert('Error', 'Failed to delete some visits');
            }
          },
        },
      ]
    );
  }, [load, selectedVisitIds]);

  const handleBulkMoveToFolder = useCallback(
    async (folderId: string | null) => {
      if (selectedVisitIds.size === 0) return;

      try {
        setMovingVisit(true);

        // Move all selected visits
        await Promise.all(
          Array.from(selectedVisitIds).map((id) => moveVisitToFolder(id, folderId))
        );

        Alert.alert('Success', `${selectedVisitIds.size} ${selectedVisitIds.size === 1 ? 'visit' : 'visits'} moved`);

        // Reset selection and reload
        setSelectedVisitIds(new Set());
        setIsSelectionMode(false);
        setBulkAction(null);
        await load(true);
      } catch (err: any) {
        console.error('Failed to move visits', err);
        Alert.alert('Error', err.response?.data?.error?.message ?? 'Failed to move some visits');
      } finally {
        setMovingVisit(false);
      }
    },
    [load, selectedVisitIds]
  );

  // Filter handlers
  const loadFilterOptions = useCallback(async () => {
    try {
      if (folders.length === 0) {
        const foldersData = await listFolders();
        setFolders(foldersData);
      }

      // Extract unique providers and tags from visits
      if (visits) {
        const uniqueProviders = Array.from(
          new Map(
            visits.visits
              .filter((v) => v.provider)
              .map((v) => [v.provider!.id, { id: v.provider!.id, name: v.provider!.name }])
          ).values()
        );
        setProviders(uniqueProviders);

        const allTags = new Set<string>();
        visits.visits.forEach((v) => {
          v.tags?.forEach((tag) => allTags.add(tag));
        });
        setAvailableTags(Array.from(allTags));
      }
    } catch (err) {
      console.error('Failed to load filter options', err);
    }
  }, [folders.length, visits]);

  const toggleFilter = useCallback(() => {
    setShowFilters((prev) => !prev);
    if (!showFilters) {
      loadFilterOptions();
    }
  }, [loadFilterOptions, showFilters]);

  const clearAllFilters = useCallback(() => {
    setSelectedStatus(null);
    setSelectedProviderId(null);
    setSelectedFolderId(null);
    setSelectedTags(new Set());
    setSearchQuery('');
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  // Filter visits based on selected criteria
  const filteredVisits = visits?.visits.filter((visit) => {
    // Status filter
    if (selectedStatus && visit.status !== selectedStatus) {
      return false;
    }

    // Provider filter
    if (selectedProviderId && visit.provider?.id !== selectedProviderId) {
      return false;
    }

    // Folder filter
    if (selectedFolderId && visit.folder?.id !== selectedFolderId) {
      return false;
    }

    // Tag filter (visit must have ALL selected tags)
    if (selectedTags.size > 0) {
      const visitTags = new Set(visit.tags || []);
      for (const tag of selectedTags) {
        if (!visitTags.has(tag)) {
          return false;
        }
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const searchableText = [
        visit.provider?.name,
        visit.provider?.specialty,
        visit.visitType,
        visit.summary?.overview,
        ...(visit.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!searchableText.includes(query)) {
        return false;
      }
    }

    return true;
  }) || [];

  const activeFilterCount =
    (selectedStatus ? 1 : 0) +
    (selectedProviderId ? 1 : 0) +
    (selectedFolderId ? 1 : 0) +
    selectedTags.size +
    (searchQuery.trim() ? 1 : 0);

  const renderList = () => (
    <FlatList
      data={filteredVisits}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      renderItem={({ item }) => {
        const statusStyle = statusStyles[item.status] ?? statusStyles.default;
        const formattedDate = new Date(item.visitDate).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
        const isSelected = selectedVisitIds.has(item.id);

        return (
          <View style={styles.visitCardContainer}>
            <TouchableOpacity
              style={[
                styles.visitCard,
                isSelectionMode && styles.visitCardSelectionMode,
                isSelected && styles.visitCardSelected,
              ]}
              activeOpacity={0.9}
              onPress={() => {
                if (isSelectionMode) {
                  toggleVisitSelection(item.id);
                } else {
                  onSelectVisit?.(item.id);
                }
              }}
            >
              <View style={styles.visitHeader}>
                {isSelectionMode && (
                  <View style={styles.checkbox}>
                    <View style={[styles.checkboxInner, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </View>
                )}
                <View style={styles.visitHeaderLeft}>
                  <Text style={styles.visitTitle} numberOfLines={1}>
                    {item.provider?.name ?? 'Healthcare visit'}
                  </Text>
                  <View style={styles.visitMetaRow}>
                    <Text style={styles.visitMeta} numberOfLines={1}>
                      {item.provider?.specialty ?? item.visitType.replace('_', ' ')} · {formattedDate}
                    </Text>
                  </View>
                  {item.folder && (
                    <View style={styles.folderBadge}>
                      <View style={[styles.folderDot, { backgroundColor: item.folder.color || COLORS.PRIMARY }]} />
                      <Text style={styles.folderText}>{item.folder.name}</Text>
                    </View>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <View style={styles.tagsContainer}>
                      <TagDisplay tags={item.tags} variant="compact" maxVisible={3} />
                    </View>
                  )}
                </View>
                <View style={styles.visitHeaderRight}>
                  <View style={[styles.statusBadge, statusStyle.badge]}>
                    <Text style={[styles.statusLabel, statusStyle.text]}>{item.status.toLowerCase()}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.folderButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleOpenFolderPicker(item);
                    }}
                  >
                    <Text style={styles.folderButtonText}>📁</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.summaryRow}>
                <View style={styles.summaryHighlight}>
                  <Text style={styles.highlightTitle}>AI overview</Text>
                  <Text style={styles.highlightBody} numberOfLines={3}>
                    {item.summary?.overview ?? 'Processing visit summary…'}
                  </Text>
                </View>
                <View style={styles.statColumn}>
                  <Text style={styles.statLabel}>Duration</Text>
                  <Text style={styles.statValue}>
                    {item.duration ? `${Math.round(item.duration / 60)} min` : '—'}
                  </Text>
                  <Text style={styles.statLabel}>Action items</Text>
                  <Text style={styles.statValue}>
                    {item.summary?.actionItems?.length ?? 0}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        );
      }}
      ListFooterComponent={error ? <Text style={styles.errorText}>{error}</Text> : null}
    />
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.PRIMARY} />
        <Text style={styles.loadingText}>Loading visit history…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backLabel}>← Back</Text>
        </TouchableOpacity>
        {!isSelectionMode ? (
          <>
            <View style={styles.headerTop}>
              <View style={styles.headerCopy}>
                <Text style={styles.headerTitle}>Visit history</Text>
                <Text style={styles.headerSubtitle} numberOfLines={2}>
                  Review transcripts, AI highlights, and action items from your recorded visits.
                </Text>
              </View>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]}
                onPress={toggleFilter}
              >
                <Text style={[styles.filterButtonText, activeFilterCount > 0 && styles.filterButtonTextActive]}>
                  Filter {activeFilterCount > 0 && `(${activeFilterCount})`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.selectButton} onPress={toggleSelectionMode}>
                <Text style={styles.selectButtonText}>Select</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.headerTop}>
              <View style={styles.selectionHeader}>
                <Text style={styles.selectionCount}>
                  {selectedVisitIds.size} selected
                </Text>
                <View style={styles.selectionActions}>
                  <TouchableOpacity onPress={selectAllVisits} style={styles.selectionActionButton}>
                    <Text style={styles.selectionActionText}>Select All</Text>
                  </TouchableOpacity>
                  {selectedVisitIds.size > 0 && (
                    <TouchableOpacity onPress={deselectAllVisits} style={styles.selectionActionButton}>
                      <Text style={styles.selectionActionText}>Deselect All</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={toggleSelectionMode}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Bulk action buttons */}
      {isSelectionMode && selectedVisitIds.size > 0 && (
        <View style={styles.bulkActionsBar}>
          <TouchableOpacity
            style={[styles.bulkActionButton, styles.bulkMoveButton]}
            onPress={handleBulkMove}
          >
            <Text style={styles.bulkActionButtonText}>Move to Folder</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkActionButton, styles.bulkDeleteButton]}
            onPress={handleBulkDelete}
          >
            <Text style={styles.bulkDeleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter Panel */}
      {showFilters && (
        <View style={styles.filterPanel}>
          <View style={styles.filterPanelHeader}>
            <Text style={styles.filterPanelTitle}>Filters</Text>
            {activeFilterCount > 0 && (
              <TouchableOpacity onPress={clearAllFilters}>
                <Text style={styles.clearFiltersText}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.filterPanelScroll} showsVerticalScrollIndicator={false}>
            {/* Search */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Search</Text>
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search visits..."
                placeholderTextColor={COLORS.GRAY[400]}
              />
            </View>

            {/* Status Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Status</Text>
              <View style={styles.filterChips}>
                {['COMPLETED', 'PROCESSING', 'RECORDING', 'FAILED'].map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[styles.filterChip, selectedStatus === status && styles.filterChipActive]}
                    onPress={() => setSelectedStatus(selectedStatus === status ? null : status)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedStatus === status && styles.filterChipTextActive,
                      ]}
                    >
                      {status.toLowerCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Provider Filter */}
            {providers.length > 0 && (
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Provider</Text>
                <View style={styles.filterChips}>
                  {providers.map((provider) => (
                    <TouchableOpacity
                      key={provider.id}
                      style={[
                        styles.filterChip,
                        selectedProviderId === provider.id && styles.filterChipActive,
                      ]}
                      onPress={() =>
                        setSelectedProviderId(selectedProviderId === provider.id ? null : provider.id)
                      }
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          selectedProviderId === provider.id && styles.filterChipTextActive,
                        ]}
                      >
                        {provider.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Folder Filter */}
            {folders.length > 0 && (
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Folder</Text>
                <View style={styles.filterChips}>
                  {folders.map((folder) => (
                    <TouchableOpacity
                      key={folder.id}
                      style={[
                        styles.filterChip,
                        selectedFolderId === folder.id && styles.filterChipActive,
                      ]}
                      onPress={() =>
                        setSelectedFolderId(selectedFolderId === folder.id ? null : folder.id)
                      }
                    >
                      <View
                        style={[styles.folderChipDot, { backgroundColor: folder.color || COLORS.PRIMARY }]}
                      />
                      <Text
                        style={[
                          styles.filterChipText,
                          selectedFolderId === folder.id && styles.filterChipTextActive,
                        ]}
                      >
                        {folder.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Tag Filter */}
            {availableTags.length > 0 && (
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Tags</Text>
                <View style={styles.filterChips}>
                  {availableTags.map((tag) => (
                    <TouchableOpacity
                      key={tag}
                      style={[styles.filterChip, selectedTags.has(tag) && styles.filterChipActive]}
                      onPress={() => toggleTag(tag)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          selectedTags.has(tag) && styles.filterChipTextActive,
                        ]}
                      >
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.filterResults}>
            <Text style={styles.filterResultsText}>
              Showing {filteredVisits.length} of {visits?.visits.length || 0} visits
            </Text>
          </View>
        </View>
      )}

      {visits && visits.visits.length > 0 ? (
        renderList()
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No visits recorded yet</Text>
          <Text style={styles.emptyCopy}>
            Start a visit to see transcripts, summaries, and follow-up tasks appear here.
          </Text>
        </View>
      )}

      {/* Folder Picker Modal */}
      <Modal
        visible={showFolderPicker || bulkAction === 'move'}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowFolderPicker(false);
          setSelectedVisit(null);
          setBulkAction(null);
        }}
      >
        <View style={styles.modalContainer}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setShowFolderPicker(false);
              setSelectedVisit(null);
              setBulkAction(null);
            }}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {bulkAction === 'move' ? `Move ${selectedVisitIds.size} visits` : 'Move to Folder'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowFolderPicker(false);
                  setSelectedVisit(null);
                  setBulkAction(null);
                }}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingFolders ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={COLORS.PRIMARY} />
              </View>
            ) : (
              <>
                {selectedVisit?.folder && (
                  <TouchableOpacity
                    style={styles.removeFromFolderButton}
                    onPress={() => handleMoveToFolder(null)}
                    disabled={movingVisit}
                  >
                    <Text style={styles.removeFromFolderText}>Remove from folder</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.modalListLabel}>Select a folder</Text>

                <ScrollView style={styles.modalList}>
                  {folders.length === 0 ? (
                    <Text style={styles.modalEmpty}>
                      No folders yet. Create one in the Folders tab.
                    </Text>
                  ) : (
                    <View style={styles.folderListContainer}>
                      {folders.map((folder) => (
                        <TouchableOpacity
                          key={folder.id}
                          style={[
                            styles.folderItem,
                            selectedVisit?.folder?.id === folder.id && styles.folderItemActive,
                          ]}
                          onPress={() => {
                            if (bulkAction === 'move') {
                              handleBulkMoveToFolder(folder.id);
                            } else {
                              handleMoveToFolder(folder.id);
                            }
                          }}
                          disabled={movingVisit}
                        >
                          <View style={styles.folderItemLeft}>
                            <View
                              style={[
                                styles.folderItemColor,
                                { backgroundColor: folder.color || COLORS.PRIMARY },
                              ]}
                            />
                            <Text style={styles.folderItemName}>{folder.name}</Text>
                          </View>
                          {selectedVisit?.folder?.id === folder.id && bulkAction !== 'move' && (
                            <Text style={styles.folderItemCheck}>✓</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const statusStyles = {
  RECORDING: {
    badge: { backgroundColor: '#FFF1D6' },
    text: { color: '#B57200' },
  },
  PROCESSING: {
    badge: { backgroundColor: '#E3ECFF' },
    text: { color: '#1B4FB6' },
  },
  COMPLETED: {
    badge: { backgroundColor: '#DDF5E8' },
    text: { color: '#20784F' },
  },
  FAILED: {
    badge: { backgroundColor: '#FCE3E1' },
    text: { color: '#C12F3B' },
  },
  default: {
    badge: { backgroundColor: COLORS.GRAY[100] },
    text: { color: COLORS.SECONDARY },
  },
} as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.SM,
    backgroundColor: COLORS.BACKGROUND,
  },
  loadingText: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  emptyState: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    margin: SIZES.PADDING,
    padding: SIZES.CARD_PADDING,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    alignItems: 'center',
    gap: SIZES.SM,
    ...SIZES.SHADOW.MEDIUM,
  },
  emptyTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XL,
    color: COLORS.PRIMARY,
  },
  emptyCopy: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
  },
  header: {
    paddingHorizontal: SIZES.PADDING,
    paddingTop: SIZES.LG,
    paddingBottom: SIZES.MD,
    gap: SIZES.SM,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  headerTop: {
    marginBottom: SIZES.XS,
  },
  headerCopy: {
    gap: SIZES.XS,
  },
  headerTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.HEADING,
    color: COLORS.PRIMARY,
  },
  headerSubtitle: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    lineHeight: 22,
  },
  headerActions: {
    flexDirection: 'row',
    gap: SIZES.XS,
    alignItems: 'center',
  },
  listContent: {
    backgroundColor: COLORS.BACKGROUND,
    paddingHorizontal: SIZES.PADDING,
    paddingVertical: SIZES.LG,
    gap: SIZES.MD,
  },
  visitCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    gap: SIZES.SM,
    ...SIZES.SHADOW.LIGHT,
  },
  visitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  visitTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
  },
  visitMeta: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: SIZES.SM + 2,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusLabel: {
    fontFamily: FONTS.SEMIBOLD,
    textTransform: 'capitalize',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: SIZES.MD,
  },
  summaryHighlight: {
    flex: 1,
    backgroundColor: COLORS.HEALTH.WARM_SAND,
    padding: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    gap: SIZES.XS,
  },
  highlightTitle: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  highlightBody: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.BLACK,
    lineHeight: 20,
  },
  statColumn: {
    width: 110,
    backgroundColor: COLORS.HEALTH.PALE_MINT,
    borderRadius: SIZES.BORDER_RADIUS,
    padding: SIZES.MD,
    gap: SIZES.XS,
  },
  statLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  statValue: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
  },
  errorText: {
    marginTop: SIZES.SM,
    textAlign: 'center',
    fontFamily: FONTS.MEDIUM,
    color: COLORS.DANGER,
  },
  // New folder-related styles
  visitCardContainer: {
    position: 'relative',
  },
  visitHeaderLeft: {
    flex: 1,
    gap: SIZES.XS - 2,
  },
  visitHeaderRight: {
    alignItems: 'flex-end',
    gap: SIZES.XS,
  },
  visitMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.XS,
  },
  folderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.XS - 2,
    marginTop: 2,
  },
  folderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  folderText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.XS,
    color: COLORS.SECONDARY,
  },
  tagsContainer: {
    marginTop: 4,
  },
  folderButton: {
    padding: SIZES.XS,
    borderRadius: SIZES.BORDER_RADIUS - 2,
    backgroundColor: COLORS.GRAY[100],
  },
  folderButtonText: {
    fontSize: 16,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalSheet: {
    backgroundColor: COLORS.WHITE,
    borderTopLeftRadius: SIZES.CARD_BORDER_RADIUS,
    borderTopRightRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.LG,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.MD,
  },
  modalTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XL,
    color: COLORS.PRIMARY,
  },
  modalClose: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XXL,
    color: COLORS.SECONDARY,
  },
  modalLoading: {
    padding: SIZES.XL,
    alignItems: 'center',
  },
  modalListLabel: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
    marginBottom: SIZES.SM,
  },
  modalEmpty: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    textAlign: 'center',
    paddingVertical: SIZES.LG,
  },
  modalList: {
    maxHeight: 400,
  },
  removeFromFolderButton: {
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.DANGER + '15',
    borderWidth: 1,
    borderColor: COLORS.DANGER,
    alignItems: 'center',
    marginBottom: SIZES.MD,
  },
  removeFromFolderText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.DANGER,
  },
  folderListContainer: {
    gap: SIZES.XS,
  },
  folderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.GRAY[50],
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
  },
  folderItemActive: {
    backgroundColor: COLORS.PRIMARY + '15',
    borderColor: COLORS.PRIMARY,
  },
  folderItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.SM,
  },
  folderItemColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  folderItemName: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.PRIMARY,
  },
  folderItemCheck: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XL,
    color: COLORS.PRIMARY,
  },
  // Multi-select styles
  selectButton: {
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY,
  },
  selectButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
  },
  selectionHeader: {
    gap: SIZES.XS,
  },
  selectionCount: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: SIZES.SM,
  },
  selectionActionButton: {
    paddingVertical: 2,
  },
  selectionActionText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
  },
  cancelButton: {
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.SECONDARY,
  },
  cancelButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  bulkActionsBar: {
    flexDirection: 'row',
    paddingHorizontal: SIZES.PADDING,
    paddingVertical: SIZES.SM,
    gap: SIZES.SM,
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.GRAY[100],
  },
  bulkActionButton: {
    flex: 1,
    paddingVertical: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
  },
  bulkMoveButton: {
    backgroundColor: COLORS.PRIMARY,
  },
  bulkDeleteButton: {
    backgroundColor: COLORS.DANGER,
  },
  bulkActionButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
  },
  bulkDeleteButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
  },
  checkbox: {
    marginRight: SIZES.SM,
  },
  checkboxInner: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.GRAY[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: COLORS.PRIMARY,
    borderColor: COLORS.PRIMARY,
  },
  checkmark: {
    color: COLORS.WHITE,
    fontSize: 16,
    fontWeight: 'bold',
  },
  visitCardSelectionMode: {
    paddingLeft: SIZES.CARD_PADDING - 4,
  },
  visitCardSelected: {
    borderWidth: 2,
    borderColor: COLORS.PRIMARY,
    backgroundColor: COLORS.PRIMARY + '08',
  },
  // Filter styles
  filterButton: {
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[300],
  },
  filterButtonActive: {
    backgroundColor: COLORS.PRIMARY + '15',
    borderColor: COLORS.PRIMARY,
  },
  filterButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  filterButtonTextActive: {
    color: COLORS.PRIMARY,
  },
  filterPanel: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.GRAY[100],
    maxHeight: 300,
  },
  filterPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.PADDING,
    paddingTop: SIZES.MD,
    paddingBottom: SIZES.SM,
  },
  filterPanelTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
  },
  clearFiltersText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
  },
  filterPanelScroll: {
    paddingHorizontal: SIZES.PADDING,
  },
  filterSection: {
    marginBottom: SIZES.MD,
  },
  filterSectionTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
    marginBottom: SIZES.XS,
  },
  searchInput: {
    backgroundColor: COLORS.GRAY[50],
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    borderRadius: SIZES.BORDER_RADIUS,
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.XS,
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.XS,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.XS - 2,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.GRAY[100],
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    gap: SIZES.XS - 4,
  },
  filterChipActive: {
    backgroundColor: COLORS.PRIMARY + '15',
    borderColor: COLORS.PRIMARY,
  },
  filterChipText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  filterChipTextActive: {
    color: COLORS.PRIMARY,
  },
  folderChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterResults: {
    paddingHorizontal: SIZES.PADDING,
    paddingVertical: SIZES.SM,
    borderTopWidth: 1,
    borderTopColor: COLORS.GRAY[100],
    backgroundColor: COLORS.GRAY[50],
  },
  filterResultsText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
    textAlign: 'center',
  },
});

export default VisitList;
