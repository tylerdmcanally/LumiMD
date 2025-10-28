import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { COLORS, FONTS, SIZES } from '@/shared/constants/AppConstants';
import {
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  VisitFolder,
  CreateFolderInput,
  UpdateFolderInput,
} from '@/shared/services/api/folders';

interface FolderListProps {
  onBack?: () => void;
  onSelectFolder?: (folderId: string) => void;
}

const FOLDER_COLORS = [
  { name: 'Blue', value: '#0066CC' },
  { name: 'Green', value: '#00AA44' },
  { name: 'Red', value: '#DD0000' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Amber', value: '#F59E0B' },
];

export const FolderList: React.FC<FolderListProps> = ({ onBack, onSelectFolder }) => {
  const [folders, setFolders] = useState<VisitFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<VisitFolder | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedColor, setSelectedColor] = useState(FOLDER_COLORS[0].value);
  const [saving, setSaving] = useState(false);

  const loadFolders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listFolders();
      setFolders(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load folders', err);
      setError(err.response?.data?.error?.message ?? 'Unable to load folders');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFolders();
    }, [loadFolders])
  );

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }

    try {
      setSaving(true);
      const input: CreateFolderInput = {
        name: newFolderName.trim(),
        color: selectedColor,
        icon: 'folder',
      };
      await createFolder(input);
      setShowCreateModal(false);
      setNewFolderName('');
      setSelectedColor(FOLDER_COLORS[0].value);
      loadFolders();
    } catch (err: any) {
      Alert.alert(
        'Error',
        err.response?.data?.error?.message ?? 'Failed to create folder'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEditFolder = async () => {
    if (!editingFolder || !newFolderName.trim()) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }

    try {
      setSaving(true);
      const input: UpdateFolderInput = {
        name: newFolderName.trim(),
        color: selectedColor,
      };
      await updateFolder(editingFolder.id, input);
      setShowEditModal(false);
      setEditingFolder(null);
      setNewFolderName('');
      setSelectedColor(FOLDER_COLORS[0].value);
      loadFolders();
    } catch (err: any) {
      Alert.alert(
        'Error',
        err.response?.data?.error?.message ?? 'Failed to update folder'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFolder = (folder: VisitFolder) => {
    Alert.alert(
      'Delete Folder',
      `Are you sure you want to delete "${folder.name}"? Visits in this folder will not be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFolder(folder.id);
              loadFolders();
            } catch (err: any) {
              Alert.alert(
                'Error',
                err.response?.data?.error?.message ?? 'Failed to delete folder'
              );
            }
          },
        },
      ]
    );
  };

  const openEditModal = (folder: VisitFolder) => {
    setEditingFolder(folder);
    setNewFolderName(folder.name);
    setSelectedColor(folder.color || FOLDER_COLORS[0].value);
    setShowEditModal(true);
  };

  const openCreateModal = () => {
    setNewFolderName('');
    setSelectedColor(FOLDER_COLORS[0].value);
    setShowCreateModal(true);
  };

  const renderFolderModal = (isEdit: boolean) => {
    const visible = isEdit ? showEditModal : showCreateModal;
    const onClose = () => {
      if (isEdit) {
        setShowEditModal(false);
        setEditingFolder(null);
      } else {
        setShowCreateModal(false);
      }
      setNewFolderName('');
      setSelectedColor(FOLDER_COLORS[0].value);
    };
    const onSave = isEdit ? handleEditFolder : handleCreateFolder;
    const title = isEdit ? 'Edit Folder' : 'Create Folder';

    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{title}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Folder Name</Text>
              <TextInput
                style={styles.input}
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="e.g., Cardiology, Annual Checkups"
                placeholderTextColor={COLORS.GRAY[400]}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Color</Text>
              <View style={styles.colorGrid}>
                {FOLDER_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color.value}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color.value },
                      selectedColor === color.value && styles.colorOptionSelected,
                    ]}
                    onPress={() => setSelectedColor(color.value)}
                  >
                    {selectedColor === color.value && (
                      <Text style={styles.colorCheckmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={onClose}
                disabled={saving}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={onSave}
                disabled={saving || !newFolderName.trim()}
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.WHITE} size="small" />
                ) : (
                  <Text style={styles.modalButtonTextSave}>{isEdit ? 'Save' : 'Create'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.PRIMARY} size="large" />
        <Text style={styles.loadingText}>Loading folders...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backLabel}>← Back</Text>
          </TouchableOpacity>
        )}
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Folders</Text>
          <Text style={styles.headerSubtitle} numberOfLines={2}>
            Organize your visits into folders for easy access.
          </Text>
        </View>
        <TouchableOpacity style={styles.createButton} onPress={openCreateModal}>
          <Text style={styles.createButtonLabel}>+ New Folder</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {folders.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No folders yet</Text>
          <Text style={styles.emptyCopy}>
            Create your first folder to start organizing your visits by category, provider, or any
            system that works for you.
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={openCreateModal}>
            <Text style={styles.emptyButtonLabel}>Create First Folder</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={folders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.folderCard}
              onPress={() => onSelectFolder?.(item.id)}
              activeOpacity={0.8}
            >
              <View style={styles.folderLeft}>
                <View style={[styles.folderIcon, { backgroundColor: item.color || FOLDER_COLORS[0].value }]}>
                  <Text style={styles.folderIconText}>📁</Text>
                </View>
                <View style={styles.folderInfo}>
                  <Text style={styles.folderName}>{item.name}</Text>
                  <Text style={styles.folderCount}>
                    {item._count?.visits ?? 0} {item._count?.visits === 1 ? 'visit' : 'visits'}
                  </Text>
                </View>
              </View>
              <View style={styles.folderActions}>
                <TouchableOpacity
                  style={styles.folderActionButton}
                  onPress={() => openEditModal(item)}
                >
                  <Text style={styles.folderActionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.folderActionButton, styles.folderActionButtonDelete]}
                  onPress={() => handleDeleteFolder(item)}
                >
                  <Text style={[styles.folderActionText, styles.folderActionTextDelete]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {renderFolderModal(false)}
      {renderFolderModal(true)}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SIZES.SM,
  },
  loadingText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    marginTop: SIZES.SM,
  },
  header: {
    paddingHorizontal: SIZES.PADDING,
    paddingVertical: SIZES.MD,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.GRAY[100],
  },
  backButton: {
    paddingVertical: SIZES.XS,
    marginBottom: SIZES.SM,
  },
  backLabel: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
  },
  headerCopy: {
    marginBottom: SIZES.SM,
  },
  headerTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.DISPLAY,
    color: COLORS.PRIMARY,
    marginBottom: SIZES.XS,
  },
  headerSubtitle: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
    lineHeight: 20,
  },
  createButton: {
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
  },
  createButtonLabel: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
    fontSize: SIZES.FONT.MD,
  },
  errorContainer: {
    marginHorizontal: SIZES.PADDING,
    marginVertical: SIZES.SM,
    padding: SIZES.SM,
    backgroundColor: COLORS.DANGER + '20',
    borderRadius: SIZES.BORDER_RADIUS,
  },
  errorText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.DANGER,
  },
  listContent: {
    padding: SIZES.PADDING,
    gap: SIZES.SM,
  },
  folderCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...SIZES.SHADOW.LIGHT,
  },
  folderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.SM,
    flex: 1,
  },
  folderIcon: {
    width: 48,
    height: 48,
    borderRadius: SIZES.BORDER_RADIUS,
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderIconText: {
    fontSize: 24,
  },
  folderInfo: {
    flex: 1,
  },
  folderName: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
    marginBottom: 2,
  },
  folderCount: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  folderActions: {
    flexDirection: 'row',
    gap: SIZES.XS,
  },
  folderActionButton: {
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[300],
  },
  folderActionButtonDelete: {
    borderColor: COLORS.DANGER,
  },
  folderActionText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
  },
  folderActionTextDelete: {
    color: COLORS.DANGER,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SIZES.PADDING,
    gap: SIZES.MD,
  },
  emptyTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XL,
    color: COLORS.PRIMARY,
  },
  emptyCopy: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.MD,
    color: COLORS.SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyButton: {
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.LG,
    borderRadius: SIZES.BORDER_RADIUS,
    marginTop: SIZES.SM,
  },
  emptyButtonLabel: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.WHITE,
    borderTopLeftRadius: SIZES.CARD_BORDER_RADIUS,
    borderTopRightRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.LG,
    gap: SIZES.LG,
  },
  modalTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XL,
    color: COLORS.PRIMARY,
  },
  inputGroup: {
    gap: SIZES.XS,
  },
  inputLabel: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.GRAY[300],
    borderRadius: SIZES.BORDER_RADIUS,
    paddingHorizontal: SIZES.MD,
    paddingVertical: SIZES.SM,
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.SM,
  },
  colorOption: {
    width: 48,
    height: 48,
    borderRadius: SIZES.BORDER_RADIUS,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: COLORS.PRIMARY,
  },
  colorCheckmark: {
    fontSize: 24,
    color: COLORS.WHITE,
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SIZES.SM,
    marginTop: SIZES.SM,
  },
  modalButton: {
    flex: 1,
    paddingVertical: SIZES.SM + 2,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalButtonCancel: {
    backgroundColor: COLORS.GRAY[200],
  },
  modalButtonSave: {
    backgroundColor: COLORS.PRIMARY,
  },
  modalButtonTextCancel: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.SECONDARY,
  },
  modalButtonTextSave: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
  },
});

export default FolderList;
