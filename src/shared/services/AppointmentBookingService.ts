/**
 * Appointment Booking Service
 * Handles real appointment booking through multiple providers (Zocdoc, Solv, etc.)
 */

// ==================== DATA MODELS ====================

export interface BookingProvider {
  id: string;
  name: 'zocdoc' | 'solv' | 'mychart' | 'athenahealth' | 'manual';
  displayName: string;
  hasAPI: boolean;
  requiresAuth: boolean;
}

export interface UserAvailability {
  preferredDates: Date[];
  preferredTimeSlots: TimeSlot[];
  flexibilityLevel: 'strict' | 'moderate' | 'flexible';
  maxDistance?: number; // miles
  insuranceRequired: boolean;
}

export interface TimeSlot {
  startTime: string; // HH:MM format
  endTime: string;   // HH:MM format
  dayOfWeek?: number; // 0-6, optional
}

export interface AppointmentSlot {
  id: string;
  facilityId: string;
  providerId: string;
  providerName: string;
  specialty: string;
  dateTime: Date;
  duration: number; // minutes
  appointmentType: string;
  isAvailable: boolean;
  bookingUrl?: string;
  price?: number;
  acceptsInsurance: boolean;
  insuranceProviders?: string[];
}

export interface BookingRequest {
  userId: string;
  slotId: string;
  patientInfo: PatientInfo;
  insuranceInfo?: InsuranceInfo;
  reasonForVisit: string;
  symptoms?: string[];
  availability: UserAvailability;
  contactPreferences: ContactPreferences;
}

export interface PatientInfo {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  email: string;
  phone: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

export interface InsuranceInfo {
  provider: string;
  memberId: string;
  groupNumber?: string;
  policyHolder?: string;
}

export interface ContactPreferences {
  preferredMethod: 'email' | 'sms' | 'phone' | 'all';
  emailAddress?: string;
  phoneNumber?: string;
  allowReminders: boolean;
}

export interface BookingResult {
  success: boolean;
  bookingId?: string;
  confirmationNumber?: string;
  appointmentDetails?: {
    dateTime: Date;
    duration: number;
    facilityName: string;
    facilityAddress: string;
    providerName: string;
    specialty: string;
    appointmentType: string;
  };
  error?: string;
  errorCode?: string;
  nextSteps?: string[];
  requiresVerification?: boolean;
  verificationMethod?: 'email' | 'phone' | 'portal';
}

export interface BookingStatus {
  bookingId: string;
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'completed';
  createdAt: Date;
  updatedAt: Date;
  provider: string;
  appointmentDetails?: any;
  confirmationSent: boolean;
  remindersSent: number;
}

// ==================== PROVIDER INTERFACES ====================

export interface IBookingProvider {
  name: string;
  checkAvailability(facilityId: string, specialty: string, dateRange: DateRange): Promise<AppointmentSlot[]>;
  bookAppointment(request: BookingRequest): Promise<BookingResult>;
  cancelAppointment(bookingId: string): Promise<boolean>;
  rescheduleAppointment(bookingId: string, newSlotId: string): Promise<BookingResult>;
  getBookingStatus(bookingId: string): Promise<BookingStatus>;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// ==================== MAIN SERVICE ====================

export class AppointmentBookingService {
  private static providers: Map<string, IBookingProvider> = new Map();
  private static bookings: Map<string, BookingStatus> = new Map();

  /**
   * Register a booking provider
   */
  static registerProvider(name: string, provider: IBookingProvider): void {
    this.providers.set(name, provider);
    console.log(`Registered booking provider: ${name}`);
  }

