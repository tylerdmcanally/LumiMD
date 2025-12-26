#!/bin/bash
# LumiMD Environment Backup Script
# Creates an encrypted backup of all environment variables
# Usage: ./backup-env.sh [backup_name]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$HOME/.lumimd-backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="${1:-env_backup_$TIMESTAMP}"
BACKUP_FILE="$BACKUP_DIR/$BACKUP_NAME.tar.gz.enc"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "🔐 LumiMD Environment Backup"
echo "============================="
echo ""

# Collect all env files
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "📦 Collecting environment files..."

# Functions .env
if [ -f "$PROJECT_ROOT/functions/.env" ]; then
    cp "$PROJECT_ROOT/functions/.env" "$TEMP_DIR/functions.env"
    echo "  ✓ functions/.env"
fi

# Mobile .env
if [ -f "$PROJECT_ROOT/mobile/.env" ]; then
    cp "$PROJECT_ROOT/mobile/.env" "$TEMP_DIR/mobile.env"
    echo "  ✓ mobile/.env"
fi

# Web Portal .env.local
if [ -f "$PROJECT_ROOT/web-portal/.env.local" ]; then
    cp "$PROJECT_ROOT/web-portal/.env.local" "$TEMP_DIR/web-portal.env.local"
    echo "  ✓ web-portal/.env.local"
fi

# GoogleService-Info.plist (Firebase iOS config)
if [ -f "$PROJECT_ROOT/mobile/GoogleService-Info.plist" ]; then
    cp "$PROJECT_ROOT/mobile/GoogleService-Info.plist" "$TEMP_DIR/GoogleService-Info.plist"
    echo "  ✓ GoogleService-Info.plist"
fi

# Create metadata file
cat > "$TEMP_DIR/backup_metadata.txt" << EOF
LumiMD Environment Backup
Created: $(date)
Project: $PROJECT_ROOT
Git Branch: $(cd "$PROJECT_ROOT" && git branch --show-current 2>/dev/null || echo "unknown")
Git Commit: $(cd "$PROJECT_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
EOF

echo ""
echo "🔒 Encrypting backup..."

# Create tarball and encrypt with password
cd "$TEMP_DIR"
tar -czf - . | openssl enc -aes-256-cbc -salt -pbkdf2 -out "$BACKUP_FILE"

echo ""
echo "✅ Backup created successfully!"
echo "   Location: $BACKUP_FILE"
echo ""
echo "📋 To restore, run:"
echo "   ./scripts/restore-env.sh $BACKUP_FILE"
echo ""
echo "⚠️  IMPORTANT: Store your encryption password securely!"
echo "   Consider saving it in a password manager."
