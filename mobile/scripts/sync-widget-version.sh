#!/bin/bash
#
# sync-widget-version.sh
# 
# Syncs the widget extension's version numbers to match the parent app.
# This script runs during EAS Build AFTER version injection.
#
# Required because:
# 1. EAS Build injects versions (autoIncrement) AFTER config plugins run
# 2. iOS requires app extension versions to match parent app exactly
#

set -e

PBXPROJ_PATH="ios/LumiMD.xcodeproj/project.pbxproj"

if [ ! -f "$PBXPROJ_PATH" ]; then
    echo "[sync-widget-version] project.pbxproj not found at $PBXPROJ_PATH, skipping"
    exit 0
fi

echo "[sync-widget-version] Syncing widget version with parent app..."

# Extract the parent app's CURRENT_PROJECT_VERSION from the main app target
# Look for the Release configuration of the main app (not widget)
PARENT_BUILD_NUMBER=$(grep -A 30 'INFOPLIST_FILE = LumiMD/Info.plist' "$PBXPROJ_PATH" | grep 'CURRENT_PROJECT_VERSION' | head -1 | sed 's/.*= *\([0-9]*\).*/\1/')

# Extract the parent app's MARKETING_VERSION
PARENT_VERSION=$(grep -A 30 'INFOPLIST_FILE = LumiMD/Info.plist' "$PBXPROJ_PATH" | grep 'MARKETING_VERSION' | head -1 | sed 's/.*= *\([^;]*\);.*/\1/' | tr -d ' ')

if [ -z "$PARENT_BUILD_NUMBER" ]; then
    echo "[sync-widget-version] Could not find parent CURRENT_PROJECT_VERSION, using default 1"
    PARENT_BUILD_NUMBER="1"
fi

if [ -z "$PARENT_VERSION" ]; then
    echo "[sync-widget-version] Could not find parent MARKETING_VERSION, using default 1.0.0"
    PARENT_VERSION="1.0.0"
fi

echo "[sync-widget-version] Parent version: $PARENT_VERSION (build $PARENT_BUILD_NUMBER)"

# Create a temporary file for sed operations
TEMP_FILE=$(mktemp)

# Update widget target's CURRENT_PROJECT_VERSION
# Match lines in widget build settings (identified by ../targets/widget/Info.plist)
awk -v build="$PARENT_BUILD_NUMBER" -v version="$PARENT_VERSION" '
    /INFOPLIST_FILE = .*targets\/widget\/Info.plist/ { in_widget = 1 }
    /};/ { if (in_widget) in_widget = 0 }
    in_widget && /CURRENT_PROJECT_VERSION = / {
        sub(/CURRENT_PROJECT_VERSION = [0-9]+/, "CURRENT_PROJECT_VERSION = " build)
    }
    in_widget && /MARKETING_VERSION = / {
        sub(/MARKETING_VERSION = [^;]+/, "MARKETING_VERSION = " version)
    }
    { print }
' "$PBXPROJ_PATH" > "$TEMP_FILE"

mv "$TEMP_FILE" "$PBXPROJ_PATH"

echo "[sync-widget-version] Widget version synced to $PARENT_VERSION (build $PARENT_BUILD_NUMBER)"