  /**
   * Get all available providers
   */
  static getAvailableProviders(): BookingProvider[] {
    return [
      {
        id: 'zocdoc',
        name: 'zocdoc',
        displayName: 'Zocdoc',
        hasAPI: true,
        requiresAuth: true,
      },
      {
        id: 'solv',
        name: 'solv',
        displayName: 'Solv',
        hasAPI: true,
        requiresAuth: true,
      },
      {
        id: 'mychart',
        name: 'mychart',
        displayName: 'Epic MyChart',
        hasAPI: true,
        requiresAuth: true,
      },
      {
        id: 'athenahealth',
        name: 'athenahealth',
        displayName: 'athenahealth',
        hasAPI: true,
        requiresAuth: true,
      },
    ];
  }

  /**
   * Detect which booking provider a facility uses
   */
  static async detectFacilityProvider(facilityId: string, facilityUrl?: string): Promise<string | null> {
    // In production, this would check the facility's website/system
    // For now, we'll use heuristics based on the facility data

    if (facilityUrl) {
      if (facilityUrl.includes('zocdoc.com')) return 'zocdoc';
      if (facilityUrl.includes('solvhealth.com')) return 'solv';
      if (facilityUrl.includes('mychart')) return 'mychart';
      if (facilityUrl.includes('athenahealth')) return 'athenahealth';
    }

    // Default to Zocdoc as it's the most common third-party platform
    return 'zocdoc';
  }

  /**
   * Check availability across all providers
   */
  static async checkAvailability(
    facilityId: string,
    specialty: string,
    dateRange: DateRange,
    providerId?: string
  ): Promise<AppointmentSlot[]> {
    const providerName = providerId || await this.detectFacilityProvider(facilityId);

    if (!providerName) {
      throw new Error('Could not determine booking provider for facility');
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Booking provider not available: ${providerName}`);
    }

    try {
      const slots = await provider.checkAvailability(facilityId, specialty, dateRange);
      console.log(`Found ${slots.length} available slots for ${facilityId}`);
      return slots;
    } catch (error) {
      console.error(`Error checking availability with ${providerName}:`, error);
      throw error;
    }
  }

  /**
   * Book an appointment
   */
  static async bookAppointment(request: BookingRequest): Promise<BookingResult> {
    // Detect provider from slot
    const provider = await this.detectProviderForSlot(request.slotId);

    if (!provider) {
      return {
        success: false,
        error: 'Could not determine booking provider',
        errorCode: 'PROVIDER_NOT_FOUND',
      };
    }

    const bookingProvider = this.providers.get(provider);
    if (!bookingProvider) {
      return {
        success: false,
        error: `Booking provider not available: ${provider}`,
        errorCode: 'PROVIDER_UNAVAILABLE',
      };
    }

    try {
      const result = await bookingProvider.bookAppointment(request);

      if (result.success && result.bookingId) {
        // Store booking status
        const bookingStatus: BookingStatus = {
          bookingId: result.bookingId,
          status: result.requiresVerification ? 'pending' : 'confirmed',
          createdAt: new Date(),
          updatedAt: new Date(),
          provider,
          appointmentDetails: result.appointmentDetails,
          confirmationSent: false,
          remindersSent: 0,
        };

        this.bookings.set(result.bookingId, bookingStatus);

        // Store in localStorage for persistence
        this.saveBookingToStorage(bookingStatus);

        // Send confirmation
        await this.sendConfirmation(result, request.contactPreferences);
      }

      return result;
    } catch (error) {
      console.error(`Error booking appointment with ${provider}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Booking failed',
        errorCode: 'BOOKING_ERROR',
      };
    }
  }

  /**
   * Cancel an appointment
   */
  static async cancelAppointment(bookingId: string): Promise<boolean> {
    console.log('Cancelling appointment:', bookingId);
    const booking = this.bookings.get(bookingId) || this.loadBookingFromStorage(bookingId);

    if (!booking) {
      console.error('Booking not found:', bookingId);
      throw new Error('Booking not found');
    }

    console.log('Found booking:', booking);
    const provider = this.providers.get(booking.provider);
    if (!provider) {
      console.error('Provider not available:', booking.provider);
      throw new Error(`Provider not available: ${booking.provider}`);
    }

    console.log('Calling provider cancel for:', bookingId);
    const success = await provider.cancelAppointment(bookingId);
    console.log('Provider cancel result:', success);

    if (success) {
      booking.status = 'cancelled';
      booking.updatedAt = new Date();
      this.bookings.set(bookingId, booking);
      this.saveBookingToStorage(booking);
      console.log('Booking cancelled and saved');
    }

    return success;
  }

