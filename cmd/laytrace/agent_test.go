package main

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"strings"
	"testing"

	"laytrace/internal/graph"
)

func TestAgentPreviewAndQueries(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake Pulumi uses a shell script")
	}
	dir := t.TempDir()
	bin := t.TempDir()
	fixture, err := filepath.Abs("../../docs/examples/image-pipeline.preview.json")
	if err != nil {
		t.Fatal(err)
	}
	write := func(path, content string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(content), 0700); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(dir, "Pulumi.yaml"), "name: image-pipeline\nruntime: go\n")
	write(filepath.Join(bin, "pulumi"), "#!/bin/sh\nexec /bin/cat \"$LAYTRACE_TEST_FIXTURE\"\n")
	t.Setenv("PATH", bin)
	t.Setenv("LAYTRACE_TEST_FIXTURE", fixture)
	t.Setenv("LAYTRACE_TEST_PROCESS", "1")

	command := func(args ...string) *exec.Cmd {
		cmd := exec.CommandContext(t.Context(), os.Args[0], append([]string{"-test.run=^TestLaytraceProcess$", "--"}, args...)...)
		cmd.Dir = dir
		return cmd
	}
	if output, err := command("preview", "--provider=pulumi", "--no-open", "--output", "report.html", "--graph-output", "graph.json").CombinedOutput(); err != nil {
		t.Fatalf("preview: %v: %s", err, output)
	}
	read := func(name string) []byte {
		t.Helper()
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		return data
	}
	html := read("report.html")
	_, payload, _ := bytes.Cut(html, []byte(`<script id="laytrace-data" type="application/json">`))
	payload, _, _ = bytes.Cut(payload, []byte("</script>"))
	var embedded, saved graph.Graph
	if err := json.Unmarshal(payload, &embedded); err != nil {
		t.Fatal(err)
	}
	sidecar := read("graph.json")
	if err := json.Unmarshal(sidecar, &saved); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(embedded, saved) || saved.PreviewProvider != "pulumi" {
		t.Fatal("the HTML and JSON graph disagree")
	}
	write(filepath.Join(dir, "broken.json"), `{"schemaVersion":1,"nodes":[],"edges":[{"from":"a","to":"b","kind":"triggers","evidence":[{"source":"rule"}]}]}`)
	query := func(path string, args ...string) graph.QueryResult {
		t.Helper()
		output, err := command(append([]string{"query", "--input", path}, args...)...).CombinedOutput()
		if err != nil {
			t.Fatalf("query: %v: %s", err, output)
		}
		var result graph.QueryResult
		if err := json.Unmarshal(output, &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	for _, args := range [][]string{{"mcp"}, {"query", "--input", "broken.json"}, {"query", "--input", "graph.json", "--limit", "26"}} {
		if output, err := command(args...).Output(); err == nil || len(output) != 0 {
			t.Fatalf("unexpected CLI result for %v: %s, %v", args, output, err)
		}
	}

	if output, err := command("render", "--provider=pulumi", "--input", fixture, "--output", "offline.html", "--graph-output", "offline.json").CombinedOutput(); err != nil {
		t.Fatalf("offline render: %v: %s", err, output)
	}
	if !bytes.Equal(read("offline.html"), html) || !bytes.Equal(read("offline.json"), sidecar) {
		t.Fatal("saved preview and live preview did not produce equivalent reports and graphs")
	}
	savedInput, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	write(filepath.Join(dir, "saved-preview.json"), string(savedInput))
	if output, err := command("render", "--provider=pulumi", "--input", "saved-preview.json",
		"--output", "offline.html", "--graph-output", "saved-preview.json").CombinedOutput(); err == nil ||
		!bytes.Contains(output, []byte("input and output must be different files")) {
		t.Fatalf("render accepted its input as a graph output: %s, %v", output, err)
	}
	if !bytes.Equal(read("saved-preview.json"), savedInput) || !bytes.Equal(read("offline.html"), html) {
		t.Fatal("output conflict modified existing files")
	}
	summary := query("graph.json", "--summary")
	if summary.Source != "pulumi-preview" || summary.Total != len(saved.Nodes) || len(summary.Resources) != 0 ||
		summary.ChangeCounts["update"] != 1 || summary.ChangeCounts["unchanged"] == 0 {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	first := query("graph.json", "--changed", "--limit", "1")
	second := query("graph.json", "--changed", "--limit", "1", "--offset", "1")
	if first.NextOffset != 1 || first.ChangeCounts["unchanged"] != 0 ||
		len(first.Resources) != 1 || len(second.Resources) != 1 || first.Resources[0].ID >= second.Resources[0].ID {
		t.Fatalf("unexpected pages: %+v, %+v", first, second)
	}
	changed := query(filepath.Join(dir, "graph.json"), "--search", "resizeimage", "--type", "aws:lambda/function:Function", "--change", "update")
	if changed.Total != 1 || len(changed.Resources) != 1 || changed.Resources[0].Change != graph.Update {
		t.Fatalf("unexpected search result: %+v", changed)
	}
	var before, after bool
	for _, r := range changed.Relations {
		before = before || (r.State == "before" && len(r.Evidence) > 0)
		after = after || (r.State == "after" && len(r.Evidence) > 0)
	}
	if !before || !after {
		t.Fatalf("missing before or after evidence: %+v", changed.Relations)
	}
	id := changed.Resources[0].ID
	truncated := query("graph.json", "--id", id, "--limit", "1")
	next := query("graph.json", "--id", id, "--limit", "1", "--relation-offset", "1")
	if len(truncated.Relations) != 1 || truncated.NextRelationOffset != 1 || !truncated.RelationsTruncated ||
		len(next.Relations) != 1 || reflect.DeepEqual(truncated.Relations, next.Relations) {
		t.Fatalf("unexpected relationship pages: %+v, %+v", truncated, next)
	}
	write(filepath.Join(dir, "cdk-graph.json"), strings.Replace(string(sidecar), `"previewProvider": "pulumi"`, `"previewProvider": "aws-cdk"`, 1))
	cdk := query("cdk-graph.json", "--id", id)
	if cdk.Source != "aws-cdk-preview" || !strings.Contains(cdk.Coverage, "Only target relationships") || len(cdk.Relations) == 0 {
		t.Fatalf("CDK result did not describe coverage: %+v", cdk)
	}
	for _, r := range cdk.Relations {
		if r.State != "after" {
			t.Fatalf("CDK result claimed before relationships: %+v", r)
		}
	}

}

func TestLaytraceProcess(t *testing.T) {
	if os.Getenv("LAYTRACE_TEST_PROCESS") != "1" {
		return
	}
	separator := slices.Index(os.Args, "--")
	if separator < 0 {
		t.Fatal("missing CLI argument separator")
	}
	os.Args = append(os.Args[:1], os.Args[separator+1:]...)
	main()
}
