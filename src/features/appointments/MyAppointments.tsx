import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';

import { AppointmentBookingService, BookingStatus } from '@/shared/services/AppointmentBookingService';
import { COLORS, SIZES, FONTS } from '@/shared/constants/AppConstants';

interface MyAppointmentsProps {
  onBack: () => void;
}

export const MyAppointments: React.FC<MyAppointmentsProps> = ({ onBack }) => {
  const [appointments, setAppointments] = useState<BookingStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    loadAppointments();
  }, []);

  const loadAppointments = async () => {
    try {
      setLoading(true);
      const bookings = await AppointmentBookingService.getUserBookings();
      console.log('Loaded appointments:', bookings);
      setAppointments(bookings);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAppointment = async (bookingId: string) => {
    const confirmed = window.confirm('Are you sure you want to cancel this appointment?');

    if (confirmed) {
      try {
        const success = await AppointmentBookingService.cancelAppointment(bookingId);
        if (success) {
          alert('Appointment cancelled successfully');
          loadAppointments(); // Reload appointments
        } else {
          alert('Failed to cancel appointment');
        }
      } catch (error) {
        console.error('Cancel error:', error);
        alert('Failed to cancel appointment');
      }
    }
  };

  const handleRescheduleAppointment = (bookingId: string) => {
    alert('Rescheduling feature coming soon! You can cancel this appointment and book a new one.');
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getStatusColor = (status: BookingStatus['status']) => {
    switch (status) {
      case 'confirmed':
        return COLORS.SUCCESS;
      case 'pending':
        return COLORS.WARNING;
      case 'cancelled':
        return COLORS.DANGER;
      case 'completed':
        return COLORS.GRAY[600];
      default:
        return COLORS.GRAY[400];
    }
  };

  const getStatusText = (status: BookingStatus['status']) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const upcomingAppointments = appointments.filter(
    (apt) => apt.status === 'confirmed' || apt.status === 'pending'
  );

  const pastAppointments = appointments.filter(
    (apt) => apt.status === 'completed' || apt.status === 'cancelled'
  );

  const displayedAppointments = selectedTab === 'upcoming' ? upcomingAppointments : pastAppointments;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        <Text style={styles.loadingText}>Loading appointments...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Appointments</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'upcoming' && styles.activeTab]}
          onPress={() => setSelectedTab('upcoming')}
        >
          <Text style={[styles.tabText, selectedTab === 'upcoming' && styles.activeTabText]}>
            Upcoming ({upcomingAppointments.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, selectedTab === 'past' && styles.activeTab]}
          onPress={() => setSelectedTab('past')}
        >
          <Text style={[styles.tabText, selectedTab === 'past' && styles.activeTabText]}>
            Past ({pastAppointments.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.appointmentsList}>
        {displayedAppointments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {selectedTab === 'upcoming'
                ? 'No upcoming appointments'
                : 'No past appointments'}
            </Text>
          </View>
        ) : (
          displayedAppointments.map((appointment) => (
            <View key={appointment.bookingId} style={styles.appointmentCard}>
              <View style={styles.appointmentHeader}>
                <View style={styles.appointmentHeaderLeft}>
                  <Text style={styles.appointmentDate}>
                    {formatDateTime(appointment.appointmentDetails.dateTime)}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(appointment.status) },
                    ]}
                  >
                    <Text style={styles.statusText}>{getStatusText(appointment.status)}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.appointmentDetails}>
                <Text style={styles.providerName}>
                  {appointment.appointmentDetails.providerName}
                </Text>
                <Text style={styles.specialty}>{appointment.appointmentDetails.specialty}</Text>
                <Text style={styles.facilityName}>
                  {appointment.appointmentDetails.facilityName}
                </Text>
                <Text style={styles.appointmentType}>
                  {appointment.appointmentDetails.appointmentType}
                </Text>
              </View>

              <View style={styles.appointmentMeta}>
                <Text style={styles.bookingId}>Booking ID: {appointment.bookingId}</Text>
                <Text style={styles.provider}>via {appointment.provider}</Text>
              </View>

              {appointment.status === 'confirmed' && (
                <View style={styles.appointmentActions}>
                  <TouchableOpacity
                    style={styles.rescheduleButton}
                    onPress={() => handleRescheduleAppointment(appointment.bookingId)}
                  >
                    <Text style={styles.rescheduleButtonText}>Reschedule</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => handleCancelAppointment(appointment.bookingId)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND,
  },
  loadingText: {
    marginTop: SIZES.MD,
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[600],
    fontFamily: FONTS.REGULAR,
  },
  header: {
    backgroundColor: COLORS.WHITE,
    paddingTop: 60,
    paddingBottom: SIZES.LG,
    paddingHorizontal: SIZES.LG,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.GRAY[100],
  },
  backButton: {
    marginBottom: SIZES.MD,
  },
  backButtonText: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  headerTitle: {
    fontSize: SIZES.FONT.HEADING,
    fontWeight: '700',
    color: COLORS.GRAY[900],
    fontFamily: FONTS.BOLD,
    letterSpacing: -0.5,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.GRAY[100],
  },
  tab: {
    flex: 1,
    paddingVertical: SIZES.MD,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: COLORS.PRIMARY,
  },
  tabText: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[600],
    fontWeight: '500',
    fontFamily: FONTS.MEDIUM,
  },
  activeTabText: {
    color: COLORS.PRIMARY,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  appointmentsList: {
    flex: 1,
    padding: SIZES.MD,
  },
  emptyContainer: {
    padding: SIZES.XXL,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: SIZES.FONT.MD,
    color: COLORS.GRAY[400],
    fontFamily: FONTS.REGULAR,
  },
  appointmentCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.LG,
    marginBottom: SIZES.MD,
    ...SIZES.SHADOW.LIGHT,
    borderWidth: 1,
    borderColor: COLORS.GRAY[100],
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SIZES.MD,
  },
  appointmentHeaderLeft: {
    flex: 1,
  },
  appointmentDate: {
    fontSize: SIZES.FONT.LG,
    fontWeight: '600',
    color: COLORS.GRAY[900],
    marginBottom: SIZES.SM,
    fontFamily: FONTS.SEMIBOLD,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SIZES.MD,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: SIZES.FONT.XS,
    color: COLORS.WHITE,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  appointmentDetails: {
    marginBottom: SIZES.MD,
  },
  providerName: {
    fontSize: SIZES.FONT.MD,
    fontWeight: '600',
    color: COLORS.GRAY[900],
    marginBottom: SIZES.XS,
    fontFamily: FONTS.SEMIBOLD,
  },
  specialty: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[600],
    marginBottom: SIZES.XS,
    fontFamily: FONTS.REGULAR,
  },
  facilityName: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[600],
    marginBottom: SIZES.XS,
    fontFamily: FONTS.REGULAR,
  },
  appointmentType: {
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[600],
    fontFamily: FONTS.REGULAR,
  },
  appointmentMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: SIZES.MD,
    borderTopWidth: 1,
    borderTopColor: COLORS.GRAY[100],
    marginBottom: SIZES.MD,
  },
  bookingId: {
    fontSize: SIZES.FONT.XS,
    color: COLORS.GRAY[400],
    fontFamily: FONTS.REGULAR,
  },
  provider: {
    fontSize: SIZES.FONT.XS,
    color: COLORS.GRAY[400],
    fontFamily: FONTS.REGULAR,
  },
  appointmentActions: {
    flexDirection: 'row',
    gap: SIZES.SM,
  },
  rescheduleButton: {
    flex: 1,
    backgroundColor: COLORS.HEALTH.LIGHT_TEAL,
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.PRIMARY + '30',
  },
  rescheduleButtonText: {
    color: COLORS.PRIMARY,
    fontSize: SIZES.FONT.SM,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.DANGER + '15',
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.DANGER + '30',
  },
  cancelButtonText: {
    color: COLORS.DANGER,
    fontSize: SIZES.FONT.SM,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
  },
});
