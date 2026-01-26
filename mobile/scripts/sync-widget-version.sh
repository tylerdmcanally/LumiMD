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

PBXPROJ_PATH=""
if [ -f "ios/lumimd.xcodeproj/project.pbxproj" ]; then
    PBXPROJ_PATH="ios/lumimd.xcodeproj/project.pbxproj"
elif [ -f "ios/LumiMD.xcodeproj/project.pbxproj" ]; then
    PBXPROJ_PATH="ios/LumiMD.xcodeproj/project.pbxproj"
elif [ -f "../ios/lumimd.xcodeproj/project.pbxproj" ]; then
    PBXPROJ_PATH="../ios/lumimd.xcodeproj/project.pbxproj"
elif [ -f "../ios/LumiMD.xcodeproj/project.pbxproj" ]; then
    PBXPROJ_PATH="../ios/LumiMD.xcodeproj/project.pbxproj"
fi

if [ -z "$PBXPROJ_PATH" ] || [ ! -f "$PBXPROJ_PATH" ]; then
    echo "[sync-widget-version] project.pbxproj not found at $PBXPROJ_PATH, skipping"
    exit 0
fi

echo "[sync-widget-version] Syncing widget version with parent app..."

# Detect widget targets up front so we can warn loudly if none exist.
WIDGET_TARGET_COUNT=$(grep -c 'INFOPLIST_FILE = .*[Ww]idget.*Info.plist' "$PBXPROJ_PATH" || true)
if [ "$WIDGET_TARGET_COUNT" -eq 0 ]; then
    echo "[sync-widget-version] WARNING: No widget Info.plist entries found in project.pbxproj."
    echo "[sync-widget-version] WARNING: Widget version sync will not run until a widget target exists."
fi

# Extract the parent app's CURRENT_PROJECT_VERSION and MARKETING_VERSION
# Look for the build settings block that references the app Info.plist.
PARENT_BUILD_NUMBER=$(awk '
    /INFOPLIST_FILE = .*[Ll]umi[dD]\/Info.plist/ { in_app = 1 }
    /};/ { if (in_app) in_app = 0 }
    in_app && /CURRENT_PROJECT_VERSION = / {
        gsub(/^[^=]*= */, "", $0);
        gsub(/;$/, "", $0);
        print $0;
        exit;
    }
' "$PBXPROJ_PATH")

PARENT_VERSION=$(awk '
    /INFOPLIST_FILE = .*[Ll]umi[dD]\/Info.plist/ { in_app = 1 }
    /};/ { if (in_app) in_app = 0 }
    in_app && /MARKETING_VERSION = / {
        gsub(/^[^=]*= */, "", $0);
        gsub(/;$/, "", $0);
        gsub(/[[:space:]]+/, "", $0);
        print $0;
        exit;
    }
' "$PBXPROJ_PATH")

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
# Match lines in widget build settings (identified by a widget Info.plist path)
awk -v build="$PARENT_BUILD_NUMBER" -v version="$PARENT_VERSION" '
    /INFOPLIST_FILE = .*[Ww]idget.*Info\.plist/ { in_widget = 1 }
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

if [ "$WIDGET_TARGET_COUNT" -gt 0 ]; then
    echo "[sync-widget-version] Widget version synced to $PARENT_VERSION (build $PARENT_BUILD_NUMBER)"
else
    echo "[sync-widget-version] Skipped widget version sync (no widget targets found)."
fi
