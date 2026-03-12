#!/usr/bin/env bash
set -euo pipefail

# Bump minor version, tag, push, and create a GitHub release
npm version minor --no-git-tag-version
VERSION="v$(node -p "require('./package.json').version")"

git add package.json package-lock.json 2>/dev/null || git add package.json
git commit -m "chore: bump to $VERSION"
git tag "$VERSION"
git push && git push origin "$VERSION"
gh release create "$VERSION" --title "$VERSION" --generate-notes
