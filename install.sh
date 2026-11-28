#!/bin/bash
set -eu

usage() {
    cat <<'EOF'
Usage: ./install.sh
       ./install.sh --yes [--dir DIRECTORY] [--skills none|codex|claude|all]

Build and install Laytrace from this checkout on macOS or Linux.
  --yes           Install without prompts
  --dir DIRECTORY Override LAYTRACE_BIN_DIR (default: ~/.local/bin)
  --skills CLIENT Install bundled skills (default: none)
  -h, --help      Show this help
EOF
}

fail() { printf 'Laytrace installer: %s\n' "$*" >&2; exit 1; }
bad_usage() { printf 'Laytrace installer: %s\n' "$*" >&2; usage >&2; exit 2; }

yes=false
custom_dir=
skills=
while [ "$#" -gt 0 ]; do
    case "$1" in
        --yes) yes=true ;;
        --dir)
            [ "$#" -ge 2 ] && [ -n "$2" ] && [[ $2 != --* ]] || bad_usage '--dir needs a directory.'
            custom_dir=$2
            shift
            ;;
        --skills)
            case "${2:-}" in
                none|codex|claude|all) skills=$2 ;;
                *) bad_usage '--skills needs none, codex, claude, or all.' ;;
            esac
            shift
            ;;
        -h|--help) usage; exit 0 ;;
        *) bad_usage "Unknown argument: $1" ;;
    esac
    shift
done
if ! "$yes" && { [ -n "$custom_dir" ] || [ -n "$skills" ]; }; then
    bad_usage 'Use --yes with --dir or --skills, or choose those settings in the wizard.'
fi
skills=${skills:-none}

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
frontend_dir="$repo_dir/internal/render/frontend"
install_dir=${custom_dir:-${LAYTRACE_BIN_DIR:-}}
if [ -z "$install_dir" ]; then
    [ -n "${HOME:-}" ] || fail 'Set HOME or pass --yes --dir DIRECTORY.'
    install_dir="$HOME/.local/bin"
fi

case $(uname -s) in
    Darwin|Linux) ;;
    *) fail 'This installer supports macOS and Linux.' ;;
esac

picker() {
    # Keep terminal input on fd 3 while Node reads the program from stdin.
    node - "$@" 3<&0 <<'JS'
const readline = require('node:readline');
const { ReadStream } = require('node:tty');

const [mode, title, prompt, ...options] = process.argv.slice(2);
const input = new ReadStream(3);
const screen = process.stderr;
let editor;
let finished = false;

function finish(status, value) {
    if (finished) return;
    finished = true;
    editor?.close();
    input.setRawMode(false);
    input.destroy();
    screen.write('\x1b[?1049l');
    if (value !== undefined) process.stdout.write(value);
    process.exitCode = status;
}

function show(body) {
    screen.write(`\x1b[2J\x1b[H\x1b[1mLaytrace installer\x1b[0m  ·  ${title}\n\n${prompt}\n\n${body}`);
}

screen.write('\x1b[?1049h');
process.once('SIGHUP', () => finish(129));
process.once('SIGINT', () => finish(130));
process.once('SIGTERM', () => finish(143));
input.on('end', () => finish(2));

if (mode === 'input') {
    editor = readline.createInterface({ input, output: screen, terminal: true });
    editor.once('line', value => finish(0, value));
    editor.once('close', () => finish(2));
    editor.once('SIGINT', () => finish(130));
    input.on('keypress', (_, key) => {
        if (key?.name === 'escape') finish(2);
    });
    editor.setPrompt('> ');
    show('Enter continues  ·  Esc cancels\n\n');
    editor.prompt();
} else {
    const items = [];
    for (let index = 0; index < options.length; index += 2) {
        items.push({ value: options[index], label: options[index + 1] });
    }
    let selected = 0;
    function draw() {
        const list = items.map(({ label }, index) => `${index === selected ? '> ' : '  '}${label}`).join('\n');
        show(`${list}\n\n↑/↓ or Tab to move  ·  Enter to select  ·  Esc to cancel\n`);
    }
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.on('keypress', (_, key) => {
        if (!key) return;
        if (key.name === 'escape') return finish(2);
        if (key.ctrl && key.name === 'c') return finish(130);
        if (key.name === 'return' || key.name === 'enter') return finish(0, items[selected].value);
        if (key.name === 'up' || key.name === 'down' || key.name === 'tab') {
            const step = key.name === 'up' || key.shift ? -1 : 1;
            selected = (selected + step + items.length) % items.length;
            draw();
        }
    });
    draw();
    input.resume();
}
JS
}

cancel_or_fail() {
    if [ "$1" -eq 2 ]; then
        printf 'Installation cancelled.\n'
        exit 0
    fi
    case "$1" in 129|130|143) exit "$1" ;; esac
    fail 'Could not display the wizard. Run ./install.sh --yes for unattended installation.'
}