  /**
   * Get booking status
   */
  static async getBookingStatus(bookingId: string): Promise<BookingStatus | null> {
    const booking = this.bookings.get(bookingId) || this.loadBookingFromStorage(bookingId);

    if (!booking) {
      return null;
    }

    // Refresh status from provider
    const provider = this.providers.get(booking.provider);
    if (provider) {
      try {
        const updatedStatus = await provider.getBookingStatus(bookingId);
        this.bookings.set(bookingId, updatedStatus);
        this.saveBookingToStorage(updatedStatus);
        return updatedStatus;
      } catch (error) {
        console.error('Error refreshing booking status:', error);
      }
    }

    return booking;
  }

  /**
   * Get all user bookings
   */
  static async getUserBookings(userId: string = 'demo_user_123'): Promise<BookingStatus[]> {
    const bookings: BookingStatus[] = [];

    // Load from localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem(`healthnav_bookings_${userId}`);
      if (stored) {
        try {
          const parsedBookings = JSON.parse(stored);
          // Convert date strings back to Date objects
          bookings.push(...parsedBookings.map((b: any) => ({
            ...b,
            createdAt: new Date(b.createdAt),
            updatedAt: new Date(b.updatedAt),
            appointmentDetails: {
              ...b.appointmentDetails,
              dateTime: new Date(b.appointmentDetails.dateTime),
            },
          })));
        } catch (error) {
          console.error('Error parsing bookings from storage:', error);
        }
      }
    }

    return bookings.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Private helper methods
   */
  private static async detectProviderForSlot(slotId: string): Promise<string | null> {
    // In production, this would look up the slot to determine provider
    // For now, we'll parse the slotId which should contain provider info

    if (slotId.includes('zocdoc_')) return 'zocdoc';
    if (slotId.includes('solv_')) return 'solv';
    if (slotId.includes('mychart_')) return 'mychart';

    return 'zocdoc'; // default
  }

  private static async sendConfirmation(
    result: BookingResult,
    preferences: ContactPreferences
  ): Promise<void> {
    // In production, integrate with SendGrid (email) and Twilio (SMS)
    console.log('Sending confirmation via:', preferences.preferredMethod);
    console.log('Confirmation details:', result.appointmentDetails);

    // TODO: Implement real email/SMS sending
    // For MVP, we'll log and store the confirmation details
  }

  private static saveBookingToStorage(booking: BookingStatus): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const userId = 'demo_user_123'; // TODO: Get from auth context
      const stored = localStorage.getItem(`healthnav_bookings_${userId}`);
      const bookings = stored ? JSON.parse(stored) : [];
      const index = bookings.findIndex((b: BookingStatus) => b.bookingId === booking.bookingId);

      if (index >= 0) {
        bookings[index] = booking;
      } else {
        bookings.push(booking);
      }

      localStorage.setItem(`healthnav_bookings_${userId}`, JSON.stringify(bookings));
    }
  }

  private static loadBookingFromStorage(bookingId: string): BookingStatus | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      const userId = 'demo_user_123'; // TODO: Get from auth context
      const stored = localStorage.getItem(`healthnav_bookings_${userId}`);
      if (stored) {
        const bookings = JSON.parse(stored);
        const booking = bookings.find((b: BookingStatus) => b.bookingId === bookingId);
        if (booking) {
          return {
            ...booking,
            createdAt: new Date(booking.createdAt),
            updatedAt: new Date(booking.updatedAt),
            appointmentDetails: {
              ...booking.appointmentDetails,
              dateTime: new Date(booking.appointmentDetails.dateTime),
            },
          };
        }
      }
    }
    return null;
  }
}
