import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS, SIZES } from '../constants/AppConstants';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🔴 App Error Caught by Boundary:', error);
    console.error('Error Info:', errorInfo);
    
    // Store error info for display
    this.setState({
      errorInfo: errorInfo.componentStack,
    });

    // TODO: Send to error tracking service (Sentry, etc.)
    // if (!__DEV__) {
    //   Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } });
    // }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>⚠️</Text>
            </View>
            
            <Text style={styles.title}>Something Went Wrong</Text>
            
            <Text style={styles.message}>
              Don&apos;t worry - your data is safe. This was just a temporary glitch.
            </Text>

            <TouchableOpacity style={styles.button} onPress={this.handleReset}>
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>

            <Text style={styles.helpText}>
              If this keeps happening, please restart the app or contact support.
            </Text>

            {__DEV__ && this.state.error && (
              <View style={styles.debugContainer}>
                <Text style={styles.debugTitle}>Debug Info (Dev Only):</Text>
                <Text style={styles.debugText}>{this.state.error.toString()}</Text>
                {this.state.errorInfo && (
                  <Text style={styles.debugText}>{this.state.errorInfo}</Text>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SIZES.PADDING * 2,
  },
  iconContainer: {
    marginBottom: SIZES.PADDING * 2,
  },
  icon: {
    fontSize: 80,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: FONTS.BOLD,
    color: COLORS.PRIMARY,
    marginBottom: SIZES.PADDING,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    textAlign: 'center',
    marginBottom: SIZES.PADDING * 2,
    lineHeight: 24,
  },
  button: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: SIZES.PADDING * 3,
    paddingVertical: SIZES.PADDING * 1.5,
    borderRadius: SIZES.RADIUS,
    marginBottom: SIZES.PADDING * 2,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
  },
  helpText: {
    fontSize: 14,
    fontFamily: FONTS.REGULAR,
    color: COLORS.GRAY[500],
    textAlign: 'center',
    marginTop: SIZES.PADDING,
  },
  debugContainer: {
    marginTop: SIZES.PADDING * 3,
    padding: SIZES.PADDING,
    backgroundColor: COLORS.GRAY[50],
    borderRadius: SIZES.RADIUS,
    width: '100%',
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.ERROR,
    marginBottom: SIZES.PADDING / 2,
  },
  debugText: {
    fontSize: 11,
    fontFamily: FONTS.MONO || 'Courier',
    color: COLORS.SECONDARY,
    marginTop: SIZES.PADDING / 2,
  },
});

