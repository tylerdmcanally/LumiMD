/**
 * Tests for useConsentFlow hook
 * Validates consent flow logic for different state scenarios
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConsentFlow } from '../../../lib/hooks/useConsentFlow';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock useLocation hook
const mockUseLocation = jest.fn();
jest.mock('../../../lib/location/useLocation', () => ({
  useLocation: () => mockUseLocation(),
}));

describe('useConsentFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  describe('with two-party consent state', () => {
    beforeEach(() => {
      mockUseLocation.mockReturnValue({
        stateCode: 'CA',
        stateSource: 'location',
        isUSLocation: true,
        isLoading: false,
        error: null,
        hasPermission: true,
        permissionStatus: 'granted',
        requestPermission: jest.fn(async () => true),
        refreshLocation: jest.fn(),
        setManualState: jest.fn(),
        clearManualState: jest.fn(),
      });
    });

    it('identifies California as requiring two-party consent', () => {
      const { result } = renderHook(() => useConsentFlow());

      expect(result.current.userState).toBe('CA');
      expect(result.current.requiresTwoPartyConsent).toBe(true);
    });

    it('checkConsentRequired returns required modal for CA', async () => {
      const { result } = renderHook(() => useConsentFlow());

      let consentCheck: any;
      await act(async () => {
        consentCheck = await result.current.checkConsentRequired();
      });

      expect(consentCheck.canProceed).toBe(false);
      expect(consentCheck.modalType).toBe('required');
      expect(consentCheck.twoPartyRequired).toBe(true);
      expect(consentCheck.stateCode).toBe('CA');
    });

    it('generates consent record with correct metadata', () => {
      const { result } = renderHook(() => useConsentFlow());

      const record = result.current.generateConsentRecord(true);

      expect(record.consentAcknowledged).toBe(true);
      expect(record.consentAcknowledgedAt).toBeInstanceOf(Date);
      expect(record.recordingStateCode).toBe('CA');
      expect(record.twoPartyConsentRequired).toBe(true);
      expect(record.consentFlowVersion).toBe('1.0');
    });
  });

  describe('with one-party consent state', () => {
    beforeEach(() => {
      mockUseLocation.mockReturnValue({
        stateCode: 'TX',
        stateSource: 'location',
        isUSLocation: true,
        isLoading: false,
        error: null,
        hasPermission: true,
        permissionStatus: 'granted',
        requestPermission: jest.fn(async () => true),
        refreshLocation: jest.fn(),
        setManualState: jest.fn(),
        clearManualState: jest.fn(),
      });
    });

    it('identifies Texas as one-party consent state', () => {
      const { result } = renderHook(() => useConsentFlow());

      expect(result.current.userState).toBe('TX');
      expect(result.current.requiresTwoPartyConsent).toBe(false);
    });

    it('checkConsentRequired returns educational modal for TX (first time)', async () => {
      const { result } = renderHook(() => useConsentFlow());

      let consentCheck: any;
      await act(async () => {
        consentCheck = await result.current.checkConsentRequired();
      });

      expect(consentCheck.canProceed).toBe(false);
      expect(consentCheck.modalType).toBe('educational');
      expect(consentCheck.twoPartyRequired).toBe(false);
    });

    it('checkConsentRequired allows proceeding when skip reminder is set', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');

      const { result } = renderHook(() => useConsentFlow());

      // Wait for skip preference to load
      await waitFor(() => {
        expect(result.current.skipEducationalPrompt).toBe(true);
      });

      let consentCheck: any;
      await act(async () => {
        consentCheck = await result.current.checkConsentRequired();
      });

      expect(consentCheck.canProceed).toBe(true);
      expect(consentCheck.modalType).toBeNull();
    });

    it('setSkipEducationalPrompt persists preference', async () => {
      const { result } = renderHook(() => useConsentFlow());

      await act(async () => {
        await result.current.setSkipEducationalPrompt(true);
      });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'lumimd:skipOnePartyReminder',
        'true'
      );
      expect(result.current.skipEducationalPrompt).toBe(true);
    });

    it('generates consent record without acknowledgment for one-party', () => {
      const { result } = renderHook(() => useConsentFlow());

      const record = result.current.generateConsentRecord(false);

      expect(record.consentAcknowledged).toBe(false);
      expect(record.consentAcknowledgedAt).toBeNull();
      expect(record.recordingStateCode).toBe('TX');
      expect(record.twoPartyConsentRequired).toBe(false);
    });
  });

  describe('with unknown location', () => {
    beforeEach(() => {
      mockUseLocation.mockReturnValue({
        stateCode: null,
        stateSource: null,
        isUSLocation: null,
        isLoading: false,
        error: 'Location unavailable',
        hasPermission: false,
        permissionStatus: 'denied',
        requestPermission: jest.fn(async () => false),
        refreshLocation: jest.fn(),
        setManualState: jest.fn(),
        clearManualState: jest.fn(),
      });
    });

    it('defaults to two-party consent when state is unknown', () => {
      const { result } = renderHook(() => useConsentFlow());

      expect(result.current.userState).toBeNull();
      expect(result.current.requiresTwoPartyConsent).toBe(true);
    });

    it('checkConsentRequired returns required modal for unknown state', async () => {
      const { result } = renderHook(() => useConsentFlow());

      let consentCheck: any;
      await act(async () => {
        consentCheck = await result.current.checkConsentRequired();
      });

      expect(consentCheck.canProceed).toBe(false);
      expect(consentCheck.modalType).toBe('required');
      expect(consentCheck.twoPartyRequired).toBe(true);
    });
  });

  describe('manual state selection', () => {
    const mockSetManualState = jest.fn();

    beforeEach(() => {
      mockUseLocation.mockReturnValue({
        stateCode: 'NY',
        stateSource: 'manual',
        isUSLocation: true,
        isLoading: false,
        error: null,
        hasPermission: false,
        permissionStatus: 'denied',
        requestPermission: jest.fn(async () => false),
        refreshLocation: jest.fn(),
        setManualState: mockSetManualState,
        clearManualState: jest.fn(),
      });
    });

    it('uses manually selected state', () => {
      const { result } = renderHook(() => useConsentFlow());

      expect(result.current.userState).toBe('NY');
      expect(result.current.stateSource).toBe('manual');
    });

    it('setManualState delegates to useLocation', async () => {
      const { result } = renderHook(() => useConsentFlow());

      await act(async () => {
        await result.current.setManualState('FL');
      });

      expect(mockSetManualState).toHaveBeenCalledWith('FL');
    });
  });
});
