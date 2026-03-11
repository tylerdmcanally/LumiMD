/**
 * Upload AVS Screen
 * Allows patients to photograph an After Visit Summary or upload a PDF
 * to extract structured visit data via GPT-4o Vision.
 *
 * Supports multi-page AVS: users can capture/select multiple photos before uploading.
 *
 * Flow: Choose method → Capture/Pick → Preview (add more) → Upload all → Processing
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Colors, spacing, Radius } from '../components/ui';
import { uploadDocumentFile, UploadProgress } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api/client';

type ScreenState = 'choose' | 'preview' | 'uploading' | 'processing' | 'error';

interface SelectedDocument {
  uri: string;
  contentType: 'image/jpeg' | 'image/png' | 'application/pdf';
  fileName?: string;
}

export default function UploadAVSScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [state, setState] = useState<ScreenState>('choose');
  const [documents, setDocuments] = useState<SelectedDocument[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // Whether we're in image mode (multi-page) or PDF mode (single file)
  const isPdfMode = documents.length > 0 && documents[0].contentType === 'application/pdf';

  const addImageDocument = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    const contentType = asset.mimeType === 'image/png' ? 'image/png' as const : 'image/jpeg' as const;
    const doc: SelectedDocument = {
      uri: asset.uri,
      contentType,
      fileName: asset.fileName || undefined,
    };
    setDocuments(prev => [...prev, doc]);
    setState('preview');
  }, []);

  const handleCamera = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Camera Access Needed',
          'Please allow camera access in Settings to photograph your visit summary.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        addImageDocument(result.assets[0]);
      }
    } catch (error) {
      console.error('[UploadAVS] Camera error:', error);
      Alert.alert('Error', 'Could not open camera. Please try again.');
    }
  }, [addImageDocument]);

  const handleGallery = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo Access Needed',
          'Please allow photo library access in Settings to select your visit summary.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 10,
      });

      if (!result.canceled && result.assets.length > 0) {
        const newDocs: SelectedDocument[] = result.assets.map(asset => ({
          uri: asset.uri,
          contentType: asset.mimeType === 'image/png' ? 'image/png' as const : 'image/jpeg' as const,
          fileName: asset.fileName || undefined,
        }));
        setDocuments(prev => [...prev, ...newDocs]);
        setState('preview');
      }
    } catch (error) {
      console.error('[UploadAVS] Gallery error:', error);
      Alert.alert('Error', 'Could not open photo library. Please try again.');
    }
  }, []);

  const handlePDF = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setDocuments([{
          uri: asset.uri,
          contentType: 'application/pdf',
          fileName: asset.name || undefined,
        }]);
        setState('preview');
      }
    } catch (error) {
      console.error('[UploadAVS] PDF picker error:', error);
      Alert.alert('Error', 'Could not select file. Please try again.');
    }
  }, []);

  const handleRemovePage = useCallback((index: number) => {
    setDocuments(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setState('choose');
      }
      return next;
    });
  }, []);

  const handleStartOver = useCallback(() => {
    setDocuments([]);
    setState('choose');
    setUploadProgress(0);
    setErrorMessage('');
  }, []);

  const handleUpload = useCallback(async () => {
    if (documents.length === 0 || !user) return;

    setState('uploading');
    setUploadProgress(0);

    try {
      const totalFiles = documents.length;
      const storagePaths: string[] = [];

      // Upload each file
      for (let i = 0; i < totalFiles; i++) {
        const doc = documents[i];
        const uploaded = await uploadDocumentFile(
          doc.uri,
          user.uid,
          doc.contentType,
          (progress: UploadProgress) => {
            // Weighted progress across all files
            const fileWeight = 1 / totalFiles;
            const overallProgress = (i * fileWeight + (progress.progress / 100) * fileWeight) * 100;
            setUploadProgress(Math.round(overallProgress));
          }
        );
        storagePaths.push(uploaded.storagePath);
      }

      setUploadProgress(100);
      setState('processing');

      // Determine source type
      const firstDoc = documents[0];
      const documentType = firstDoc.contentType === 'application/pdf' ? 'avs_pdf' as const : 'avs_photo' as const;
      const source = firstDoc.contentType === 'application/pdf' ? 'avs_pdf' as const : 'avs_photo' as const;

      // Create visit record — single path for single file, array for multi
      const documentStoragePath = storagePaths.length === 1 ? storagePaths[0] : storagePaths;

      const visit = await api.visits.create({
        status: 'processing',
        source,
        documentStoragePath,
        documentType,
      });

      // Trigger document processing
      await api.visits.processDocument(visit.id);

      Alert.alert(
        'Processing Your Summary',
        `We're reading your ${totalFiles > 1 ? `${totalFiles}-page ` : ''}visit summary now. You'll see the results in your visit list shortly.`,
        [{ text: 'OK', onPress: () => router.replace('/') }]
      );
    } catch (error) {
      console.error('[UploadAVS] Upload/processing error:', error);
      const message = error instanceof Error ? error.message : 'Upload failed';
      setErrorMessage(message);
      setState('error');
    }
  }, [documents, user, router]);

  const renderChooseScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerSection}>
        <View style={styles.iconCircle}>
          <Ionicons name="document-text-outline" size={32} color={Colors.primary} />
        </View>
        <Text style={styles.heading}>Upload Visit Summary</Text>
        <Text style={styles.subheading}>
          Take photos of your After Visit Summary or upload a PDF from your patient portal.
        </Text>
      </View>

      <View style={styles.optionsContainer}>
        <Pressable
          style={({ pressed }) => [styles.optionCard, pressed && styles.optionPressed]}
          onPress={handleCamera}
          accessibilityLabel="Take a photo of your visit summary"
        >
          <View style={[styles.optionIcon, { backgroundColor: 'rgba(64,201,208,0.1)' }]}>
            <Ionicons name="camera-outline" size={28} color={Colors.primary} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Take a Photo</Text>
            <Text style={styles.optionDesc}>Photograph each page of your summary</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.optionCard, pressed && styles.optionPressed]}
          onPress={handleGallery}
          accessibilityLabel="Choose photos from your library"
        >
          <View style={[styles.optionIcon, { backgroundColor: 'rgba(64,201,208,0.1)' }]}>
            <Ionicons name="images-outline" size={28} color={Colors.primary} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Choose from Photos</Text>
            <Text style={styles.optionDesc}>Select one or more existing photos</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.optionCard, pressed && styles.optionPressed]}
          onPress={handlePDF}
          accessibilityLabel="Upload a PDF of your visit summary"
        >
          <View style={[styles.optionIcon, { backgroundColor: 'rgba(224,122,95,0.1)' }]}>
            <Ionicons name="document-outline" size={28} color="#E07A5F" />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Upload PDF</Text>
            <Text style={styles.optionDesc}>From your patient portal download</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </Pressable>
      </View>

      <View style={styles.tipBox}>
        <Ionicons name="bulb-outline" size={18} color={Colors.primary} style={{ marginTop: 2 }} />
        <Text style={styles.tipText}>
          For multi-page summaries, take a photo of each page. You can add pages one at a time before uploading.
        </Text>
      </View>
    </ScrollView>
  );

  const renderPreview = () => (
    <View style={styles.previewContainer}>
      {isPdfMode ? (
        /* PDF single-file preview */
        <View style={styles.pdfPreview}>
          <Ionicons name="document-text" size={64} color={Colors.primary} />
          <Text style={styles.pdfFileName}>{documents[0].fileName || 'Selected PDF'}</Text>
        </View>
      ) : (
        /* Multi-image preview grid */
        <ScrollView style={styles.imageGrid} contentContainerStyle={styles.imageGridContent}>
          <Text style={styles.pageCountLabel}>
            {documents.length} {documents.length === 1 ? 'page' : 'pages'}
          </Text>

          <View style={styles.thumbnailGrid}>
            {documents.map((doc, index) => (
              <View key={`${doc.uri}-${index}`} style={styles.thumbnailWrapper}>
                <Image source={{ uri: doc.uri }} style={styles.thumbnail} resizeMode="cover" />
                <View style={styles.pageNumberBadge}>
                  <Text style={styles.pageNumberText}>{index + 1}</Text>
                </View>
                <Pressable
                  style={styles.removeBadge}
                  onPress={() => handleRemovePage(index)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={22} color="#E07A5F" />
                </Pressable>
              </View>
            ))}

            {/* Add more button */}
            <Pressable
              style={styles.addMoreTile}
              onPress={() => {
                Alert.alert('Add Page', 'How would you like to add another page?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Take Photo', onPress: handleCamera },
                  { text: 'From Photos', onPress: handleGallery },
                ]);
              }}
            >
              <Ionicons name="add-circle-outline" size={32} color={Colors.primary} />
              <Text style={styles.addMoreText}>Add page</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      <View style={styles.previewQuestion}>
        <Text style={styles.previewQuestionText}>
          {isPdfMode
            ? 'Upload this document?'
            : documents.length === 1
              ? 'Is the text readable? Add more pages if needed.'
              : `Ready to upload ${documents.length} pages?`}
        </Text>
      </View>

      <View style={styles.previewActions}>
        <Pressable
          style={[styles.previewButton, styles.retakeButton]}
          onPress={handleStartOver}
        >
          <Ionicons name="refresh-outline" size={20} color="#666" />
          <Text style={styles.retakeText}>Start Over</Text>
        </Pressable>

        <Pressable
          style={[styles.previewButton, styles.uploadButton]}
          onPress={handleUpload}
        >
          <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
          <Text style={styles.uploadText}>
            Upload{documents.length > 1 ? ` (${documents.length})` : ''}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderUploading = () => (
    <View style={styles.statusContainer}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.statusTitle}>
        Uploading{documents.length > 1 ? ` ${documents.length} pages` : ''}...
      </Text>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
      </View>
      <Text style={styles.statusSubtext}>{uploadProgress}% complete</Text>
    </View>
  );

  const renderProcessing = () => (
    <View style={styles.statusContainer}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.statusTitle}>Reading your visit summary...</Text>
      <Text style={styles.statusSubtext}>
        This usually takes about 15-30 seconds.
      </Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.statusContainer}>
      <View style={[styles.iconCircle, { backgroundColor: 'rgba(224,122,95,0.1)' }]}>
        <Ionicons name="alert-circle-outline" size={32} color="#E07A5F" />
      </View>
      <Text style={styles.statusTitle}>Something went wrong</Text>
      <Text style={styles.statusSubtext}>{errorMessage}</Text>
      <Pressable style={styles.retryButton} onPress={handleStartOver}>
        <Text style={styles.retryText}>Try Again</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </Pressable>
        <Text style={styles.headerTitle}>Upload Summary</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      {state === 'choose' && renderChooseScreen()}
      {state === 'preview' && renderPreview()}
      {state === 'uploading' && renderUploading()}
      {state === 'processing' && renderProcessing()}
      {state === 'error' && renderError()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDFCF9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(38,35,28,0.08)',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#1a1a1a',
  },
  scrollContent: {
    padding: spacing(5),
    paddingBottom: spacing(10),
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: spacing(6),
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(64,201,208,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing(3),
  },
  heading: {
    fontSize: 24,
    fontFamily: 'Fraunces_700Bold',
    color: '#1a1a1a',
    marginBottom: spacing(2),
    textAlign: 'center',
  },
  subheading: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  optionsContainer: {
    gap: spacing(3),
    marginBottom: spacing(5),
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: Radius.lg,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: 'rgba(38,35,28,0.08)',
  },
  optionPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#1a1a1a',
  },
  optionDesc: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#999',
    marginTop: 2,
  },
  tipBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(64,201,208,0.06)',
    borderRadius: Radius.md,
    padding: spacing(4),
    gap: spacing(2),
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#555',
    lineHeight: 19,
  },
  // Preview
  previewContainer: {
    flex: 1,
    padding: spacing(4),
  },
  pdfPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: Radius.lg,
  },
  pdfFileName: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#333',
    marginTop: spacing(3),
  },
  imageGrid: {
    flex: 1,
  },
  imageGridContent: {
    paddingBottom: spacing(2),
  },
  pageCountLabel: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#555',
    marginBottom: spacing(3),
    textAlign: 'center',
  },
  thumbnailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing(3),
  },
  thumbnailWrapper: {
    width: '47%',
    aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  pageNumberBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageNumberText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  removeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#fff',
    borderRadius: 11,
  },
  addMoreTile: {
    width: '47%',
    aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: 'rgba(64,201,208,0.3)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
  },
  addMoreText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.primary,
  },
  previewQuestion: {
    alignItems: 'center',
    marginVertical: spacing(4),
  },
  previewQuestionText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  previewActions: {
    flexDirection: 'row',
    gap: spacing(3),
  },
  previewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing(3.5),
    borderRadius: Radius.lg,
    gap: spacing(2),
  },
  retakeButton: {
    backgroundColor: '#f0f0f0',
  },
  uploadButton: {
    backgroundColor: Colors.primary,
  },
  retakeText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#666',
  },
  uploadText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#fff',
  },
  // Status screens
  statusContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(6),
  },
  statusTitle: {
    fontSize: 20,
    fontFamily: 'Fraunces_700Bold',
    color: '#1a1a1a',
    marginTop: spacing(4),
    textAlign: 'center',
  },
  statusSubtext: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#888',
    marginTop: spacing(2),
    textAlign: 'center',
    lineHeight: 21,
  },
  progressBar: {
    width: '80%',
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    marginTop: spacing(4),
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  retryButton: {
    marginTop: spacing(5),
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(3),
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
  },
  retryText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#fff',
  },
});
