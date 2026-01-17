import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ActionsScreen from '../app/actions';

const mockUseAuth = jest.fn();
const mockUseActionItems = jest.fn();
const mockToggleAction = jest.fn();

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../lib/api/hooks', () => ({
  useActionItems: (options: any) => mockUseActionItems(options),
  queryKeys: { actions: ['actions'] },
}));

jest.mock('../lib/api/mutations', () => ({
  useCompleteAction: () => ({
    mutate: mockToggleAction,
    isPending: false,
  }),
}));

jest.mock('../lib/linking', () => ({
  openWebActions: jest.fn(),
}));

jest.mock('../lib/calendar', () => ({
  addActionToCalendar: jest.fn(async () => ({ success: true, eventId: 'evt', calendarId: 'cal' })),
  removeCalendarEvent: jest.fn(async () => ({ success: true })),
}));

jest.mock('../lib/api/client', () => ({
  api: { actions: { update: jest.fn() } },
}));

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

describe('ActionsScreen', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseActionItems.mockReset();
    mockToggleAction.mockReset();
    const { __mockRouter } = jest.requireMock('expo-router');
    __mockRouter.replace.mockClear();
  });

  it('redirects to sign-in when unauthenticated', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });
    mockUseActionItems.mockReturnValue({
      data: [],
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    renderWithClient(<ActionsScreen />);

    await waitFor(() => {
      const { __mockRouter } = jest.requireMock('expo-router');
      expect(__mockRouter.replace).toHaveBeenCalledWith('/sign-in');
    });
  });

  it('toggles action completion', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false });
    mockUseActionItems.mockReturnValue({
      data: [
        {
          id: 'action-1',
          description: 'Schedule follow-up',
          completed: false,
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const { getByText } = renderWithClient(<ActionsScreen />);
    fireEvent.press(getByText(/Schedule follow/i));

    expect(mockToggleAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'action-1', completed: true }),
    );
  });
});
