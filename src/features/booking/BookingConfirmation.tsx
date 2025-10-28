import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

import { BookingResult } from '@/shared/services/AppointmentBookingService';
import { COLORS, SIZES, FONTS } from '@/shared/constants/AppConstants';

interface BookingConfirmationProps {
  bookingResult: BookingResult;
  onDone: () => void;
  onViewAppointments: () => void;
}

export const BookingConfirmation: React.FC<BookingConfirmationProps> = ({
  bookingResult,
  onDone,
  onViewAppointments,
}) => {
  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (!bookingResult.success) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Booking Failed</Text>
          <Text style={styles.errorMessage}>
            {bookingResult.error || 'An unexpected error occurred. Please try again.'}
          </Text>
          <TouchableOpacity style={styles.doneButton} onPress={onDone}>
            <Text style={styles.doneButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const { appointmentDetails, confirmationNumber, nextSteps } = bookingResult;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.successContainer}>
        <View style={styles.successIconContainer}>
          <View style={styles.successIcon} />
        </View>

        <Text style={styles.successTitle}>Appointment Confirmed!</Text>
        <Text style={styles.confirmationNumber}>
          Confirmation #{confirmationNumber}
        </Text>

        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Appointment Details</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date & Time:</Text>
            <Text style={styles.detailValue}>
              {formatDateTime(appointmentDetails.dateTime)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duration:</Text>
            <Text style={styles.detailValue}>{appointmentDetails.duration} minutes</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Provider:</Text>
            <Text style={styles.detailValue}>{appointmentDetails.providerName}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Specialty:</Text>
            <Text style={styles.detailValue}>{appointmentDetails.specialty}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type:</Text>
            <Text style={styles.detailValue}>{appointmentDetails.appointmentType}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location:</Text>
            <Text style={styles.detailValue}>
              {appointmentDetails.facilityName}{'\n'}
              {appointmentDetails.facilityAddress}
            </Text>
          </View>
        </View>

        {nextSteps && nextSteps.length > 0 && (
          <View style={styles.nextStepsCard}>
            <Text style={styles.sectionTitle}>Next Steps</Text>
            {nextSteps.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <Text style={styles.stepNumber}>{index + 1}.</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.viewAppointmentsButton}
            onPress={onViewAppointments}
          >
            <Text style={styles.viewAppointmentsButtonText}>View My Appointments</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.doneButton} onPress={onDone}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  successContainer: {
    padding: SIZES.LG,
    alignItems: 'center',
  },
  errorContainer: {
    padding: SIZES.LG,
    alignItems: 'center',
    marginTop: SIZES.XXL,
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.SUCCESS,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SIZES.LG,
    marginBottom: SIZES.LG,
    ...SIZES.SHADOW.MEDIUM,
  },
  successIcon: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: COLORS.WHITE,
  },
  successTitle: {
    fontSize: SIZES.FONT.TITLE,
    fontWeight: '700',
    color: COLORS.GRAY[900],
    marginBottom: SIZES.SM,
    fontFamily: FONTS.BOLD,
    letterSpacing: -0.5,
  },
  confirmationNumber: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[600],
    marginBottom: SIZES.XL,
    fontFamily: FONTS.MEDIUM,
  },
  errorTitle: {
    fontSize: SIZES.FONT.TITLE,
    fontWeight: '700',
    color: COLORS.DANGER,
    marginBottom: SIZES.MD,
    fontFamily: FONTS.BOLD,
  },
  errorMessage: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[600],
    textAlign: 'center',
    marginBottom: SIZES.XL,
    paddingHorizontal: SIZES.LG,
    fontFamily: FONTS.REGULAR,
    lineHeight: 24,
  },
  detailsCard: {
    width: '100%',
    backgroundColor: COLORS.WHITE,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    marginBottom: SIZES.MD,
    ...SIZES.SHADOW.LIGHT,
    borderWidth: 1,
    borderColor: COLORS.GRAY[100],
  },
  nextStepsCard: {
    width: '100%',
    backgroundColor: COLORS.HEALTH.LIGHT_TEAL,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    marginBottom: SIZES.XL,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY + '20',
  },
  sectionTitle: {
    fontSize: SIZES.FONT.XL,
    fontWeight: '600',
    color: COLORS.GRAY[900],
    marginBottom: SIZES.MD,
    fontFamily: FONTS.SEMIBOLD,
  },
  detailRow: {
    marginBottom: SIZES.MD,
  },
  detailLabel: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[600],
    marginBottom: SIZES.XS,
    fontFamily: FONTS.REGULAR,
  },
  detailValue: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[900],
    fontWeight: '500',
    fontFamily: FONTS.MEDIUM,
    lineHeight: 22,
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: SIZES.MD,
  },
  stepNumber: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
    fontWeight: '600',
    marginRight: SIZES.SM,
    fontFamily: FONTS.SEMIBOLD,
  },
  stepText: {
    flex: 1,
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[800],
    lineHeight: 22,
    fontFamily: FONTS.REGULAR,
  },
  buttonContainer: {
    width: '100%',
    gap: SIZES.MD,
  },
  viewAppointmentsButton: {
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: SIZES.LG,
    paddingHorizontal: SIZES.XL,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
    height: SIZES.BUTTON_HEIGHT,
    justifyContent: 'center',
    ...SIZES.SHADOW.MEDIUM,
  },
  viewAppointmentsButtonText: {
    color: COLORS.WHITE,
    fontSize: SIZES.FONT.LG,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  doneButton: {
    backgroundColor: COLORS.WHITE,
    paddingVertical: SIZES.LG,
    paddingHorizontal: SIZES.XL,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.GRAY[300],
    height: SIZES.BUTTON_HEIGHT,
    justifyContent: 'center',
  },
  doneButtonText: {
    color: COLORS.GRAY[800],
    fontSize: SIZES.FONT.LG,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
});
