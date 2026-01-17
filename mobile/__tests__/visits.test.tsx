import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import VisitsScreen from '../app/visits';

const mockUseAuth = jest.fn();
const mockUseVisits = jest.fn();
const mockOpenWebVisit = jest.fn();
const mockOpenWebDashboard = jest.fn();

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../lib/api/hooks', () => ({
  useVisits: (options: any) => mockUseVisits(options),
}));

jest.mock('../lib/linking', () => ({
  openWebVisit: (...args: any[]) => mockOpenWebVisit(...args),
  openWebDashboard: (...args: any[]) => mockOpenWebDashboard(...args),
}));

describe('VisitsScreen', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseVisits.mockReset();
    mockOpenWebVisit.mockReset();
    mockOpenWebDashboard.mockReset();
    const { __mockRouter } = jest.requireMock('expo-router');
    __mockRouter.replace.mockClear();
  });

  it('redirects to sign-in when unauthenticated', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });
    mockUseVisits.mockReturnValue({
      data: [],
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<VisitsScreen />);

    await waitFor(() => {
      const { __mockRouter } = jest.requireMock('expo-router');
      expect(__mockRouter.replace).toHaveBeenCalledWith('/sign-in');
    });
  });

  it('renders empty state when no visits', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false });
    mockUseVisits.mockReturnValue({
      data: [],
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const { getByText } = render(<VisitsScreen />);
    expect(getByText('No visits recorded yet')).toBeTruthy();
  });

  it('opens web visit from manage link when visit exists', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false });
    mockUseVisits.mockReturnValue({
      data: [{ id: 'visit-123', createdAt: new Date().toISOString(), processingStatus: 'completed', summary: 'done' }],
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const { getByText } = render(<VisitsScreen />);
    fireEvent.press(getByText('Manage on Web'));
    expect(mockOpenWebVisit).toHaveBeenCalledWith('visit-123');
  });
});