set_target() {
    case "$install_dir" in
        '~'|'~/'*)
            [ -n "${HOME:-}" ] || fail 'Set HOME to use a path starting with ~.'
            install_dir="$HOME${install_dir#\~}"
            ;;
    esac
    [[ $install_dir != *[[:cntrl:]]* ]] || fail 'The install directory must not contain control characters.'
    case "$install_dir" in
        /*) ;;
        *) install_dir="$PWD/$install_dir" ;;
    esac
    target="${install_dir%/}/Laytrace"
}

check_target() {
    if [ -L "$target" ] || { [ -e "$target" ] && [ ! -f "$target" ]; }; then
        fail "Choose another directory. Expected a regular file or an unused path at $target."
    fi
}

set_target
if ! "$yes"; then
    [ -t 0 ] && [ -t 2 ] && [ -n "${TERM:-}" ] && [ "$TERM" != dumb ] ||
        fail 'The wizard needs an interactive terminal. Run ./install.sh --yes for unattended installation.'
fi
for tool in go node npm; do
    command -v "$tool" >/dev/null 2>&1 || fail "Install $tool and make it available on PATH. See the Install section of README.md."
done
node_version=$(node --version) || fail 'Could not determine the Node.js version.'
if ! [[ $node_version =~ ^v([0-9]+)\.([0-9]+)\.[0-9]+$ ]] ||
    (( BASH_REMATCH[1] < 22 || (BASH_REMATCH[1] == 22 && BASH_REMATCH[2] < 12) )); then
    fail "Use Node.js 22.12 or later (found $node_version)."
fi

if ! "$yes"; then
    location=$(picker menu '1 of 3 | Destination' 'Where should Laytrace be installed?' \
        default "$install_dir" custom 'Enter a different directory') || cancel_or_fail "$?"
    if [ "$location" = custom ]; then
        install_dir=$(picker input '1 of 3 | Destination' 'Enter an installation directory.') || cancel_or_fail "$?"
        [ -n "$install_dir" ] || fail 'Enter a nonempty install directory.'
        set_target
    fi
    skills=$(picker menu '2 of 3 | Agent skills' 'Install the bundled Laytrace skills?' \
        none 'Skip this step' codex 'Codex' claude 'Claude Code' all 'Codex and Claude Code') || cancel_or_fail "$?"
fi

check_target
[ "$skills" = none ] || [ -n "${HOME:-}" ] || fail 'Set HOME to install agent skills.'
action=Install
[ ! -f "$target" ] || action=Replace
if ! "$yes"; then
    summary=$(printf '%s the binary at:\n%s\n\nAgent skills: %s' "$action" "$target" "$skills")
    confirmation=$(picker menu '3 of 3 | Confirm' "$summary" cancel Cancel install "$action") || cancel_or_fail "$?"
    [ "$confirmation" = install ] || cancel_or_fail 2
fi

go_required=$(awk '$1 == "go" { print $2; exit }' "$repo_dir/go.mod")
go -C "$repo_dir" list -m >/dev/null || fail "Use Go $go_required or later and retry."

lock="$frontend_dir/.laytrace-build.lock"
mkdir "$lock" || fail "Could not lock the checkout at $lock. If a previous installer crashed, remove the lock after checking that no build is running."
staging=
cleanup() {
    if [ -n "$staging" ]; then
        rm -f -- "$staging/Laytrace"
        rmdir -- "$staging"
    fi
    rmdir -- "$lock"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p -- "$install_dir" || fail "Could not create $install_dir. Choose a writable directory."
install_dir=$(CDPATH= cd -- "$install_dir" && pwd -P) || fail 'Could not open the installation directory.'
set_target
check_target
staging=$(mktemp -d "$install_dir/.laytrace-install.XXXXXX") || fail "Could not stage a binary in $install_dir."

printf '\n[1/3] Installing viewer dependencies\n'
npm --prefix "$frontend_dir" ci --include=dev --prefer-offline --no-audit --no-fund || fail 'Could not install viewer dependencies. See the npm output above.'
printf '\n[2/3] Building the viewer\n'
npm --prefix "$frontend_dir" run build || fail 'Could not build the viewer. See the npm output above.'
printf '\n[3/3] Building and checking Laytrace\n'
go -C "$repo_dir" build -buildvcs=false -o "$staging/Laytrace" ./cmd/laytrace || fail 'Could not build Laytrace. See the Go output above.'
chmod 755 "$staging/Laytrace" || fail 'Could not make the staged binary executable.'
"$staging/Laytrace" --help >/dev/null || fail 'The staged binary failed its startup check.'

check_target
node -e 'require("node:fs").renameSync(process.argv[1], process.argv[2])' "$staging/Laytrace" "$target" ||
    fail "Could not install the binary at $target."
cleanup
trap - EXIT

printf '\nInstalled %s\n' "$target"
skill_status=0
if [ "$skills" != none ]; then
    printf '\nInstalling agent skills (%s)\n' "$skills"
    if ! "$repo_dir/scripts/install-skills.sh" "$skills"; then
        printf 'Laytrace is installed. Review the errors above and retry the skills from the checkout with ./scripts/install-skills.sh %s\n' "$skills" >&2
        skill_status=1
    fi
fi

fish_quote() {
    local value=${1//\\/\\\\}
    local escaped_quote="\\'"
    printf "'%s'" "${value//\'/$escaped_quote}"
}

user_shell=${SHELL:-sh}
shell_quote() {
    if [ "${user_shell##*/}" = fish ]; then
        fish_quote "$1"
    else
        local escaped_quote="'\\''"
        printf "'%s'" "${1//\'/$escaped_quote}"
    fi
}

resolved=$(command -v Laytrace || :)
if [ -n "$resolved" ] && [ "$resolved" -ef "$target" ]; then
    printf 'Try: Laytrace --help\n'
else
    printf 'Try: %s --help\n' "$(shell_quote "$target")"
    if [[ $install_dir != *:* ]]; then
        printf 'To run Laytrace by name, add its directory to PATH:\n'
        if [ "${user_shell##*/}" = fish ]; then
            printf '  fish_add_path --path --move -- %s\n' "$(shell_quote "$install_dir")"
        else
            printf '  export PATH=%s:"$PATH"\n' "$(shell_quote "$install_dir")"
        fi
    fi
fi
exit "$skill_status"
