import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import VisitDetailScreen from '../app/visit-detail';

const mockUseVisit = jest.fn();
const mockRetry = jest.fn();
const mockSetQueryData = jest.fn();
const mockRouter = {
  back: jest.fn(),
  replace: jest.fn(),
};

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
  }),
}));

jest.mock('../lib/api/hooks', () => ({
  useVisit: (id: string, options: any) => mockUseVisit(id, options),
  queryKeys: { visit: (id: string) => ['visit', id] },
}));

jest.mock('../lib/api/client', () => ({
  api: { visits: { retry: (...args: any[]) => mockRetry(...args) } },
}));

jest.mock('expo-router', () => {
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({ id: 'visit-1' }),
  };
});

describe('VisitDetailScreen', () => {
  beforeEach(() => {
    mockUseVisit.mockReset();
    mockRetry.mockReset();
    mockSetQueryData.mockReset();
    mockRouter.back.mockReset();
    mockRouter.replace.mockReset();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
  });

  it('allows retry when visit failed', async () => {
    mockUseVisit.mockReturnValue({
      data: {
        id: 'visit-1',
        processingStatus: 'failed',
        processingError: 'Failed',
        createdAt: new Date().toISOString(),
      },
      isLoading: false,
      isRefetching: false,
      refetch: jest.fn(),
      error: null,
    });

    mockRetry.mockResolvedValue({ id: 'visit-1', processingStatus: 'processing' });

    const { getByText } = render(<VisitDetailScreen />);
    fireEvent.press(getByText('Retry'));

    await waitFor(() => {
      expect(mockRetry).toHaveBeenCalledWith('visit-1');
      expect(Alert.alert).toHaveBeenCalled();
    });
  });

  it('shows fallback actions when visit cannot be loaded', async () => {
    const mockRefetch = jest.fn();

    mockUseVisit.mockReturnValue({
      data: null,
      isLoading: false,
      isRefetching: false,
      refetch: mockRefetch,
      error: new Error('network error'),
    });

    const { getByText } = render(<VisitDetailScreen />);

    expect(getByText('Unable to load this visit')).toBeTruthy();
    fireEvent.press(getByText('Try Again'));
    fireEvent.press(getByText('Back to Home'));

    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith('/');
    });
  });
});
