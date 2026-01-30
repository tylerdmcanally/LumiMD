#!/bin/bash

# EAS Build Hook: Sync Widget Version
# This runs after EAS has incremented the build number but before Xcode archive
# It ensures the widget extension has the same version as the main app

set -e

echo "🔄 [EAS Hook] Starting widget version sync..."

# Navigate to the ios directory
cd ios

# Find the parent app's Info.plist
PARENT_PLIST=""
if [ -f "lumimd/Info.plist" ]; then
    PARENT_PLIST="lumimd/Info.plist"
elif [ -f "LumiMD/Info.plist" ]; then
    PARENT_PLIST="LumiMD/Info.plist"
fi

if [ -z "$PARENT_PLIST" ]; then
    echo "⚠️  Parent Info.plist not found, skipping widget version sync"
    exit 0
fi

# Read version info from parent app
PARENT_BUILD=$(/usr/libexec/PlistBuddy -c "Print CFBundleVersion" "$PARENT_PLIST" 2>/dev/null || echo "")
PARENT_VERSION=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$PARENT_PLIST" 2>/dev/null || echo "")

echo "📱 Parent app version: $PARENT_VERSION (build $PARENT_BUILD)"

if [ -z "$PARENT_BUILD" ] || [ -z "$PARENT_VERSION" ]; then
    echo "⚠️  Could not read version from parent Info.plist"
    exit 0
fi

# Update widget Info.plist
WIDGET_PLIST="../targets/widget/Info.plist"
if [ -f "$WIDGET_PLIST" ]; then
    echo "📝 Updating widget Info.plist..."
    
    # Update or add CFBundleVersion
    /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $PARENT_BUILD" "$WIDGET_PLIST" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleVersion string $PARENT_BUILD" "$WIDGET_PLIST" 2>/dev/null || true
    
    # Update or add CFBundleShortVersionString
    /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $PARENT_VERSION" "$WIDGET_PLIST" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $PARENT_VERSION" "$WIDGET_PLIST" 2>/dev/null || true
    
    echo "✅ Widget Info.plist updated"
fi

# Also update the widget target's build settings in the Xcode project
PBXPROJ=""
if [ -f "lumimd.xcodeproj/project.pbxproj" ]; then
    PBXPROJ="lumimd.xcodeproj/project.pbxproj"
elif [ -f "LumiMD.xcodeproj/project.pbxproj" ]; then
    PBXPROJ="LumiMD.xcodeproj/project.pbxproj"
fi

if [ -n "$PBXPROJ" ]; then
    echo "📝 Updating widget build settings in $PBXPROJ..."
    
    # Use sed to update CURRENT_PROJECT_VERSION for widget target configurations
    # This is a bit crude but reliable
    
    # Create a temp file for the modified content
    TEMP_FILE=$(mktemp)
    
    # Process the pbxproj file
    # We need to find widget build configurations and update their version settings
    awk -v build="$PARENT_BUILD" -v version="$PARENT_VERSION" '
    BEGIN { in_widget_config = 0 }
    /INFOPLIST_FILE.*targets\/widget/ { in_widget_config = 1 }
    in_widget_config && /^[[:space:]]*\};/ { in_widget_config = 0 }
    in_widget_config && /CURRENT_PROJECT_VERSION = / {
        gsub(/CURRENT_PROJECT_VERSION = [0-9]+;/, "CURRENT_PROJECT_VERSION = " build ";")
    }
    in_widget_config && /MARKETING_VERSION = / {
        gsub(/MARKETING_VERSION = [^;]+;/, "MARKETING_VERSION = " version ";")
    }
    { print }
    ' "$PBXPROJ" > "$TEMP_FILE"
    
    mv "$TEMP_FILE" "$PBXPROJ"
    
    echo "✅ Widget build settings updated in pbxproj"
fi

echo "🎉 [EAS Hook] Widget version sync complete!"
