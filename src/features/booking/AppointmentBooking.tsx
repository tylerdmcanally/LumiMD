import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';

import { COLORS, SIZES, FONTS } from '@/shared/constants/AppConstants';
import {
  AppointmentBookingService,
  AppointmentSlot,
  BookingRequest,
  BookingResult,
  PatientInfo,
  InsuranceInfo,
} from '@/shared/services/AppointmentBookingService';

interface AppointmentBookingProps {
  facility: any;
  recommendedCareLevel: string;
  symptoms?: string[];
  chiefComplaint?: string;
  onBack: () => void;
  onBookingComplete: (result: BookingResult) => void;
}

export const AppointmentBooking: React.FC<AppointmentBookingProps> = ({
  facility,
  recommendedCareLevel,
  symptoms,
  chiefComplaint,
  onBack,
  onBookingComplete,
}) => {
  const [step, setStep] = useState<'availability' | 'patient-info' | 'confirm'>('availability');
  const [isLoading, setIsLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AppointmentSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);

  // Patient info state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [reasonForVisit, setReasonForVisit] = useState(chiefComplaint || '');

  // Insurance info
  const [hasInsurance, setHasInsurance] = useState(false);
  const [insuranceProvider, setInsuranceProvider] = useState('');
  const [memberId, setMemberId] = useState('');

  const loadAvailability = useCallback(async () => {
    setIsLoading(true);
    try {
      // Get next 7 days of availability
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);

      const slots = await AppointmentBookingService.checkAvailability(
        facility.id,
        recommendedCareLevel,
        { startDate, endDate }
      );

      setAvailableSlots(slots);
    } catch (error) {
      console.error('Error loading availability:', error);
      Alert.alert('Error', 'Could not load available appointment times');
    } finally {
      setIsLoading(false);
    }
  }, [facility.id, recommendedCareLevel]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const handleSlotSelect = (slot: AppointmentSlot) => {
    setSelectedSlot(slot);
    setStep('patient-info');
  };

  const handleBookAppointment = async () => {
    if (!selectedSlot) return;

    // Validate patient info
    if (!firstName || !lastName || !email || !phone || !dateOfBirth) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    try {
      const patientInfo: PatientInfo = {
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth: new Date(dateOfBirth),
      };

      const insuranceInfo: InsuranceInfo | undefined = hasInsurance ? {
        provider: insuranceProvider,
        memberId,
      } : undefined;

      const bookingRequest: BookingRequest = {
        userId: 'demo_user_123', // TODO: Get from auth
        slotId: selectedSlot.id,
        patientInfo,
        insuranceInfo,
        reasonForVisit: reasonForVisit || 'General consultation',
        symptoms: symptoms,
        availability: {
          preferredDates: [selectedSlot.dateTime],
          preferredTimeSlots: [],
          flexibilityLevel: 'strict',
          insuranceRequired: hasInsurance,
        },
        contactPreferences: {
          preferredMethod: 'email',
          emailAddress: email,
          phoneNumber: phone,
          allowReminders: true,
        },
      };

      const result = await AppointmentBookingService.bookAppointment(bookingRequest);

      if (result.success) {
        onBookingComplete(result);
      } else {
        Alert.alert('Booking Failed', result.error || 'Unable to book appointment');
      }
    } catch (error) {
      console.error('Booking error:', error);
      Alert.alert('Error', 'Failed to book appointment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderAvailabilityStep = () => (
    <View style={styles.container}>
      <Text style={styles.stepTitle}>Select Appointment Time</Text>
      <Text style={styles.stepSubtitle}>
        {facility.name} - {recommendedCareLevel.replace('_', ' ')}
      </Text>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.PRIMARY} />
          <Text style={styles.loadingText}>Loading available times...</Text>
        </View>
      ) : availableSlots.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No available appointments found</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadAvailability}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.slotsList}>
          {groupSlotsByDate(availableSlots).map(({ date, slots }) => (
            <View key={date} style={styles.dateGroup}>
              <Text style={styles.dateHeader}>{formatDate(new Date(date))}</Text>
              {slots.map((slot) => (
                <TouchableOpacity
                  key={slot.id}
                  style={styles.slotCard}
                  onPress={() => handleSlotSelect(slot)}
                >
                  <View style={styles.slotInfo}>
                    <Text style={styles.slotTime}>{formatTime(slot.dateTime)}</Text>
                    <Text style={styles.slotProvider}>{slot.providerName}</Text>
                    <Text style={styles.slotType}>{slot.appointmentType}</Text>
                  </View>
                  <View style={styles.slotAction}>
                    <Text style={styles.slotActionText}>Book →</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const renderPatientInfoStep = () => (
    <ScrollView style={styles.container}>
      <Text style={styles.stepTitle}>Patient Information</Text>
      <Text style={styles.stepSubtitle}>
        {selectedSlot && `${formatDate(selectedSlot.dateTime)} at ${formatTime(selectedSlot.dateTime)}`}
      </Text>

      <View style={styles.form}>
        <Text style={styles.label}>First Name *</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Enter first name"
          placeholderTextColor={COLORS.GRAY[400]}
        />

        <Text style={styles.label}>Last Name *</Text>
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          placeholder="Enter last name"
          placeholderTextColor={COLORS.GRAY[400]}
        />

        <Text style={styles.label}>Email *</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="email@example.com"
          placeholderTextColor={COLORS.GRAY[400]}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Phone *</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="(555) 123-4567"
          placeholderTextColor={COLORS.GRAY[400]}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Date of Birth * (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
          placeholder="1990-01-01"
          placeholderTextColor={COLORS.GRAY[400]}
        />

        <Text style={styles.label}>Reason for Visit</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={reasonForVisit}
          onChangeText={setReasonForVisit}
          placeholder="Brief description of your concern"
          placeholderTextColor={COLORS.GRAY[400]}
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity
          style={styles.insuranceToggle}
          onPress={() => setHasInsurance(!hasInsurance)}
        >
          <View style={[styles.checkbox, hasInsurance && styles.checkboxChecked]}>
            {hasInsurance && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.insuranceLabel}>I have insurance</Text>
        </TouchableOpacity>

        {hasInsurance && (
          <>
            <Text style={styles.label}>Insurance Provider</Text>
            <TextInput
              style={styles.input}
              value={insuranceProvider}
              onChangeText={setInsuranceProvider}
              placeholder="e.g., Blue Cross Blue Shield"
              placeholderTextColor={COLORS.GRAY[400]}
            />

            <Text style={styles.label}>Member ID</Text>
            <TextInput
              style={styles.input}
              value={memberId}
              onChangeText={setMemberId}
              placeholder="Insurance member ID"
              placeholderTextColor={COLORS.GRAY[400]}
            />
          </>
        )}

        <TouchableOpacity
          style={[styles.bookButton, isLoading && styles.bookButtonDisabled]}
          onPress={handleBookAppointment}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={COLORS.WHITE} />
          ) : (
            <Text style={styles.bookButtonText}>Confirm Booking</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setStep('availability')}
        >
          <Text style={styles.backButtonText}>← Back to Times</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.headerBackText}>✕ Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book Appointment</Text>
        <View style={{ width: 60 }} />
      </View>

      {step === 'availability' && renderAvailabilityStep()}
      {step === 'patient-info' && renderPatientInfoStep()}
    </SafeAreaView>
  );
};

// Helper functions
function groupSlotsByDate(slots: AppointmentSlot[]): { date: string; slots: AppointmentSlot[] }[] {
  const grouped = slots.reduce((acc, slot) => {
    const date = slot.dateTime.toISOString().split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(slot);
    return acc;
  }, {} as Record<string, AppointmentSlot[]>);

  return Object.entries(grouped)
    .map(([date, slots]) => ({ date, slots }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.LG,
    paddingVertical: SIZES.MD,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.GRAY[200],
  },
  headerBackText: {
    fontSize: SIZES.FONT.MD,
    fontFamily: FONTS.MEDIUM,
    color: COLORS.GRAY[600],
  },
  headerTitle: {
    fontSize: SIZES.FONT.XL,
    fontFamily: FONTS.BOLD,
    color: COLORS.GRAY[900],
  },
  container: {
    flex: 1,
    paddingHorizontal: SIZES.LG,
    paddingVertical: SIZES.MD,
  },
  stepTitle: {
    fontSize: SIZES.FONT.XXL,
    fontFamily: FONTS.BOLD,
    color: COLORS.GRAY[900],
    marginBottom: SIZES.SM,
  },
  stepSubtitle: {
    fontSize: SIZES.FONT.MD,
    fontFamily: FONTS.REGULAR,
    color: COLORS.GRAY[600],
    marginBottom: SIZES.LG,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SIZES.MD,
    fontSize: SIZES.FONT.MD,
    fontFamily: FONTS.REGULAR,
    color: COLORS.GRAY[600],
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: SIZES.FONT.LG,
    fontFamily: FONTS.REGULAR,
    color: COLORS.GRAY[600],
    marginBottom: SIZES.LG,
  },
  retryButton: {
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: SIZES.MD,
    paddingHorizontal: SIZES.XL,
    borderRadius: SIZES.BORDER_RADIUS,
  },
  retryButtonText: {
    fontSize: SIZES.FONT.MD,
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
  },
  slotsList: {
    flex: 1,
  },
  dateGroup: {
    marginBottom: SIZES.LG,
  },
  dateHeader: {
    fontSize: SIZES.FONT.LG,
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.GRAY[900],
    marginBottom: SIZES.MD,
  },
  slotCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.WHITE,
    borderRadius: SIZES.BORDER_RADIUS,
    padding: SIZES.MD,
    marginBottom: SIZES.SM,
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    ...SIZES.SHADOW.LIGHT,
  },
  slotInfo: {
    flex: 1,
  },
  slotTime: {
    fontSize: SIZES.FONT.LG,
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.GRAY[900],
    marginBottom: SIZES.XS,
  },
  slotProvider: {
    fontSize: SIZES.FONT.SM,
    fontFamily: FONTS.REGULAR,
    color: COLORS.GRAY[700],
  },
  slotType: {
    fontSize: SIZES.FONT.SM,
    fontFamily: FONTS.REGULAR,
    color: COLORS.GRAY[500],
  },
  slotAction: {
    paddingLeft: SIZES.MD,
  },
  slotActionText: {
    fontSize: SIZES.FONT.MD,
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: SIZES.FONT.SM,
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.GRAY[700],
    marginBottom: SIZES.SM,
    marginTop: SIZES.MD,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.GRAY[300],
    borderRadius: SIZES.BORDER_RADIUS,
    paddingHorizontal: SIZES.MD,
    paddingVertical: SIZES.SM,
    fontSize: SIZES.FONT.MD,
    fontFamily: FONTS.REGULAR,
    color: COLORS.GRAY[900],
    backgroundColor: COLORS.WHITE,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  insuranceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SIZES.LG,
    marginBottom: SIZES.MD,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: COLORS.GRAY[400],
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SIZES.SM,
  },
  checkboxChecked: {
    backgroundColor: COLORS.PRIMARY,
    borderColor: COLORS.PRIMARY,
  },
  checkmark: {
    color: COLORS.WHITE,
    fontSize: 16,
    fontFamily: FONTS.BOLD,
  },
  insuranceLabel: {
    fontSize: SIZES.FONT.MD,
    fontFamily: FONTS.REGULAR,
    color: COLORS.GRAY[900],
  },
  bookButton: {
    backgroundColor: COLORS.PRIMARY,
    borderRadius: SIZES.BORDER_RADIUS,
    paddingVertical: SIZES.MD,
    alignItems: 'center',
    marginTop: SIZES.XL,
    ...SIZES.SHADOW.MEDIUM,
  },
  bookButtonDisabled: {
    opacity: 0.6,
  },
  bookButtonText: {
    fontSize: SIZES.FONT.LG,
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
  },
  backButton: {
    paddingVertical: SIZES.MD,
    alignItems: 'center',
    marginTop: SIZES.MD,
    marginBottom: SIZES.XL,
  },
  backButtonText: {
    fontSize: SIZES.FONT.MD,
    fontFamily: FONTS.MEDIUM,
    color: COLORS.GRAY[600],
  },
});
