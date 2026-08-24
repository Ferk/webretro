#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

missing_submodules=()
while read -r status commit path rest; do
	if [[ "$status" == -* ]]; then
		missing_submodules+=("$path")
	fi
done < <(git submodule status --recursive)

if (( ${#missing_submodules[@]} )); then
	git submodule update --init --recursive -- "${missing_submodules[@]}"
fi

make pages

echo "Built static site in $ROOT_DIR/dist"
