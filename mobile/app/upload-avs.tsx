/**
 * Upload AVS Screen
 * Allows patients to photograph an After Visit Summary or upload a PDF
 * to extract structured visit data via GPT-4o Vision.
 *
 * Flow: Choose method → Capture/Pick → Preview → Upload → Processing
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
  const [document, setDocument] = useState<SelectedDocument | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

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
        const asset = result.assets[0];
        const contentType = asset.mimeType === 'image/png' ? 'image/png' as const : 'image/jpeg' as const;
        setDocument({
          uri: asset.uri,
          contentType,
          fileName: asset.fileName || undefined,
        });
        setState('preview');
      }
    } catch (error) {
      console.error('[UploadAVS] Camera error:', error);
      Alert.alert('Error', 'Could not open camera. Please try again.');
    }
  }, []);

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
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const contentType = asset.mimeType === 'image/png' ? 'image/png' as const : 'image/jpeg' as const;
        setDocument({
          uri: asset.uri,
          contentType,
          fileName: asset.fileName || undefined,
        });
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
        setDocument({
          uri: asset.uri,
          contentType: 'application/pdf',
          fileName: asset.name || undefined,
        });
        setState('preview');
      }
    } catch (error) {
      console.error('[UploadAVS] PDF picker error:', error);
      Alert.alert('Error', 'Could not select file. Please try again.');
    }
  }, []);

  const handleRetake = useCallback(() => {
    setDocument(null);
    setState('choose');
    setUploadProgress(0);
    setErrorMessage('');
  }, []);

  const handleUpload = useCallback(async () => {
    if (!document || !user) return;

    setState('uploading');
    setUploadProgress(0);

    try {
      // Upload to Firebase Storage
      const uploaded = await uploadDocumentFile(
        document.uri,
        user.uid,
        document.contentType,
        (progress: UploadProgress) => {
          setUploadProgress(Math.round(progress.progress));
        }
      );

      setState('processing');

      // Determine source type
      const documentType = document.contentType === 'application/pdf' ? 'avs_pdf' as const : 'avs_photo' as const;
      const source = document.contentType === 'application/pdf' ? 'avs_pdf' as const : 'avs_photo' as const;

      // Create visit record
      const visit = await api.visits.create({
        status: 'processing',
        source,
        documentStoragePath: uploaded.storagePath,
        documentType,
      });

      // Trigger document processing
      await api.visits.processDocument(visit.id);

      // Navigate home — user will see the visit processing in their visit list
      Alert.alert(
        'Processing Your Summary',
        'We\'re reading your visit summary now. You\'ll see the results in your visit list shortly.',
        [{ text: 'OK', onPress: () => router.replace('/') }]
      );
    } catch (error) {
      console.error('[UploadAVS] Upload/processing error:', error);
      const message = error instanceof Error ? error.message : 'Upload failed';
      setErrorMessage(message);
      setState('error');
    }
  }, [document, user, router]);

  const renderChooseScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerSection}>
        <View style={styles.iconCircle}>
          <Ionicons name="document-text-outline" size={32} color={Colors.primary} />
        </View>
        <Text style={styles.heading}>Upload Visit Summary</Text>
        <Text style={styles.subheading}>
          Take a photo of your After Visit Summary or upload a PDF from your patient portal.
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
            <Text style={styles.optionDesc}>Hold phone flat over the document</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.optionCard, pressed && styles.optionPressed]}
          onPress={handleGallery}
          accessibilityLabel="Choose a photo from your library"
        >
          <View style={[styles.optionIcon, { backgroundColor: 'rgba(64,201,208,0.1)' }]}>
            <Ionicons name="images-outline" size={28} color={Colors.primary} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Choose from Photos</Text>
            <Text style={styles.optionDesc}>Select an existing photo</Text>
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
          For best results, make sure the text is clear and readable. Good lighting and a flat surface help with photos.
        </Text>
      </View>
    </ScrollView>
  );

  const renderPreview = () => (
    <View style={styles.previewContainer}>
      {document?.contentType === 'application/pdf' ? (
        <View style={styles.pdfPreview}>
          <Ionicons name="document-text" size={64} color={Colors.primary} />
          <Text style={styles.pdfFileName}>{document.fileName || 'Selected PDF'}</Text>
        </View>
      ) : (
        <Image
          source={{ uri: document?.uri }}
          style={styles.previewImage}
          resizeMode="contain"
        />
      )}

      <View style={styles.previewQuestion}>
        <Text style={styles.previewQuestionText}>
          {document?.contentType === 'application/pdf'
            ? 'Upload this document?'
            : 'Is the text readable?'}
        </Text>
      </View>

      <View style={styles.previewActions}>
        <Pressable
          style={[styles.previewButton, styles.retakeButton]}
          onPress={handleRetake}
        >
          <Ionicons name="refresh-outline" size={20} color="#666" />
          <Text style={styles.retakeText}>
            {document?.contentType === 'application/pdf' ? 'Choose Different' : 'Retake'}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.previewButton, styles.uploadButton]}
          onPress={handleUpload}
        >
          <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
          <Text style={styles.uploadText}>Upload</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderUploading = () => (
    <View style={styles.statusContainer}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.statusTitle}>Uploading...</Text>
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
      <Pressable style={styles.retryButton} onPress={handleRetake}>
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
  previewImage: {
    flex: 1,
    borderRadius: Radius.lg,
    backgroundColor: '#f0f0f0',
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
  previewQuestion: {
    alignItems: 'center',
    marginVertical: spacing(4),
  },
  previewQuestionText: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#1a1a1a',
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
