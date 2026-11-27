"""Exercise the skill with a current Laytrace binary passed as the first argument."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile

checkout = Path(__file__).resolve().parents[1]
skill = checkout / "skills/cost-estimate/scripts/context.py"
cli = Path(sys.argv[1]).absolute()
fixtures = checkout / "testdata"

with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    repo = root / "repo"
    repo.mkdir()

    def call(*args, **kw):
        return subprocess.run(args, cwd=repo, text=True, capture_output=True, check=True, **kw).stdout

    def put(path, value):
        path.write_text(json.dumps(value))

    call("git", "init", "-q")
    (repo / "upload.py").write_text("uploads = 1\n")
    (repo / "report.py").write_text("reports = 1\n")
    call("git", "add", ".")
    call("git", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "first")

    template = root / "test.template.json"
    base = {"Resources": {"Uploads": {"Type": "AWS::S3::Bucket"}, "Reports": {"Type": "AWS::S3::Bucket"}}}
    put(template, base)
    trace = root / "trace.json"
    planfile = root / "plan.json"

    def context(action, *args, side="after", infra=None):
        return json.loads(call(sys.executable, str(skill), action, "--cli", str(cli),
                               "--scope", "test", "--side", side, *(infra or (
                                   "--provider", "aws-cdk", "--input", f"Sample={template}"
                               )), *args))

    def ids(plan):
        found = json.loads(call(str(cli), "query", "--input", plan["graph"], "--search", "bucket"))
        return {row["name"]: row["id"] for row in found["resources"]}

    def model(bindings):
        return {"version": 2, "workflows": [
            {"id": workflow, "label": workflow, **{
                side: {"runsPerUser": 1, "steps": [{"id": "bucket", "label": "bucket",
                    "resource": {"id": bindings[name]}, "meters": [
                        {"label": "Writes", "usage": "s3Put", "quantity": 1}
                    ]}]} for side in ("before", "after")
            }} for workflow, name in (("upload", "Uploads"), ("report", "Reports"))
        ]}

    plan = context("prepare")
    assert plan["changedPaths"] is None and not plan["reusable"]
    assert plan == context("prepare")
    graph_time = Path(plan["graph"]).stat().st_mtime_ns
    put(planfile, plan)
    put(trace, {"upload": ["upload.py"], "report": ["report.py"]})
    put(repo / "cost-assumptions.json", model(ids(plan)))
    assert context("save", "--plan", str(planfile), "--traces", str(trace)) == {
        "cachedWorkflows": ["report", "upload"]
    }
    hot = context("prepare")
    assert sorted(hot["reusable"]) == ["report", "upload"] and hot["changedPaths"] == []
    assert Path(hot["graph"]).stat().st_mtime_ns == graph_time
    assert context("prepare", "--ref", "HEAD")["reusable"] == hot["reusable"]
    assert context("prepare", "--ref", "HEAD", side="before")["reusable"] == {}

    (repo / "upload.py").write_text("uploads = 3\n")
    (repo / "new_entry.py").write_text("new = True\n")
    changed = context("prepare")
    assert changed["changedPaths"] == ["new_entry.py", "upload.py"]
    assert changed["review"] == {"upload": "source"} and list(changed["reusable"]) == ["report"]
    put(planfile, changed)
    (repo / "new_entry.py").write_text("new = False\n")
    try:
        context("save", "--plan", str(planfile), "--traces", str(trace))
        raise AssertionError("save should refuse a stale plan")
    except subprocess.CalledProcessError as err:
        assert "changed since prepare" in err.stderr

    (repo / "upload.py").write_text("uploads = 1\n")
    base["Resources"]["Processor"] = {"Type": "AWS::Lambda::Function", "Properties": {"Environment": {
        "Variables": {"BUCKET": {"Ref": "Uploads"}}
    }}}
    put(template, base)
    changed = context("prepare")
    assert changed["inputsChanged"] and changed["graph"] != hot["graph"]
    assert changed["review"] == {"upload": "infrastructure"} and list(changed["reusable"]) == ["report"], changed

    pulumi = context("prepare", infra=("--provider", "pulumi", "--input", str(fixtures / "pulumi/export.json")))
    assert pulumi["summary"]["total"] > 0
    direct = context("prepare", infra=("--graph", changed["graph"]))
    assert direct["changedResourceIds"] == changed["changedResourceIds"]

print("CDK and Pulumi CLI snapshots, graph reuse, Git dependencies, changed relationships, side isolation and stale saves passed")
