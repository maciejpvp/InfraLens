#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
frontend_dir="$repo_dir/internal/render/frontend"
install_dir=${LAYTRACE_BIN_DIR:-"$HOME/.local/bin"}
target="$install_dir/Laytrace"

if [ -d "$target" ]; then
    printf 'Expected a binary path, found a directory at %s\n' "$target" >&2
    exit 1
fi

npm --prefix "$frontend_dir" ci --prefer-offline --no-audit --no-fund
npm --prefix "$frontend_dir" run build

mkdir -p "$install_dir"
staging=$(mktemp -d "$(CDPATH= cd "$install_dir" && pwd)/.laytrace-update.XXXXXX")
trap 'rm -f "$staging/Laytrace"; rmdir "$staging"' EXIT
go -C "$repo_dir" build -buildvcs=false -o "$staging/Laytrace" ./cmd/laytrace
chmod 755 "$staging/Laytrace"
mv -f "$staging/Laytrace" "$target"

printf 'Updated %s\n' "$target"
