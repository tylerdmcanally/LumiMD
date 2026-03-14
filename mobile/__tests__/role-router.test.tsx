import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

let mockAuthValues = {
  isAuthenticated: false,
  loading: true,
  role: null as string | null,
  roleLoading: true,
};

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValues,
}));

import RoleRouter from '../app/index';

describe('RoleRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthValues = {
      isAuthenticated: false,
      loading: true,
      role: null,
      roleLoading: true,
    };
  });

  it('shows loading spinner while auth is loading', () => {
    const { queryByTestId, toJSON } = render(<RoleRouter />);
    // Should render an ActivityIndicator (no navigation calls)
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to sign-in when not authenticated', async () => {
    mockAuthValues = {
      isAuthenticated: false,
      loading: false,
      role: null,
      roleLoading: false,
    };

    render(<RoleRouter />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sign-in');
    });
  });

  it('redirects to /(patient)/ for patient role', async () => {
    mockAuthValues = {
      isAuthenticated: true,
      loading: false,
      role: 'patient',
      roleLoading: false,
    };

    render(<RoleRouter />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(patient)/');
    });
  });

  it('redirects to /(caregiver)/ for caregiver role', async () => {
    mockAuthValues = {
      isAuthenticated: true,
      loading: false,
      role: 'caregiver',
      roleLoading: false,
    };

    render(<RoleRouter />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(caregiver)/');
    });
  });

  it('defaults to /(patient)/ when role is null but authenticated', async () => {
    mockAuthValues = {
      isAuthenticated: true,
      loading: false,
      role: null,
      roleLoading: false,
    };

    render(<RoleRouter />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(patient)/');
    });
  });

  it('does not navigate while roleLoading is true', () => {
    mockAuthValues = {
      isAuthenticated: true,
      loading: false,
      role: null,
      roleLoading: true,
    };

    render(<RoleRouter />);

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
