#!/bin/bash

# EAS Build Hook: Widget Version Sync (Post-Install)
# This runs after npm install but BEFORE prebuild
# Note: autoIncrement happens AFTER this hook, so the Xcode build phase
# script in withWidgetVersionSync.js is the primary sync mechanism.
# This hook prepares the project structure and logs environment info.

set -e

echo "🔄 [EAS Post-Install Hook] Widget version sync preparation..."
echo "📍 Working directory: $(pwd)"
echo "📂 Contents: $(ls -la)"

# Check if we're in the mobile directory or need to navigate
if [ -d "targets/widget" ]; then
    WIDGET_PLIST="targets/widget/Info.plist"
elif [ -d "../targets/widget" ]; then
    WIDGET_PLIST="../targets/widget/Info.plist"
else
    echo "⚠️  Widget targets directory not found at this stage (expected before prebuild)"
    echo "ℹ️  The Xcode build phase script will handle version sync after prebuild"
    exit 0
fi

# Log widget plist current state
if [ -f "$WIDGET_PLIST" ]; then
    echo "📄 Current widget Info.plist:"
    cat "$WIDGET_PLIST"
    
    # Ensure the plist uses build variables that will be expanded at build time
    # The actual version values will be set by the Xcode build phase script
    CURRENT_BUILD=$(/usr/libexec/PlistBuddy -c "Print CFBundleVersion" "$WIDGET_PLIST" 2>/dev/null || echo "")
    CURRENT_VERSION=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$WIDGET_PLIST" 2>/dev/null || echo "")
    echo "📊 Current widget version: $CURRENT_VERSION (build $CURRENT_BUILD)"
fi

echo "✅ [EAS Post-Install Hook] Preparation complete!"
echo "ℹ️  Version sync will occur during Xcode build via the [Widget] Sync Version build phase"
