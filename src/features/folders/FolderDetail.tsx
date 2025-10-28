import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { COLORS, FONTS, SIZES } from '@/shared/constants/AppConstants';
import { getFolderById, moveVisitToFolder, VisitFolder } from '@/shared/services/api/folders';
import { listVisits, Visit } from '@/shared/services/api/visits';
import { TagDisplay } from '@/shared/components/tags/TagDisplay';

interface FolderDetailProps {
  folderId: string;
  onBack: () => void;
  onSelectVisit: (visitId: string) => void;
}

export const FolderDetail: React.FC<FolderDetailProps> = ({ folderId, onBack, onSelectVisit }) => {
  const [folder, setFolder] = useState<VisitFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add visits state
  const [showAddVisits, setShowAddVisits] = useState(false);
  const [availableVisits, setAvailableVisits] = useState<Visit[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [addingVisits, setAddingVisits] = useState<Set<string>>(new Set());

  const loadFolder = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getFolderById(folderId);
      setFolder(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load folder', err);
      setError(err.response?.data?.error?.message ?? 'Unable to load folder');
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useFocusEffect(
    useCallback(() => {
      loadFolder();
    }, [loadFolder])
  );

  const loadAvailableVisits = useCallback(async () => {
    try {
      setLoadingVisits(true);
      const visitsData = await listVisits(1, 100);

      // Filter out visits that are already in this folder
      const currentVisitIds = new Set(folder?.visits?.map((v) => v.id) || []);
      const available = visitsData.visits.filter((v) => !currentVisitIds.has(v.id));

      setAvailableVisits(available);
    } catch (err: any) {
      console.error('Failed to load visits', err);
      Alert.alert('Error', 'Unable to load visits');
    } finally {
      setLoadingVisits(false);
    }
  }, [folder?.visits]);

  const handleOpenAddVisits = useCallback(() => {
    setShowAddVisits(true);
    loadAvailableVisits();
  }, [loadAvailableVisits]);

  const handleAddVisit = useCallback(
    async (visitId: string) => {
      if (addingVisits.has(visitId)) return;

      try {
        setAddingVisits((prev) => new Set(prev).add(visitId));
        await moveVisitToFolder(visitId, folderId);

        // Remove from available visits and reload folder
        setAvailableVisits((prev) => prev.filter((v) => v.id !== visitId));
        await loadFolder();

        Alert.alert('Success', 'Visit added to folder');
      } catch (err: any) {
        console.error('Failed to add visit', err);
        Alert.alert('Error', err.response?.data?.error?.message ?? 'Unable to add visit');
      } finally {
        setAddingVisits((prev) => {
          const next = new Set(prev);
          next.delete(visitId);
          return next;
        });
      }
    },
    [addingVisits, folderId, loadFolder]
  );

  const renderVisit = ({ item }: { item: Visit }) => {
    const formattedDate = new Date(item.visitDate).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const statusStyle = statusStyles[item.status] ?? statusStyles.default;

    return (
      <TouchableOpacity
        style={styles.visitCard}
        activeOpacity={0.9}
        onPress={() => onSelectVisit(item.id)}
      >
        <View style={styles.visitHeader}>
          <View style={styles.visitHeaderLeft}>
            <Text style={styles.visitTitle} numberOfLines={1}>
              {item.provider?.name ?? 'Healthcare visit'}
            </Text>
            <Text style={styles.visitMeta} numberOfLines={1}>
              {item.provider?.specialty ?? item.visitType.replace('_', ' ')} · {formattedDate}
            </Text>
            {item.tags && item.tags.length > 0 && (
              <View style={styles.tagsContainer}>
                <TagDisplay tags={item.tags} variant="compact" maxVisible={3} />
              </View>
            )}
          </View>
          <View style={[styles.statusBadge, statusStyle.badge]}>
            <Text style={[styles.statusLabel, statusStyle.text]}>{item.status.toLowerCase()}</Text>
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
            <Text style={styles.statValue}>{item.summary?.actionItems?.length ?? 0}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.PRIMARY} size="large" />
          <Text style={styles.loadingText}>Loading folder...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !folder) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.container}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backLabel}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error ?? 'Folder not found'}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadFolder}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backLabel}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.folderHeader}>
          <View style={styles.folderTitleRow}>
            <View
              style={[styles.folderColorLarge, { backgroundColor: folder.color || COLORS.PRIMARY }]}
            />
            <Text style={styles.folderTitle}>{folder.name}</Text>
          </View>
          <Text style={styles.folderSubtitle}>
            {folder.visits?.length ?? 0} {folder.visits?.length === 1 ? 'visit' : 'visits'}
          </Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleOpenAddVisits}>
          <Text style={styles.addButtonText}>+ Add Visits</Text>
        </TouchableOpacity>
      </View>

      {folder.visits && folder.visits.length > 0 ? (
        <FlatList
          data={folder.visits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderVisit}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No visits in this folder</Text>
          <Text style={styles.emptyCopy}>
            Visits you add to this folder will appear here. You can move visits from the Visits tab.
          </Text>
        </View>
      )}

      {/* Add Visits Modal */}
      <Modal
        visible={showAddVisits}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddVisits(false)}
      >
        <View style={styles.modalContainer}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowAddVisits(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Visits to Folder</Text>
              <TouchableOpacity onPress={() => setShowAddVisits(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingVisits ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={COLORS.PRIMARY} />
              </View>
            ) : (
              <>
                {availableVisits.length === 0 ? (
                  <View style={styles.modalEmpty}>
                    <Text style={styles.modalEmptyText}>
                      All your visits are already in this folder or you have no other visits.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.modalListLabel}>
                      Select visits to add ({availableVisits.length} available)
                    </Text>
                    <ScrollView style={styles.modalList}>
                      {availableVisits.map((visit) => {
                        const isAdding = addingVisits.has(visit.id);
                        const formattedDate = new Date(visit.visitDate).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        });

                        return (
                          <TouchableOpacity
                            key={visit.id}
                            style={styles.visitPickerItem}
                            onPress={() => handleAddVisit(visit.id)}
                            disabled={isAdding}
                          >
                            <View style={styles.visitPickerLeft}>
                              <Text style={styles.visitPickerTitle} numberOfLines={1}>
                                {visit.provider?.name ?? 'Healthcare visit'}
                              </Text>
                              <Text style={styles.visitPickerMeta} numberOfLines={1}>
                                {visit.provider?.specialty ?? visit.visitType.replace('_', ' ')} · {formattedDate}
                              </Text>
                              {visit.folder && (
                                <View style={styles.visitPickerFolderBadge}>
                                  <View
                                    style={[
                                      styles.visitPickerFolderDot,
                                      { backgroundColor: visit.folder.color || COLORS.PRIMARY },
                                    ]}
                                  />
                                  <Text style={styles.visitPickerFolderText}>{visit.folder.name}</Text>
                                </View>
                              )}
                            </View>
                            {isAdding ? (
                              <ActivityIndicator size="small" color={COLORS.PRIMARY} />
                            ) : (
                              <Text style={styles.visitPickerAdd}>+ Add</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </>
                )}
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
  },
  loadingText: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  container: {
    flex: 1,
    padding: SIZES.PADDING,
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
  folderHeader: {
    gap: SIZES.XS,
  },
  folderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.SM,
  },
  folderColorLarge: {
    width: 32,
    height: 32,
    borderRadius: SIZES.BORDER_RADIUS,
  },
  folderTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.HEADING,
    color: COLORS.PRIMARY,
  },
  folderSubtitle: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    marginLeft: 40,
  },
  errorContainer: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    padding: SIZES.CARD_PADDING,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    alignItems: 'center',
    gap: SIZES.SM,
  },
  errorText: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.DANGER,
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    backgroundColor: COLORS.PRIMARY,
    borderRadius: SIZES.BORDER_RADIUS,
  },
  retryButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
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
  visitHeaderLeft: {
    flex: 1,
    gap: SIZES.XS - 2,
  },
  visitTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
  },
  visitMeta: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
  },
  tagsContainer: {
    marginTop: 4,
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
  // Add button styles
  addButton: {
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
    marginTop: SIZES.SM,
  },
  addButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
    fontSize: SIZES.FONT.MD,
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
  modalEmpty: {
    paddingVertical: SIZES.XL,
    alignItems: 'center',
  },
  modalEmptyText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalListLabel: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
    marginBottom: SIZES.SM,
  },
  modalList: {
    maxHeight: 400,
  },
  visitPickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.GRAY[50],
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    marginBottom: SIZES.XS,
  },
  visitPickerLeft: {
    flex: 1,
    gap: SIZES.XS - 2,
  },
  visitPickerTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
  },
  visitPickerMeta: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  visitPickerFolderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.XS - 2,
    marginTop: 2,
  },
  visitPickerFolderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  visitPickerFolderText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.XS,
    color: COLORS.SECONDARY,
  },
  visitPickerAdd: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
  },
});

export default FolderDetail;
