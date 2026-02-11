import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CaregiverSharingScreen from '../app/caregiver-sharing';

const mockUseAuth = jest.fn();
const mockUseShares = jest.fn();
const mockUseMyShareInvites = jest.fn();
const mockUseInviteCaregiver = jest.fn();
const mockUseRevokeShareAccess = jest.fn();
const mockUseRevokeShareInvite = jest.fn();

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../lib/api/hooks', () => ({
  useShares: (...args: unknown[]) => mockUseShares(...args),
  useMyShareInvites: (...args: unknown[]) => mockUseMyShareInvites(...args),
  useInviteCaregiver: () => mockUseInviteCaregiver(),
  useRevokeShareAccess: () => mockUseRevokeShareAccess(),
  useRevokeShareInvite: () => mockUseRevokeShareInvite(),
}));

function makeQueryState<T>(data: T, overrides?: Partial<any>) {
  return {
    data,
    isLoading: false,
    isRefetching: false,
    error: null,
    refetch: jest.fn(async () => ({ data })),
    ...overrides,
  };
}

describe('CaregiverSharingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { uid: 'user-1' },
    });

    mockUseInviteCaregiver.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    mockUseRevokeShareAccess.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
    mockUseRevokeShareInvite.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    });
  });

  it('shows blocking error state when both shares and invites fail, and retries both', async () => {
    const refetchShares = jest.fn(async () => ({}));
    const refetchInvites = jest.fn(async () => ({}));

    mockUseShares.mockReturnValue(
      makeQueryState([], {
        error: new Error('shares failed'),
        refetch: refetchShares,
      }),
    );
    mockUseMyShareInvites.mockReturnValue(
      makeQueryState([], {
        error: new Error('invites failed'),
        refetch: refetchInvites,
      }),
    );

    const { getByText } = render(<CaregiverSharingScreen />);

    expect(getByText('Unable to load caregivers')).toBeTruthy();
    fireEvent.press(getByText('Try Again'));

    await waitFor(() => {
      expect(refetchShares).toHaveBeenCalled();
      expect(refetchInvites).toHaveBeenCalled();
    });
  });

  it('keeps main content visible on partial load failure', () => {
    mockUseShares.mockReturnValue(
      makeQueryState([
        {
          id: 'share-1',
          type: 'outgoing',
          status: 'accepted',
          caregiverEmail: 'caregiver@example.com',
          createdAt: '2026-02-10T10:00:00.000Z',
          updatedAt: '2026-02-10T10:00:00.000Z',
        },
      ]),
    );
    mockUseMyShareInvites.mockReturnValue(
      makeQueryState([], {
        error: new Error('invites temporarily unavailable'),
      }),
    );

    const { getByText, queryByText } = render(<CaregiverSharingScreen />);

    expect(queryByText('Unable to load caregivers')).toBeNull();
    expect(getByText('Shared Caregivers')).toBeTruthy();
    expect(getByText('Pending Invitations')).toBeTruthy();
    expect(getByText('invites temporarily unavailable')).toBeTruthy();
  });

  it('deduplicates pending items between pending shares and pending invites', () => {
    mockUseShares.mockReturnValue(
      makeQueryState([
        {
          id: 'share-pending-1',
          type: 'outgoing',
          status: 'pending',
          caregiverEmail: 'same@example.com',
          createdAt: '2026-02-10T10:00:00.000Z',
          updatedAt: '2026-02-10T10:00:00.000Z',
        },
      ]),
    );
    mockUseMyShareInvites.mockReturnValue(
      makeQueryState([
        {
          id: 'invite-dup',
          caregiverEmail: 'same@example.com',
          inviteeEmail: null,
          status: 'pending',
          createdAt: '2026-02-10T11:00:00.000Z',
        },
        {
          id: 'invite-unique',
          caregiverEmail: 'other@example.com',
          inviteeEmail: null,
          status: 'pending',
          createdAt: '2026-02-10T12:00:00.000Z',
        },
      ]),
    );

    const { getAllByText, getByText } = render(<CaregiverSharingScreen />);

    expect(getByText('same@example.com')).toBeTruthy();
    expect(getByText('other@example.com')).toBeTruthy();
    expect(getAllByText('Cancel Invite')).toHaveLength(2);
  });
});
