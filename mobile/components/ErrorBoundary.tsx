import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors, spacing } from './ui';

type ErrorBoundaryProps = {
  children: React.ReactNode;
  title?: string;
  description?: string;
  onReset?: () => void;
  renderFallback?: (args: { error: Error | null; reset: () => void }) => React.ReactNode;
  variant?: 'full' | 'inline';
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
  }

  resetBoundary = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (resetError) {
        console.error('[ErrorBoundary] onReset failed', resetError);
      }
    }
  };

  renderFallbackContent() {
    const { renderFallback, title, description, variant = 'full' } = this.props;
    const { error } = this.state;

    if (renderFallback) {
      return renderFallback({ error, reset: this.resetBoundary });
    }

    return (
      <View style={[styles.fallbackContainer, variant === 'inline' && styles.inlineContainer]}>
        <Text style={styles.fallbackTitle}>{title ?? 'Something went wrong'}</Text>
        <Text style={styles.fallbackDescription}>
          {description ??
            'We hit an unexpected issue. You can try again or go back and continue using the app.'}
        </Text>
        <Pressable style={styles.fallbackButton} onPress={this.resetBoundary}>
          <Text style={styles.fallbackButtonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  render() {
    if (this.state.hasError) {
      return this.renderFallbackContent();
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(6),
    gap: spacing(3),
    backgroundColor: Colors.background,
  },
  inlineContainer: {
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(4),
    borderRadius: spacing(3),
    backgroundColor: `${Colors.error}08`,
    alignSelf: 'stretch',
  },
  fallbackTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  fallbackDescription: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  fallbackButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
    borderRadius: spacing(3),
  },
  fallbackButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

