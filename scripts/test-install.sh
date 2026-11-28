#!/bin/bash
set -eu

repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
work=$(mktemp -d "${TMPDIR:-/tmp}/laytrace-install-test.XXXXXX")
work=$(CDPATH= cd -- "$work" && pwd -P)
trap 'rm -rf -- "$work"' EXIT
source_dir="$work/source"
mkdir -p "$source_dir/internal/render/frontend" "$source_dir/scripts" "$work/tools" "$work/home"
cp "$repo/install.sh" "$repo/go.mod" "$source_dir/"
export PATH="$work/tools:$PATH" HOME="$work/home" SHELL=/bin/bash
export LAYTRACE_BIN_DIR="$work/default destination" SKILLS_LOG="$work/skills"

cat > "$work/tools/go" <<'EOF'
#!/bin/bash
set -eu
case "$3" in
    list) exit 0 ;;
    build)
        [ "${FAIL_BUILD:-0}" = 0 ] || exit 1
        [ "$5" = -o ]
        cat > "$6" <<'BINARY'
#!/bin/sh
[ "$1" = --help ] && printf 'New Laytrace\n'
BINARY
        ;;
    *) exit 2 ;;
esac
EOF
cat > "$work/tools/npm" <<'EOF'
#!/bin/sh
set -eu
case "$3" in
    ci) [ "$4" = --include=dev ] ;;
    run) [ "$4" = build ] ;;
    *) exit 2 ;;
esac
EOF
cat > "$source_dir/scripts/install-skills.sh" <<'EOF'
#!/bin/sh
printf '%s\n' "$1" >> "$SKILLS_LOG"
[ "${FAIL_SKILLS:-0}" = 0 ]
EOF
chmod +x "$work/tools/go" "$work/tools/npm" "$source_dir/scripts/install-skills.sh"

expect_failure() {
    local message=$1
    shift
    if "$@" > "$work/log" 2>&1; then
        printf 'Expected failure: %s\n' "$message" >&2
        exit 1
    fi
    grep -F "$message" "$work/log"
}

cd "$work"
installer="$source_dir/install.sh"
"$installer" --help >/dev/null
expect_failure 'needs an interactive terminal' "$installer" </dev/null
"$installer" --yes > "$work/log"
[ "$("$LAYTRACE_BIN_DIR/Laytrace" --help)" = 'New Laytrace' ]
[ ! -e "$SKILLS_LOG" ]

destination="bin with spaces and 'quotes'"
"$installer" --yes --dir "$destination" --skills codex > "$work/log"
[ "$(cat "$SKILLS_LOG")" = codex ]
target="$work/$destination/Laytrace"
[ "$("$target" --help)" = 'New Laytrace' ]
path_command=$(sed -n '/^  export PATH=/s/^  //p' "$work/log")
[ -n "$path_command" ]
(eval "$path_command"; [ "$(command -v Laytrace)" -ef "$target" ])

printf 'Old binary\n' > "$target"
expect_failure 'Could not build Laytrace' env FAIL_BUILD=1 "$installer" --yes --dir "$destination"
[ "$(cat "$target")" = 'Old binary' ]
[ -z "$(find "$work/$destination" -name '.laytrace-install.*' -print)" ]
[ ! -e "$source_dir/internal/render/frontend/.laytrace-build.lock" ]

expect_failure 'Laytrace is installed' env FAIL_SKILLS=1 "$installer" --yes --dir "$destination" --skills all
[ "$("$target" --help)" = 'New Laytrace' ]
[ "$(tail -n 1 "$SKILLS_LOG")" = all ]

mkdir -p "$work/directory/Laytrace" "$work/link"
ln -s "$work/untouched" "$work/link/Laytrace"
expect_failure 'Expected a regular file' "$installer" --yes --dir directory
expect_failure 'Expected a regular file' "$installer" --yes --dir link
[ -L "$work/link/Laytrace" ] && [ ! -e "$work/untouched" ]

if command -v expect >/dev/null 2>&1; then
    export INSTALLER="$installer" WIZARD_DIR="$work/wizard destination" TERM=xterm
    printf '#!/bin/sh\nexit 99\n' > "$work/tools/dialog"
    chmod +x "$work/tools/dialog"
    expect <<'TCL'
set timeout 10
log_user 0
proc see {text} {
    expect {
        -exact $text {return}
        timeout {error "Timed out waiting for: $text"}
        eof {error "Installer exited before: $text"}
    }
}
proc wait_success {} {
    expect eof
    if {[lindex [wait] 3] != 0} {error "Installer failed"}
}
spawn -noecho $env(INSTALLER)
see "Where should Laytrace be installed?"
send -- "\033"
see "Installation cancelled."
wait_success
spawn -noecho $env(INSTALLER)
see "Where should Laytrace be installed?"
send -- "\033\[B\r"
see "Enter an installation directory."
send -- "$env(WIZARD_DIR)\r"
see "Install the bundled Laytrace skills?"
send -- "\033\[B\r"
see "Agent skills: codex"
send -- "\033\[B\r"
see "Installed $env(WIZARD_DIR)/Laytrace"
wait_success
TCL
    [ "$("$WIZARD_DIR/Laytrace" --help)" = 'New Laytrace' ]
    [ "$(tail -n 1 "$SKILLS_LOG")" = codex ]
fi
printf 'Installer regression checks passed.\n'
