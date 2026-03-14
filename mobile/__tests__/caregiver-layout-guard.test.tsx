import React from 'react';
import { render } from '@testing-library/react-native';

let mockAuthValues = {
  role: 'caregiver' as string | null,
  roleLoading: false,
  isAuthenticated: true,
};

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValues,
}));

const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Stack: Object.assign(
    ({ children }: any) => children,
    { Screen: () => null },
  ),
  Redirect: (props: any) => {
    mockRedirect(props.href);
    return null;
  },
}));

import CaregiverLayout from '../app/(caregiver)/_layout';

describe('Caregiver layout guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthValues = { role: 'caregiver', roleLoading: false, isAuthenticated: true };
  });

  it('renders Stack for caregiver role', () => {
    render(<CaregiverLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects patient to root', () => {
    mockAuthValues = { role: 'patient', roleLoading: false, isAuthenticated: true };
    render(<CaregiverLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/');
  });

  it('redirects unauthenticated user to sign-in', () => {
    mockAuthValues = { role: null, roleLoading: false, isAuthenticated: false };
    render(<CaregiverLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/sign-in');
  });

  it('shows loading when roleLoading is true', () => {
    mockAuthValues = { role: null, roleLoading: true, isAuthenticated: false };
    render(<CaregiverLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
