import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import RecordVisitScreen from '../app/record-visit';

const mockUseAudioRecording = jest.fn();
const mockStartRecording = jest.fn();
const mockStopRecording = jest.fn();
const mockResetRecording = jest.fn();
const mockUploadAudioFile = jest.fn();
const mockDeleteAudioFile = jest.fn();
const mockCreateVisit = jest.fn();

jest.mock('../lib/hooks/useAudioRecording', () => ({
  useAudioRecording: () => mockUseAudioRecording(),
  MAX_RECORDING_MS: 90 * 60 * 1000,
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'user-1' },
  }),
}));

jest.mock('../lib/storage', () => ({
  uploadAudioFile: (...args: any[]) => mockUploadAudioFile(...args),
  deleteAudioFile: (...args: any[]) => mockDeleteAudioFile(...args),
}));

jest.mock('../lib/api/client', () => ({
  api: { visits: { create: (...args: any[]) => mockCreateVisit(...args) } },
}));

describe('RecordVisitScreen', () => {
  beforeEach(() => {
    mockStartRecording.mockClear();
    mockStopRecording.mockClear();
    mockResetRecording.mockClear();
    mockUseAudioRecording.mockReset();
    mockUploadAudioFile.mockClear();
    mockDeleteAudioFile.mockClear();
    mockCreateVisit.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
  });

  it('stops recording when stop button pressed', () => {
    mockUseAudioRecording.mockReturnValue({
      recordingState: 'recording',
      duration: 1000,
      uri: null,
      isRecording: true,
      isPaused: false,
      hasPermission: true,
      requestPermission: jest.fn(async () => true),
      startRecording: mockStartRecording,
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
      stopRecording: mockStopRecording,
      resetRecording: mockResetRecording,
      autoStopReason: null,
    });

    const { getByText } = render(<RecordVisitScreen />);
    fireEvent.press(getByText('Stop Recording'));
    expect(mockStopRecording).toHaveBeenCalled();
  });

  it('uploads and creates visit when save is pressed', async () => {
    jest.useFakeTimers();

    mockUseAudioRecording.mockReturnValue({
      recordingState: 'stopped',
      duration: 1000,
      uri: 'file:///audio.m4a',
      isRecording: false,
      isPaused: false,
      hasPermission: true,
      requestPermission: jest.fn(async () => true),
      startRecording: mockStartRecording,
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
      stopRecording: mockStopRecording,
      resetRecording: mockResetRecording,
      autoStopReason: null,
    });

    mockUploadAudioFile.mockResolvedValue({
      downloadUrl: 'https://storage/test.m4a',
      storagePath: 'visits/user-1/123.m4a',
    });
    mockCreateVisit.mockResolvedValue({ id: 'visit-1' });

    const { getByText } = render(<RecordVisitScreen />);
    fireEvent.press(getByText('Save Visit'));

    await waitFor(() => {
      expect(mockUploadAudioFile).toHaveBeenCalled();
      expect(mockCreateVisit).toHaveBeenCalledWith(
        expect.objectContaining({
          audioUrl: 'https://storage/test.m4a',
          storagePath: 'visits/user-1/123.m4a',
          status: 'processing',
        }),
      );
    });

    jest.runAllTimers();
    jest.useRealTimers();
  });

  it('cleans up uploaded audio if visit creation fails', async () => {
    mockUseAudioRecording.mockReturnValue({
      recordingState: 'stopped',
      duration: 1000,
      uri: 'file:///audio.m4a',
      isRecording: false,
      isPaused: false,
      hasPermission: true,
      requestPermission: jest.fn(async () => true),
      startRecording: mockStartRecording,
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
      stopRecording: mockStopRecording,
      resetRecording: mockResetRecording,
      autoStopReason: null,
    });

    mockUploadAudioFile.mockResolvedValue({
      downloadUrl: 'https://storage/test.m4a',
      storagePath: 'visits/user-1/123.m4a',
    });
    mockCreateVisit.mockRejectedValue(new Error('create failed'));
    mockDeleteAudioFile.mockResolvedValue(undefined);

    const { getByText } = render(<RecordVisitScreen />);
    fireEvent.press(getByText('Save Visit'));

    await waitFor(() => {
      expect(mockCreateVisit).toHaveBeenCalled();
      expect(mockDeleteAudioFile).toHaveBeenCalledWith('visits/user-1/123.m4a');
    });
  });
});
