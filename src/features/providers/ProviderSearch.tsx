import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { FreeProviderService } from '@/shared/services/FreeProviderService';
import { Provider, TriageRecommendation } from '@/shared/types';
import { COLORS, SIZES, FONTS, PROVIDER_SPECIALTIES, TRIAGE_LEVELS } from '@/shared/constants/AppConstants';

interface ProviderSearchProps {
  triageRecommendation: TriageRecommendation;
  userZipCode: string;
  onProviderSelect: (provider: Provider) => void;
}

export const ProviderSearch: React.FC<ProviderSearchProps> = ({
  triageRecommendation,
  userZipCode,
  onProviderSelect,
}) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSpecialtyModal, setShowSpecialtyModal] = useState(false);
  const [zipCode, setZipCode] = useState(userZipCode);

  const getRecommendedSpecialty = (careLevel: string): string => {
    switch (careLevel) {
      case 'emergency':
        return 'Emergency Medicine';
      case 'urgent_care':
        return 'Emergency Medicine'; // Urgent care often staffed by EM doctors
      case 'primary_care':
        return 'Family Medicine';
      case 'telehealth':
        return 'Family Medicine';
      default:
        return 'Family Medicine';
    }
  };

  const searchProviders = useCallback(async (specialty?: string, location?: string) => {
    setIsLoading(true);
    try {
      const searchSpecialty = specialty || selectedSpecialty || 'Family Medicine';
      const searchLocation = location || zipCode;

      const result = await FreeProviderService.searchProviders(
        searchSpecialty,
        searchLocation,
        25, // 25 mile radius
        20  // limit results
      );

      if (result.success) {
        setProviders(result.providers || []);
      } else {
        Alert.alert('Search Error', result.error || 'Unable to search for providers');
      }
    } catch (error) {
      console.error('Provider search error:', error);
      Alert.alert('Error', 'Unable to search for providers at this time');
    } finally {
      setIsLoading(false);
    }
  }, [selectedSpecialty, zipCode]);

  useEffect(() => {
    // Set initial specialty based on triage recommendation
    const initialSpecialty = getRecommendedSpecialty(triageRecommendation.level);
    setSelectedSpecialty(initialSpecialty);
    searchProviders(initialSpecialty, userZipCode);
  }, [triageRecommendation.level, userZipCode, searchProviders]);

  const handleSearch = () => {
    searchProviders();
  };

  const handleSpecialtySelect = (specialty: string) => {
    setSelectedSpecialty(specialty);
    setShowSpecialtyModal(false);
    searchProviders(specialty);
  };

  const renderTriageInfo = () => {
    const triageInfo = TRIAGE_LEVELS[triageRecommendation.level.toUpperCase() as keyof typeof TRIAGE_LEVELS];

    return (
      <View style={[styles.triageCard, { borderColor: triageInfo.color }]}>
        <Text style={styles.triageIcon}>{triageInfo.icon}</Text>
        <Text style={styles.triageTitle}>Recommended: {triageInfo.title}</Text>
        <Text style={styles.triageSubtitle}>{triageInfo.subtitle}</Text>
        <Text style={styles.triageTimeframe}>Timeframe: {triageRecommendation.timeframe}</Text>
      </View>
    );
  };

  const renderSearchHeader = () => (
    <View style={styles.searchHeader}>
      <Text style={styles.searchTitle}>Find Healthcare Providers</Text>
      <Text style={styles.searchSubtitle}>
        Based on your assessment, we’re showing {selectedSpecialty} providers in your area.
      </Text>

      <View style={styles.searchControls}>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.zipInput]}
            value={zipCode}
            onChangeText={setZipCode}
            placeholder="ZIP Code"
            placeholderTextColor={COLORS.GRAY[400]}
            keyboardType="numeric"
          />

          <TouchableOpacity
            style={styles.specialtyButton}
            onPress={() => setShowSpecialtyModal(true)}
          >
            <Text style={styles.specialtyButtonText}>
              {selectedSpecialty || 'Select Specialty'}
            </Text>
            <Text style={styles.dropdownIcon}>▼</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Search by provider name or practice..."
          placeholderTextColor={COLORS.GRAY[400]}
        />

        <TouchableOpacity
          style={styles.searchButton}
          onPress={handleSearch}
          disabled={isLoading}
        >
          <Text style={styles.searchButtonText}>Search Providers</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderProvider = ({ item: provider }: { item: Provider }) => (
    <TouchableOpacity
      style={styles.providerCard}
      onPress={() => onProviderSelect(provider)}
    >
      <View style={styles.providerHeader}>
        <Text style={styles.providerName}>{provider.name}</Text>
        <Text style={styles.providerSpecialty}>{provider.specialty}</Text>
      </View>

      <View style={styles.providerDetails}>
        <Text style={styles.providerAddress}>
          📍 {provider.location.address}, {provider.location.city}, {provider.location.state} {provider.location.zipCode}
        </Text>

        {provider.contact.phone && (
          <Text style={styles.providerPhone}>📞 {provider.contact.phone}</Text>
        )}

        {provider.credentials.length > 0 && (
          <Text style={styles.providerCredentials}>
            🎓 {provider.credentials.join(', ')}
          </Text>
        )}
      </View>

      <View style={styles.providerFooter}>
        <Text style={styles.npiNumber}>NPI: {provider.id}</Text>
        <TouchableOpacity style={styles.selectButton}>
          <Text style={styles.selectButtonText}>Select Provider</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderSpecialtyModal = () => (
    <Modal
      visible={showSpecialtyModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowSpecialtyModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Select Specialty</Text>

          <FlatList
            data={PROVIDER_SPECIALTIES}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.specialtyOption,
                  selectedSpecialty === item && styles.selectedSpecialtyOption
                ]}
                onPress={() => handleSpecialtySelect(item)}
              >
                <Text style={[
                  styles.specialtyOptionText,
                  selectedSpecialty === item && styles.selectedSpecialtyText
                ]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
            style={styles.specialtyList}
          />

          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setShowSpecialtyModal(false)}
          >
            <Text style={styles.modalCloseText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateIcon}>🔍</Text>
      <Text style={styles.emptyStateTitle}>No Providers Found</Text>
      <Text style={styles.emptyStateText}>
        Try adjusting your search criteria or expanding your search radius.
      </Text>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={() => searchProviders()}
      >
        <Text style={styles.retryButtonText}>Retry Search</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderTriageInfo()}

      <FlatList
        data={providers}
        renderItem={renderProvider}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderSearchHeader}
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        refreshing={isLoading}
        onRefresh={() => searchProviders()}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.PRIMARY} />
          <Text style={styles.loadingText}>Searching providers...</Text>
        </View>
      )}

      {renderSpecialtyModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  triageCard: {
    backgroundColor: COLORS.WHITE,
    margin: SIZES.MD,
    padding: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
    borderWidth: 2,
  },
  triageIcon: {
    fontSize: 32,
    marginBottom: SIZES.XS,
  },
  triageTitle: {
    fontSize: SIZES.FONT.LG,
    fontWeight: 'bold',
    color: COLORS.GRAY[800],
    fontFamily: FONTS.BOLD,
  },
  triageSubtitle: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[600],
    textAlign: 'center',
    fontFamily: FONTS.REGULAR,
  },
  triageTimeframe: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[500],
    marginTop: SIZES.XS,
    fontFamily: FONTS.REGULAR,
  },
  searchHeader: {
    backgroundColor: COLORS.WHITE,
    padding: SIZES.MD,
    marginBottom: SIZES.SM,
  },
  searchTitle: {
    fontSize: SIZES.FONT.TITLE,
    fontWeight: 'bold',
    color: COLORS.PRIMARY,
    marginBottom: SIZES.XS,
    fontFamily: FONTS.BOLD,
  },
  searchSubtitle: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[600],
    marginBottom: SIZES.MD,
    lineHeight: 20,
    fontFamily: FONTS.REGULAR,
  },
  searchControls: {
    gap: SIZES.SM,
  },
  inputRow: {
    flexDirection: 'row',
    gap: SIZES.SM,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.GRAY[300],
    borderRadius: SIZES.BORDER_RADIUS,
    padding: SIZES.SM,
    fontSize: SIZES.FONT.MD,
    backgroundColor: COLORS.WHITE,
    fontFamily: FONTS.REGULAR,
  },
  zipInput: {
    flex: 1,
  },
  specialtyButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.GRAY[300],
    borderRadius: SIZES.BORDER_RADIUS,
    padding: SIZES.SM,
    backgroundColor: COLORS.WHITE,
  },
  specialtyButtonText: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[700],
    fontFamily: FONTS.REGULAR,
  },
  dropdownIcon: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[500],
    fontFamily: FONTS.REGULAR,
  },
  searchButton: {
    backgroundColor: COLORS.PRIMARY,
    borderRadius: SIZES.BORDER_RADIUS,
    padding: SIZES.SM,
    alignItems: 'center',
    height: SIZES.BUTTON_HEIGHT,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: COLORS.WHITE,
    fontSize: SIZES.FONT.LG,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  listContent: {
    paddingBottom: SIZES.XL,
  },
  providerCard: {
    backgroundColor: COLORS.WHITE,
    marginHorizontal: SIZES.MD,
    marginBottom: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    padding: SIZES.MD,
    shadowColor: COLORS.BLACK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  providerHeader: {
    marginBottom: SIZES.SM,
  },
  providerName: {
    fontSize: SIZES.FONT.LG,
    fontWeight: 'bold',
    color: COLORS.GRAY[800],
    fontFamily: FONTS.BOLD,
  },
  providerSpecialty: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
    fontFamily: FONTS.REGULAR,
  },
  providerDetails: {
    marginBottom: SIZES.SM,
    gap: SIZES.XS,
  },
  providerAddress: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[600],
    fontFamily: FONTS.REGULAR,
  },
  providerPhone: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[600],
    fontFamily: FONTS.REGULAR,
  },
  providerCredentials: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[600],
    fontFamily: FONTS.REGULAR,
  },
  providerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  npiNumber: {
    fontSize: SIZES.FONT.XS,
    color: COLORS.GRAY[400],
    fontFamily: FONTS.REGULAR,
  },
  selectButton: {
    backgroundColor: COLORS.SUCCESS,
    borderRadius: SIZES.BORDER_RADIUS,
    paddingHorizontal: SIZES.MD,
    paddingVertical: SIZES.XS,
  },
  selectButtonText: {
    color: COLORS.WHITE,
    fontSize: SIZES.FONT.SM,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SIZES.XXL,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: SIZES.MD,
  },
  emptyStateTitle: {
    fontSize: SIZES.FONT.XL,
    fontWeight: 'bold',
    color: COLORS.GRAY[600],
    marginBottom: SIZES.SM,
    fontFamily: FONTS.BOLD,
  },
  emptyStateText: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[500],
    textAlign: 'center',
    marginBottom: SIZES.MD,
    paddingHorizontal: SIZES.LG,
    fontFamily: FONTS.REGULAR,
  },
  retryButton: {
    backgroundColor: COLORS.GRAY[400],
    borderRadius: SIZES.BORDER_RADIUS,
    paddingHorizontal: SIZES.LG,
    paddingVertical: SIZES.SM,
  },
  retryButtonText: {
    color: COLORS.WHITE,
    fontSize: SIZES.FONT.MD,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.WHITE,
    fontSize: SIZES.FONT.LG,
    marginTop: SIZES.SM,
    fontFamily: FONTS.REGULAR,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.WHITE,
    borderRadius: SIZES.BORDER_RADIUS,
    padding: SIZES.LG,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: SIZES.FONT.XL,
    fontWeight: 'bold',
    color: COLORS.GRAY[800],
    textAlign: 'center',
    marginBottom: SIZES.MD,
    fontFamily: FONTS.BOLD,
  },
  specialtyList: {
    maxHeight: 400,
  },
  specialtyOption: {
    padding: SIZES.SM,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.GRAY[200],
  },
  selectedSpecialtyOption: {
    backgroundColor: COLORS.PRIMARY,
  },
  specialtyOptionText: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[700],
    fontFamily: FONTS.REGULAR,
  },
  selectedSpecialtyText: {
    color: COLORS.WHITE,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  modalCloseButton: {
    backgroundColor: COLORS.GRAY[400],
    borderRadius: SIZES.BORDER_RADIUS,
    padding: SIZES.SM,
    alignItems: 'center',
    marginTop: SIZES.MD,
  },
  modalCloseText: {
    color: COLORS.WHITE,
    fontSize: SIZES.FONT.MD,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
});
