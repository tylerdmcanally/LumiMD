import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  Linking,
} from 'react-native';

import { PlacesService, HealthcareFacility } from '@/shared/services/PlacesService';
import { COLORS, SIZES, FONTS } from '@/shared/constants/AppConstants';
import { TriageRecommendation } from '@/shared/types';

// Map HealthcareFacility to Facility for compatibility
interface Facility {
  id: string;
  name: string;
  type: string;
  address: string;
  phone: string;
  distance: number;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  acceptedInsurance?: any[];
  rating?: number;
  insuranceVerified?: boolean;
  insuranceSource?: string;
  estimatedWaitTime?: string;
  operatingHours?: {
    [key: string]: string;
  };
  services?: string[];
  website?: string;
  open_now?: boolean;
}

interface FacilityResultsProps {
  recommendation: TriageRecommendation;
  onBack: () => void;
  onBookAppointment?: (facility: Facility) => void;
}

export const FacilityResults: React.FC<FacilityResultsProps> = ({
  recommendation,
  onBack,
  onBookAppointment,
}) => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const loadFacilities = useCallback(async () => {
    try {
      console.log('FacilityResults: Starting to load facilities...');
      console.log('FacilityResults: Recommendation level:', recommendation.level);
      setIsLoading(true);

      // Map triage level to facility type
      const facilityType = PlacesService.triageLevelToFacilityType(recommendation.level);
      console.log('FacilityResults: Mapped facility type:', facilityType);

      // Search for facilities using PlacesService (calls backend)
      console.log('FacilityResults: Searching for facilities via PlacesService...');
      const result = await PlacesService.searchNearbyFacilities(facilityType);

      console.log('FacilityResults: PlacesService returned:', result);
      console.log('FacilityResults: Found facilities count:', result.results.length);

      // Map HealthcareFacility to Facility interface and fetch details for each
      const mappedFacilities: Facility[] = await Promise.all(
        result.results.slice(0, 10).map(async (place: HealthcareFacility) => {
          // Fetch detailed place info including operating hours
          let operatingHours = getDefaultOperatingHours(facilityType);
          let phone = place.formatted_phone_number || 'Call for info';
          let website = place.website;

          try {
            const details = await PlacesService.getFacilityDetails(place.place_id);

            // Parse opening hours if available
            if (details.opening_hours?.weekday_text) {
              operatingHours = parseOpeningHours(details.opening_hours.weekday_text);
            }

            // Update phone and website from details
            if (details.formatted_phone_number) {
              phone = details.formatted_phone_number;
            }
            if (details.website) {
              website = details.website;
            }
          } catch (error) {
            console.log(`Could not fetch details for ${place.name}:`, error);
          }

          return {
            id: place.place_id,
            name: place.name,
            type: facilityType,
            address: place.vicinity || place.formatted_address || 'Address not available',
            phone,
            distance: place.distance || 0,
            coordinates: {
              latitude: place.geometry.location.lat,
              longitude: place.geometry.location.lng
            },
            rating: place.rating || 0,
            open_now: place.opening_hours?.open_now,
            website,
            operatingHours,
            services: getDefaultServices(facilityType)
          };
        })
      );

      if (mappedFacilities.length > 0) {
        console.log('FacilityResults: First facility sample:', {
          name: mappedFacilities[0].name,
          type: mappedFacilities[0].type,
          distance: mappedFacilities[0].distance
        });
      } else {
        console.warn('FacilityResults: No facilities found');
      }

      setFacilities(mappedFacilities);

    } catch (error) {
      console.error('FacilityResults: Error loading facilities:', error);
      Alert.alert('Error', 'Unable to load facilities. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [recommendation]);

  useEffect(() => {
    loadFacilities();
  }, [loadFacilities]);

  const getDefaultOperatingHours = (facilityType: string): { [key: string]: string } => {
    if (facilityType === 'emergency') {
      return {
        'Monday': '24 hours',
        'Tuesday': '24 hours',
        'Wednesday': '24 hours',
        'Thursday': '24 hours',
        'Friday': '24 hours',
        'Saturday': '24 hours',
        'Sunday': '24 hours'
      };
    } else if (facilityType === 'urgent_care') {
      return {
        'Monday': '8:00 AM - 8:00 PM',
        'Tuesday': '8:00 AM - 8:00 PM',
        'Wednesday': '8:00 AM - 8:00 PM',
        'Thursday': '8:00 AM - 8:00 PM',
        'Friday': '8:00 AM - 8:00 PM',
        'Saturday': '9:00 AM - 6:00 PM',
        'Sunday': '9:00 AM - 6:00 PM'
      };
    } else {
      return {
        'Monday': '9:00 AM - 5:00 PM',
        'Tuesday': '9:00 AM - 5:00 PM',
        'Wednesday': '9:00 AM - 5:00 PM',
        'Thursday': '9:00 AM - 5:00 PM',
        'Friday': '9:00 AM - 5:00 PM',
        'Saturday': 'Closed',
        'Sunday': 'Closed'
      };
    }
  };

  const getDefaultServices = (facilityType: string): string[] => {
    if (facilityType === 'emergency') {
      return ['Emergency Care', 'Trauma', 'Critical Care', 'Surgery'];
    } else if (facilityType === 'urgent_care') {
      return ['Walk-in Care', 'Minor Injuries', 'Illness Treatment', 'X-rays'];
    } else {
      return ['Primary Care', 'Preventive Care', 'Chronic Disease Management'];
    }
  };

  const parseOpeningHours = (weekdayText: string[]): { [key: string]: string } => {
    const hours: { [key: string]: string } = {};

    weekdayText.forEach((dayText) => {
      // Format: "Monday: 9:00 AM – 5:00 PM" or "Monday: Closed"
      const parts = dayText.split(': ');
      if (parts.length === 2) {
        const day = parts[0];
        const time = parts[1];
        hours[day] = time;
      }
    });

    return hours;
  };

  const handleCallFacility = (phone: string) => {
    const phoneUrl = `tel:${phone.replace(/[^\d]/g, '')}`;
    Linking.openURL(phoneUrl);
  };

  const handleGetDirections = async (facility: Facility) => {
    try {
      // Open in maps app with place ID for more accurate directions
      const destination = `${facility.coordinates.latitude},${facility.coordinates.longitude}`;
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}&destination_place_id=${facility.id}`;
      await Linking.openURL(mapsUrl);
    } catch (error) {
      console.error('FacilityResults: Unable to open directions', error);
      Alert.alert('Error', 'Unable to open directions.');
    }
  };

  const handleVisitWebsite = (website?: string) => {
    if (website) {
      Linking.openURL(website.startsWith('http') ? website : `https://${website}`);
    }
  };

  const handleInsuranceInfo = (insurance: any) => {
    Alert.alert(
      insurance.name,
      `Plans: ${insurance.plans.join(', ')}\n\nPhone: ${insurance.phoneNumber}\n\nWebsite: ${insurance.website}\n\nNote: Please verify your specific plan coverage with the provider before your visit.`,
      [
        { text: 'Call Insurance', onPress: () => Linking.openURL(`tel:${insurance.phoneNumber.replace(/[^\d]/g, '')}`) },
        { text: 'Visit Website', onPress: () => Linking.openURL(`https://${insurance.website}`) },
        { text: 'Close', style: 'cancel' }
      ]
    );
  };

  const renderInsuranceChips = (facility: Facility) => {
    const acceptedInsurance = facility.acceptedInsurance ?? [];
    const hasVerifiedInsurance = facility.insuranceVerified && acceptedInsurance.length > 0;

    return (
      <View style={styles.insuranceContainer}>
        <View style={styles.insuranceHeader}>
          <Text style={styles.insuranceTitle}>Insurance Information:</Text>
          {hasVerifiedInsurance && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          )}
        </View>

        {hasVerifiedInsurance ? (
          <>
            <View style={styles.insuranceChips}>
              {acceptedInsurance.slice(0, 4).map((insurance, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.insuranceChip}
                  onPress={() => handleInsuranceInfo(insurance)}
                >
                  <Text style={styles.insuranceChipText}>{insurance.name}</Text>
                </TouchableOpacity>
              ))}
              {acceptedInsurance.length > 4 && (
                <View style={styles.insuranceChip}>
                  <Text style={styles.insuranceChipText}>
                    +{acceptedInsurance.length - 4} more
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.insuranceSource}>
              Source: {facility.insuranceSource?.toUpperCase() || 'API'}
            </Text>
          </>
        ) : (
          <View style={styles.noInsuranceData}>
            <Text style={styles.noInsuranceText}>
              Insurance acceptance not verified. Please contact the facility directly to confirm your coverage.
            </Text>
            <View style={styles.insuranceActions}>
              <TouchableOpacity
                style={styles.callInsuranceButton}
                onPress={() => handleCallFacility(facility.phone)}
              >
                <Text style={styles.callInsuranceButtonText}>Call Facility</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderFacilityCard = (facility: Facility) => (
    <View key={facility.id} style={styles.facilityCard}>
      <View style={styles.facilityHeader}>
        <View style={styles.facilityInfo}>
          <Text style={styles.facilityName}>{facility.name}</Text>
          <Text style={styles.facilityType}>{facility.type.replace('_', ' ').toUpperCase()}</Text>
        </View>
        <View style={styles.facilityMeta}>
          <Text style={styles.distance}>
            {PlacesService.formatDistance(facility.distance)}
          </Text>
          <View style={styles.ratingContainer}>
            <Text style={styles.rating}>★ {facility.rating?.toFixed(1) || 'N/A'}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.address}>{facility.address}</Text>

      {facility.estimatedWaitTime && (
        <View style={styles.waitTimeContainer}>
          <Text style={styles.waitTimeLabel}>Estimated Wait:</Text>
          <Text style={styles.waitTime}>{facility.estimatedWaitTime}</Text>
        </View>
      )}

      <View style={styles.servicesContainer}>
        <Text style={styles.servicesTitle}>Services:</Text>
        <Text style={styles.services}>{facility.services.join(', ')}</Text>
      </View>

      {renderInsuranceChips(facility)}

      <View style={styles.hoursContainer}>
        <Text style={styles.hoursTitle}>Today’s Hours:</Text>
        <Text style={styles.hours}>
          {facility.operatingHours[getDayOfWeek()] || 'Call for hours'}
        </Text>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.callButton}
          onPress={() => handleCallFacility(facility.phone)}
        >
          <Text style={styles.callButtonText}>Call</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.directionsButton}
          onPress={() => handleGetDirections(facility)}
        >
          <Text style={styles.directionsButtonText}>Directions</Text>
        </TouchableOpacity>

        {facility.website && (
          <TouchableOpacity
            style={styles.websiteButton}
            onPress={() => handleVisitWebsite(facility.website)}
          >
            <Text style={styles.websiteButtonText}>Website</Text>
          </TouchableOpacity>
        )}

        {onBookAppointment && (
          <TouchableOpacity
            style={styles.bookButton}
            onPress={() => onBookAppointment(facility)}
          >
            <Text style={styles.bookButtonText}>Book Appointment</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const getDayOfWeek = () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  };

  const renderRecommendationHeader = () => (
    <View style={styles.recommendationHeader}>
      <Text style={styles.recommendationTitle}>Recommended Care Level</Text>
      <View style={styles.recommendationCard}>
        <Text style={styles.recommendationLevel}>
          {recommendation.level.replace('_', ' ').toUpperCase()}
        </Text>
        <Text style={styles.recommendationTimeframe}>
          {recommendation.timeframe}
        </Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Finding nearby facilities...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nearby Facilities</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {renderRecommendationHeader()}

        <View style={styles.facilitiesSection}>
          <Text style={styles.sectionTitle}>
            Found {facilities.length} facilities near you
          </Text>

          {facilities.length === 0 ? (
            <View style={styles.noResultsContainer}>
              <Text style={styles.noResultsText}>
                No facilities found in your area. Please try expanding your search radius or contact your insurance provider.
              </Text>
            </View>
          ) : (
            facilities.map(renderFacilityCard)
          )}
        </View>

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            Insurance information shown is verified through official sources when possible. Coverage may vary by specific plan details. Always confirm acceptance with both your insurance provider and the facility before your visit.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.LG,
    paddingVertical: SIZES.MD,
    backgroundColor: COLORS.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.GRAY[100],
  },
  backButton: {
    marginRight: SIZES.MD,
  },
  backButtonText: {
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
    fontFamily: FONTS.MEDIUM,
  },
  headerTitle: {
    fontSize: SIZES.FONT.XL,
    fontWeight: '600',
    color: COLORS.GRAY[900],
    fontFamily: FONTS.SEMIBOLD,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: SIZES.FONT.LG,
    color: COLORS.GRAY[600],
    fontFamily: FONTS.REGULAR,
  },
  recommendationHeader: {
    backgroundColor: COLORS.WHITE,
    margin: SIZES.LG,
    padding: SIZES.LG,
    borderRadius: SIZES.BORDER_RADIUS,
    ...SIZES.SHADOW.LIGHT,
  },
  recommendationTitle: {
    fontSize: SIZES.FONT.LG,
    fontWeight: '600',
    color: COLORS.GRAY[900],
    marginBottom: SIZES.MD,
    fontFamily: FONTS.SEMIBOLD,
  },
  recommendationCard: {
    backgroundColor: COLORS.PRIMARY + '15',
    padding: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.PRIMARY,
  },
  recommendationLevel: {
    fontSize: SIZES.FONT.LG,
    fontWeight: '700',
    color: COLORS.PRIMARY,
    fontFamily: FONTS.BOLD,
  },
  recommendationTimeframe: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[700],
    marginTop: SIZES.XS,
    fontFamily: FONTS.REGULAR,
  },
  facilitiesSection: {
    paddingHorizontal: SIZES.LG,
  },
  sectionTitle: {
    fontSize: SIZES.FONT.LG,
    fontWeight: '600',
    color: COLORS.GRAY[900],
    marginBottom: SIZES.LG,
    fontFamily: FONTS.SEMIBOLD,
  },
  facilityCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: SIZES.BORDER_RADIUS,
    padding: SIZES.LG,
    marginBottom: SIZES.LG,
    ...SIZES.SHADOW.LIGHT,
    borderWidth: 1,
    borderColor: COLORS.GRAY[100],
  },
  facilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SIZES.MD,
  },
  facilityInfo: {
    flex: 1,
  },
  facilityName: {
    fontSize: SIZES.FONT.LG,
    fontWeight: '600',
    color: COLORS.GRAY[900],
    fontFamily: FONTS.SEMIBOLD,
    marginBottom: SIZES.XS,
  },
  facilityType: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
    fontWeight: '500',
    fontFamily: FONTS.MEDIUM,
  },
  facilityMeta: {
    alignItems: 'flex-end',
  },
  distance: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[600],
    fontFamily: FONTS.REGULAR,
    marginBottom: SIZES.XS,
  },
  ratingContainer: {
    backgroundColor: COLORS.SUCCESS + '20',
    paddingHorizontal: SIZES.SM,
    paddingVertical: 2,
    borderRadius: 12,
  },
  rating: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.SUCCESS,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  address: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[700],
    fontFamily: FONTS.REGULAR,
    marginBottom: SIZES.MD,
  },
  waitTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.MD,
  },
  waitTimeLabel: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[600],
    fontFamily: FONTS.REGULAR,
    marginRight: SIZES.SM,
  },
  waitTime: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.WARNING,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  servicesContainer: {
    marginBottom: SIZES.MD,
  },
  servicesTitle: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[700],
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
    marginBottom: SIZES.XS,
  },
  services: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[600],
    fontFamily: FONTS.REGULAR,
    lineHeight: 18,
  },
  insuranceContainer: {
    marginBottom: SIZES.MD,
  },
  insuranceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.SM,
  },
  insuranceTitle: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[700],
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  verifiedBadge: {
    backgroundColor: COLORS.SUCCESS + '20',
    paddingHorizontal: SIZES.SM,
    paddingVertical: 2,
    borderRadius: 12,
  },
  verifiedText: {
    fontSize: SIZES.FONT.XS,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.SUCCESS,
  },
  insuranceSource: {
    fontSize: SIZES.FONT.XS,
    color: COLORS.GRAY[500],
    fontFamily: FONTS.REGULAR,
    marginTop: SIZES.XS,
    fontStyle: 'italic',
  },
  insuranceChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.SM,
  },
  insuranceChip: {
    backgroundColor: COLORS.HEALTH.LIGHT_TEAL,
    paddingHorizontal: SIZES.SM,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY + '20',
  },
  insuranceChipText: {
    fontSize: SIZES.FONT.XS,
    color: COLORS.PRIMARY,
    fontWeight: '500',
    fontFamily: FONTS.MEDIUM,
  },
  hoursContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.LG,
  },
  hoursTitle: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[700],
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
    marginRight: SIZES.SM,
  },
  hours: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[600],
    fontFamily: FONTS.REGULAR,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SIZES.SM,
  },
  callButton: {
    flex: 1,
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
  },
  callButtonText: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.WHITE,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  directionsButton: {
    flex: 1,
    backgroundColor: COLORS.SUCCESS,
    paddingVertical: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
  },
  directionsButtonText: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.WHITE,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  websiteButton: {
    flex: 1,
    backgroundColor: COLORS.GRAY[600],
    paddingVertical: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
  },
  websiteButtonText: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.WHITE,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  bookButton: {
    flex: 1,
    backgroundColor: COLORS.ACCENT,
    paddingVertical: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
  },
  bookButtonText: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.WHITE,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  noResultsContainer: {
    padding: SIZES.LG,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[600],
    textAlign: 'center',
    lineHeight: 24,
    fontFamily: FONTS.REGULAR,
  },
  disclaimer: {
    backgroundColor: COLORS.GRAY[50],
    margin: SIZES.LG,
    padding: SIZES.LG,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
  },
  disclaimerText: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[600],
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: FONTS.REGULAR,
  },
  noInsuranceData: {
    backgroundColor: COLORS.GRAY[50],
    borderRadius: SIZES.BORDER_RADIUS,
    padding: SIZES.MD,
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
  },
  noInsuranceText: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[700],
    fontFamily: FONTS.REGULAR,
    lineHeight: 18,
    marginBottom: SIZES.SM,
  },
  insuranceActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  callInsuranceButton: {
    backgroundColor: COLORS.PRIMARY + '20',
    paddingHorizontal: SIZES.MD,
    paddingVertical: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY,
  },
  callInsuranceButtonText: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
});
