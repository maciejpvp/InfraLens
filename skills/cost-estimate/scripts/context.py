#!/usr/bin/env python3
"""Prepare Laytrace graph evidence and reuse workflow states across Git snapshots."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


CACHE = Path(".cache/laytrace/cost-estimate")
VERSION = 1
DEFAULT_OUTPUT = "cost-assumptions.json"


def run(*command):
    return subprocess.check_output(command)


def git(*args):
    return run("git", *args)


def paths(data):
    return {os.fsdecode(path) for path in data.split(b"\0") if path}


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def fingerprint(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def file_hash(path):
    with path.open("rb") as stream:
        digest = hashlib.sha256()
        for block in iter(lambda: stream.read(65536), b""):
            digest.update(block)
        return digest.hexdigest()


def read_json(path):
    return json.loads(path.read_bytes())


def read_cache(path):
    try:
        return read_json(path)
    except (FileNotFoundError, ValueError):
        return {}


def write_cache(path, value):
    with tempfile.TemporaryDirectory(dir=CACHE) as staging:
        file = Path(staging) / path.name
        file.write_bytes(encoded(value))
        file.replace(path)


def snapshot(ref, output):
    revision = git("rev-parse", "--verify", "--end-of-options", f"{ref or 'HEAD'}^{{commit}}").decode().strip()
    dirty = {}
    if ref is None:
        changed = paths(git("diff", "--name-only", "--no-renames", "-z", revision, "--"))
        changed |= paths(git("ls-files", "--others", "--exclude-standard", "-z"))
        for name in sorted(changed):
            if name == output or Path(name).is_relative_to(CACHE):
                continue
            path = Path(name)
            if path.is_symlink():
                dirty[name] = ["symlink", os.readlink(path)]
            else:
                dirty[name] = file_hash(path) if path.is_file() else None
    return {"revision": revision, "worktree": ref is None, "dirty": dirty}


def changed_since(previous, current, output):
    old = previous.get("snapshot")
    if not old:
        return None
    result = set()
    if old["revision"] != current["revision"]:
        try:
            result = paths(git("diff", "--name-only", "--no-renames", "-z",
                               old["revision"], current["revision"], "--"))
        except subprocess.CalledProcessError:
            return None
    for name in old["dirty"].keys() | current["dirty"].keys():
        if name not in old["dirty"] or name not in current["dirty"] or old["dirty"][name] != current["dirty"][name]:
            result.add(name)
    return sorted(name for name in result if name != output and not Path(name).is_relative_to(CACHE))


def source_hashes(files, state):
    hashes = {}
    for name in sorted(set(files)):
        path = Path(name)
        if path.is_absolute() or ".." in path.parts or path == Path(".") or path.is_relative_to(CACHE):
            raise ValueError(f"expected a repository-relative source file: {name}")
        if state["worktree"]:
            if not path.is_file() or not path.resolve().is_relative_to(Path.cwd()) or path.is_symlink():
                raise ValueError(f"source is missing or is not a local regular file: {name}")
            hashes[name] = file_hash(path)
        else:
            data = git("cat-file", "blob", f'{state["revision"]}:{name}')
            hashes[name] = hashlib.sha256(data).hexdigest()
    return hashes


def absolute_input(value):
    if Path(value).is_file() or "=" not in value:
        path = Path(value).absolute()
        return str(path), path
    alias, name = value.split("=", 1)
    path = Path(name).absolute()
    return f"{alias}={path}", path


def graph_context(args):
    executable = shutil.which(args.cli)
    if executable is None:
        raise ValueError("Laytrace CLI unavailable; pass a current binary with --cli")
    binary = Path(executable).resolve()
    # A CLI upgrade must regenerate normalized graphs.
    version = file_hash(binary)
    if args.graph:
        graph = args.graph
        payload = read_json(graph)
        summary = json.loads(run(str(binary), "query", "--input", str(graph), "--summary"))
        return graph, payload, summary, None
    inputs = [absolute_input(value) for value in args.input]
    stamps = [file_hash(path) for _, path in inputs]
    key = fingerprint([VERSION, version, args.provider, [value for value, _ in inputs], stamps])
    graph = CACHE / f"graph-{key}.json"
    summary_path = CACHE / f"summary-{key}.json"
    summary = read_cache(summary_path)
    if not summary or not graph.is_file():
        with tempfile.TemporaryDirectory(dir=CACHE) as staging:
            output = Path(staging) / "graph.json"
            command = [str(binary), "graph", "--provider", args.provider, "--output", str(output)]
            for value, _ in inputs:
                command.extend(["--input", value])
            run(*command)
            summary = json.loads(run(str(binary), "query", "--input", str(output), "--summary"))
            if stamps != [file_hash(path) for _, path in inputs]:
                raise ValueError("infrastructure inputs changed while generating the graph")
            output.replace(graph)
            write_cache(summary_path, summary)
    return graph, read_json(graph), summary, fingerprint([args.provider, [value for value, _ in inputs], stamps])


def graph_signatures(graph, summary):
    neighbors = {node["id"]: [] for node in graph["nodes"]}
    nodes = {node["id"]: node for node in graph["nodes"]}
    for edge in graph["edges"]:
        origin, target = edge["from"], edge["to"]
        neighbors[origin].append([edge, nodes[target]])
        if origin != target:
            neighbors[target].append([edge, nodes[origin]])
    resources = {key: fingerprint([node, sorted(neighbors[key], key=encoded)]) for key, node in nodes.items()}
    coverage = {key: summary[key] for key in ("source", "coverage", "omittedRelations")}
    return resources, coverage


def resource_ids(workflow):
    # Unresolved bindings and absent states have no graph evidence to cache.
    ids = set()
    if workflow is None:
        return None
    for step in workflow["steps"]:
        if "resource" in step:
            selector = step["resource"]
            if set(selector) != {"id"}:
                return None
            ids.add(selector["id"])
    return ids


def prepare(previous, source, resources, coverage):
    old_resources = previous.get("resources", {})
    changed = sorted(key for key in old_resources.keys() | resources.keys()
                     if old_resources.get(key) != resources.get(key))
    reusable, review = {}, {}
    for key, entry in sorted(previous.get("entries", {}).items()):
        if coverage != previous.get("coverage") or any(old_resources.get(resource) != resources.get(resource)
                                                       for resource in entry["resources"]):
            review[key] = "infrastructure"
            continue
        try:
            matches = source_hashes(entry["files"], source) == entry["files"]
        except (OSError, ValueError, subprocess.CalledProcessError):
            matches = False
        if matches:
            reusable[key] = entry
        else:
            review[key] = "source"
    return reusable, review, changed


def save(args, plan, source, resources, coverage, reusable, cache_file):
    if read_json(args.plan)["token"] != plan["token"]:
        raise ValueError("inputs or cache changed since prepare; run prepare again")
    assumptions = read_json(args.assumptions)
    if assumptions.get("version") != 2:
        raise ValueError("expected cost assumptions version 2")
    traces = read_json(args.traces)
    entries = {}
    for workflow in assumptions["workflows"]:
        key = workflow["id"]
        state = workflow.get(args.side)
        ids = resource_ids(state)
        if ids is None or not ids.issubset(resources):
            continue
        row = {"label": workflow["label"], "state": state}
        if key in traces and traces[key]:
            row.update(files=source_hashes(traces[key], source), resources=sorted(ids))
            entries[key] = row
        elif key in reusable and row == {field: reusable[key][field] for field in row}:
            entries[key] = reusable[key]
    write_cache(cache_file, {"version": VERSION, "snapshot": source, "inputStamp": plan["inputStamp"],
                             "resources": resources, "coverage": coverage, "entries": entries})
    return {"cachedWorkflows": sorted(entries)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["prepare", "save"])
    parser.add_argument("--scope", required=True, help="stable project, stack and workload scope")
    parser.add_argument("--side", required=True, choices=["before", "after"])
    parser.add_argument("--ref", help="Git commit or ref; omit for the working tree")
    parser.add_argument("--cli", default="Laytrace", help="current Laytrace executable")
    parser.add_argument("--graph", type=Path, help="normalized graph matching this code snapshot")
    parser.add_argument("--provider", choices=["aws-cdk", "pulumi"])
    parser.add_argument("--input", action="append", default=[], help="local IaC input, optionally STACK=FILE")
    parser.add_argument("--plan", type=Path, help="prepare JSON used for this analysis (save only)")
    parser.add_argument("--traces", type=Path, help="JSON object mapping workflow IDs to source paths (save only)")
    parser.add_argument("--assumptions", type=Path, help="custom assumptions path, relative to the working directory")
    args = parser.parse_args()
    if not (bool(args.graph) ^ bool(args.provider and args.input)) or (args.graph and (args.provider or args.input)):
        parser.error("pass --graph or both --provider and --input")
    if args.action == "save" and not (args.plan and args.traces):
        parser.error("save requires --plan and --traces")
    try:
        # Resolve caller paths before moving into the repository root.
        for name in ("graph", "plan", "traces", "assumptions"):
            value = getattr(args, name)
            if value:
                setattr(args, name, value.absolute())
        args.input = [absolute_input(value)[0] for value in args.input]
        if os.sep in args.cli:
            args.cli = str(Path(args.cli).absolute())
        os.chdir(os.fsdecode(git("rev-parse", "--show-toplevel").rstrip(b"\n")))
        args.assumptions = args.assumptions or Path(DEFAULT_OUTPUT).absolute()
        output = str(args.assumptions.relative_to(Path.cwd())) if args.assumptions.is_relative_to(Path.cwd()) else None
        CACHE.mkdir(mode=0o700, parents=True, exist_ok=True)
        cache_file = CACHE / f"trace-{fingerprint([args.scope, args.side])}.json"
        previous = read_cache(cache_file)
        if previous.get("version") != VERSION:
            previous = {}
        source = snapshot(args.ref, output)
        graph, payload, summary, input_stamp = graph_context(args)
        if summary["source"] != "graph":
            raise ValueError("expected one local IaC snapshot per side; preview and simulated graphs have different coverage")
        resources, coverage = graph_signatures(payload, summary)
        reusable, review, changed = prepare(previous, source, resources, coverage)
        plan = {
            "token": fingerprint([source, fingerprint(payload), input_stamp, previous, args.scope, args.side]),
            "graph": str(graph.absolute()), "summary": summary,
            "revision": source["revision"], "worktree": source["worktree"],
            "changedPaths": changed_since(previous, source, output), "changedResourceIds": changed,
            "inputStamp": input_stamp, "inputsChanged": bool(previous) and previous.get("inputStamp") != input_stamp,
            "reusable": {key: {"label": row["label"], "state": row["state"]} for key, row in reusable.items()},
            "review": review,
        }
        if args.action == "save":
            plan = save(args, plan, source, resources, coverage, reusable, cache_file)
        print(json.dumps(plan, sort_keys=True))
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"context: {error}\n")


if __name__ == "__main__":
    main()
