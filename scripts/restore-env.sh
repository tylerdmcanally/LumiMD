#!/bin/bash
# LumiMD Environment Restore Script
# Restores environment variables from an encrypted backup
# Usage: ./restore-env.sh <backup_file>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Available backups:"
    ls -la "$HOME/.lumimd-backups/" 2>/dev/null || echo "  No backups found"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "🔐 LumiMD Environment Restore"
echo "=============================="
echo ""
echo "📦 Restoring from: $BACKUP_FILE"
echo ""

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Decrypt and extract
echo "🔓 Decrypting backup..."
openssl enc -aes-256-cbc -d -salt -pbkdf2 -in "$BACKUP_FILE" | tar -xzf - -C "$TEMP_DIR"

echo ""
echo "📋 Backup metadata:"
cat "$TEMP_DIR/backup_metadata.txt" 2>/dev/null || echo "  No metadata found"
echo ""

# Confirm before restoring
read -p "⚠️  This will overwrite existing .env files. Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled."
    exit 0
fi

echo ""
echo "📥 Restoring environment files..."

# Restore functions .env
if [ -f "$TEMP_DIR/functions.env" ]; then
    cp "$TEMP_DIR/functions.env" "$PROJECT_ROOT/functions/.env"
    echo "  ✓ functions/.env"
fi

# Restore mobile .env
if [ -f "$TEMP_DIR/mobile.env" ]; then
    cp "$TEMP_DIR/mobile.env" "$PROJECT_ROOT/mobile/.env"
    echo "  ✓ mobile/.env"
fi

# Restore web portal .env.local
if [ -f "$TEMP_DIR/web-portal.env.local" ]; then
    cp "$TEMP_DIR/web-portal.env.local" "$PROJECT_ROOT/web-portal/.env.local"
    echo "  ✓ web-portal/.env.local"
fi

# Restore GoogleService-Info.plist
if [ -f "$TEMP_DIR/GoogleService-Info.plist" ]; then
    cp "$TEMP_DIR/GoogleService-Info.plist" "$PROJECT_ROOT/mobile/GoogleService-Info.plist"
    echo "  ✓ GoogleService-Info.plist"
fi

echo ""
echo "✅ Restore complete!"
echo ""
echo "📋 Next steps:"
echo "   1. cd functions && npm install"
echo "   2. cd mobile && npm install"
echo "   3. cd web-portal && npm install"
echo "   4. Run 'npx expo prebuild --clean' if iOS needs rebuilding"
