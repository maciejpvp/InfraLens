#!/bin/sh
set -eu

usage() {
    cat <<EOF
Usage: ${0##*/} [all|codex|claude|--dir DIRECTORY] [--dry-run] [--replace]

Install all bundled InfraLens skills for Codex and Claude Code.
  all             Install for both clients (default)
  codex           Install in ~/.agents/skills
  claude          Install in ~/.claude/skills
  --dir DIRECTORY Install in a custom or project-local skills directory
  --dry-run       Show what would happen without writing files
  --replace       Back up and replace conflicting same-named skills
  -h, --help      Show this help
EOF
}

invalid_usage() {
    usage >&2
    exit 2
}

client=
custom_dir=
dry_run=false
replace=false
while [ "$#" -gt 0 ]; do
    case "$1" in
        all|codex|claude)
            [ -z "$client" ] || invalid_usage
            client=$1
            ;;
        --dir)
            [ -z "$client" ] && [ "$#" -ge 2 ] && [ -n "$2" ] || invalid_usage
            case "$2" in -*) invalid_usage ;; esac
            client=custom
            custom_dir=$2
            shift
            ;;
        --dry-run) dry_run=true ;;
        --replace) replace=true ;;
        -h|--help) usage; exit 0 ;;
        *) invalid_usage ;;
    esac
    shift
done

repo_dir=$(CDPATH= cd "$(dirname "$0")/.." && pwd -P)
marker=.infralens-managed
signature='InfraLens skills v1'

install_skill() (
    source=$1
    destination=$2
    links=$(find "$source" -type l -print) || exit 1
    if [ -n "$links" ]; then
        printf 'Bundled skill contains symbolic links: %s\n' "$source" >&2
        exit 1
    fi
    action=Installed
    stage=
    backup=
    previous=
    trap '
        if [ -n "$previous" ] && [ ! -e "$destination" ] && [ ! -L "$destination" ]; then
            mv "$previous" "$destination" || printf "Restore manually from %s\n" "$previous" >&2
        fi
        if [ -n "$backup" ]; then
            rmdir "$backup" 2>/dev/null || :
        fi
        if [ -n "$stage" ]; then
            rm -rf "$stage"
        fi
    ' EXIT
    trap 'exit 1' HUP INT TERM

    if [ -L "$destination" ] && [ "$source" -ef "$destination" ]; then
        action=Migrated
    elif [ -e "$destination" ] || [ -L "$destination" ]; then
        if [ ! -L "$destination" ] && [ -d "$destination" ]; then
            if diff -qr -x "$marker" "$source" "$destination" >/dev/null 2>&1; then
                printf 'Already up to date: %s\n' "$destination"
                exit 0
            fi
            if [ ! -L "$destination/$marker" ] && [ -f "$destination/$marker" ] &&
                grep -qxF "$signature" "$destination/$marker"; then
                action=Updated
            fi
        fi
        if [ "$action" = Installed ]; then
            if ! "$replace"; then
                printf 'Skill already exists and differs: %s. Re-run with --replace to back it up and replace it.\n' "$destination" >&2
                exit 1
            fi
            action=Replaced
        fi
    fi

    if "$dry_run"; then
        printf 'Dry run: %s -> %s\n' "$action" "$destination"
        exit 0
    fi
    stage=$(mktemp -d "$destination_dir/.infralens-stage.XXXXXX") || exit 1
    cp -R "$source" "$stage/skill" || exit 1
    if [ -L "$stage/skill" ]; then
        printf 'Bundled skill directory changed to a symbolic link: %s\n' "$source" >&2
        exit 1
    fi
    if [ -e "$stage/skill/$marker" ] || [ -L "$stage/skill/$marker" ]; then
        printf 'Bundled skill contains reserved file %s: %s\n' "$marker" "$source" >&2
        exit 1
    fi
    printf '%s\n' "$signature" > "$stage/skill/$marker" || exit 1
    if [ "$action" != Installed ]; then
        # Keep backups outside the skills directory so clients cannot discover them.
        backup=$(mktemp -d "$(dirname "$destination_dir")/.infralens-backup.XXXXXX") || exit 1
        previous="$backup/${source##*/}"
        mv "$destination" "$previous" || exit 1
    fi
    mv "$stage/skill" "$destination" || exit 1
    printf '%s: %s\n' "$action" "$destination"
    if [ -n "$previous" ]; then
        printf 'Backup: %s\n' "$previous"
    fi
)

install_skills() (
    destination_dir=$1
    if ! "$dry_run"; then
        mkdir -p -- "$destination_dir" || exit 1
    fi
    if [ -d "$destination_dir" ]; then
        destination_dir=$(CDPATH= cd "$destination_dir" && pwd -P) || exit 1
    fi
    case "$destination_dir/" in
        "$repo_dir/skills/"*)
            printf 'Choose an installation directory outside the bundled skills: %s\n' "$destination_dir" >&2
            exit 1
            ;;
    esac
    if ! "$dry_run"; then
        lock="$destination_dir/.infralens-install.lock"
        if ! mkdir "$lock"; then
            printf 'Could not acquire installer lock: %s\n' "$lock" >&2
            exit 1
        fi
        trap 'rmdir "$lock"' EXIT
        trap 'exit 1' HUP INT TERM
    fi

    failed=0
    for source in "$repo_dir"/skills/*; do
        [ -f "$source/SKILL.md" ] || continue
        install_skill "$source" "$destination_dir/${source##*/}" || failed=1
    done
    exit "$failed"
)

set -- "$repo_dir"/skills/*/SKILL.md
if [ ! -f "$1" ]; then
    printf 'No bundled skills found in %s/skills\n' "$repo_dir" >&2
    exit 1
fi

case "${client:-all}" in
    all)
        status=0
        install_skills "$HOME/.agents/skills" || status=1
        install_skills "$HOME/.claude/skills" || status=1
        exit "$status"
        ;;
    codex) install_skills "$HOME/.agents/skills" ;;
    claude) install_skills "$HOME/.claude/skills" ;;
    custom)
        case "$custom_dir" in
            /*) install_skills "$custom_dir" ;;
            *) install_skills "$PWD/$custom_dir" ;;
        esac
        ;;
esac
