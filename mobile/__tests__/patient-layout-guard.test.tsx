import React from 'react';
import { render } from '@testing-library/react-native';

let mockAuthValues = {
  role: 'patient' as string | null,
  roleLoading: false,
  isAuthenticated: true,
};

// The layout file imports from '../../contexts/AuthContext' relative to its location,
// which resolves to 'contexts/AuthContext'. Jest resolves mock paths relative to the
// test file, so we mock '../contexts/AuthContext' (one level up from __tests__/).
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

import PatientLayout from '../app/(patient)/_layout';

describe('Patient layout guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthValues = { role: 'patient', roleLoading: false, isAuthenticated: true };
  });

  it('renders Stack for patient role', () => {
    render(<PatientLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects caregiver to root', () => {
    mockAuthValues = { role: 'caregiver', roleLoading: false, isAuthenticated: true };
    render(<PatientLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/');
  });

  it('redirects unauthenticated user to sign-in', () => {
    mockAuthValues = { role: null, roleLoading: false, isAuthenticated: false };
    render(<PatientLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/sign-in');
  });

  it('shows loading when roleLoading is true', () => {
    mockAuthValues = { role: null, roleLoading: true, isAuthenticated: false };
    render(<PatientLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
