package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"laytrace/internal/adapters/awscdk"
	"laytrace/internal/app"
	"laytrace/internal/cost"
	"laytrace/internal/graph"
)

func TestCDKPreview(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake CDK uses a shell script")
	}
	project := t.TempDir()
	scratch := t.TempDir()
	bin := filepath.Join(project, "node_modules", ".bin")
	if err := os.MkdirAll(bin, 0700); err != nil {
		t.Fatal(err)
	}
	write := func(path, data string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(data), 0700); err != nil {
			t.Fatal(err)
		}
	}
	const projectConfig = `{"app":"test-cdk-app"}`
	write(filepath.Join(project, "cdk.json"), projectConfig)
	write(filepath.Join(bin, "cdk"), `#!/bin/sh
set -eu
test -f cdk.json
test "$#" = 10
test "$1 $2 $3 $4 $5 $6 $7 $8 $9" = 'diff ** --no-lookups --method=template --strict --no-quiet --no-fail --no-security-only --output'
if [ "${TEST_CDK_DIFF:-}" = failure ]; then
	echo CANARY_SECRET >&2
	exit 1
fi
out="${10}"
/bin/mkdir "$out/assembly-Stage"
printf '%s' '{"artifacts":{"Main":{"type":"aws:cloudformation:stack","properties":{"templateFile":"Main.template.json"}},"Empty":{"type":"aws:cloudformation:stack","properties":{"templateFile":"Empty.template.json"}},"Stage":{"type":"cdk:cloud-assembly","properties":{"directoryName":"assembly-Stage"}}}}' > "$out/manifest.json"
printf '%s' '{"Resources":{"Queue":{"Type":"AWS::SQS::Queue"},"Bucket":{"Type":"AWS::S3::Bucket"},"Worker":{"Type":"AWS::Lambda::Function"},"Table":{"Type":"AWS::DynamoDB::Table"},"Stable":{"Type":"AWS::S3::Bucket"}}}' > "$out/Main.template.json"
printf '%s' '{"Parameters":{"BootstrapVersion":{"Type":"String"}}}' > "$out/Empty.template.json"
printf '%s' '{"Resources":{"Decoy":{"Type":"AWS::SNS::Topic"}}}' > "$out/Decoy.template.json"
printf '%s' '{"artifacts":{"StageBucket":{"type":"aws:cloudformation:stack","displayName":"Stage/Bucket","properties":{"templateFile":"Nested.template.json","stackName":"ProdBucket"}}}}' > "$out/assembly-Stage/manifest.json"
printf '%s' '{"Resources":{"Bucket":{"Type":"AWS::S3::Bucket"}}}' > "$out/assembly-Stage/Nested.template.json"
printf 'Stack Main (aws://123456789012/eu-west-1)\nResources\n' >&2
case "${TEST_CDK_DIFF:-}" in
	incomplete) printf '[+] AWS::SQS::Queue Queue\n' >&2; exit 0 ;;
	invalid) printf '[?] AWS::SQS::Queue CANARY_SECRET\n' >&2; exit 0 ;;
	mixed)
		printf '%s\n' '[~] AWS::SQS::Queue Worker Queue Queue' ' └─ [~] VisibilityTimeout' \
			'[~] AWS::S3::Bucket Bucket replace' '[~] AWS::Lambda::Function Worker may be replaced' \
			'[+] AWS::DynamoDB::Table Table' '[-] AWS::SQS::Queue Legacy LegacyQueue orphan' \
			'' 'Outputs' '[+] Output Bucket: CANARY_SECRET' >&2
		;;
	*)
		printf '%s\n' '[+] AWS::SQS::Queue Queue' '[+] AWS::S3::Bucket Bucket' \
			'[+] AWS::Lambda::Function Worker' '[+] AWS::DynamoDB::Table Table' '[+] AWS::S3::Bucket Stable' >&2
		;;
esac
printf 'Stack Empty\nThere were no differences\n\n'
printf 'Stack Stage/Bucket (ProdBucket) (aws://123456789012/eu-west-1)\nResources\n\033[32m[+]\033[39m AWS::S3::Bucket Bucket\n'
`)
	t.Setenv("TMPDIR", scratch)
	t.Setenv("PATH", "")
	t.Chdir(project)
	var logs bytes.Buffer
	cli := newTestCLI(&logs, &logs, map[string]app.Provider{"aws-cdk": {Adapter: stubAdapter{
		preview: func(ctx context.Context, onStart func(), inventory *cost.Inventory) (graph.Graph, error) {
			if inventory != nil {
				t.Fatal("CDK preview ran before checking the cost output")
			}
			return (awscdk.Adapter{}).Preview(ctx, onStart, nil)
		},
	}}})
	args := []string{"preview", "--provider=aws-cdk", "--no-open", "--graph-output", "preview.json"}
	const output = "laytrace.html"
	run := func() ([]byte, graph.Graph) {
		t.Helper()
		logs.Reset()
		if cli.Run(args) != 0 {
			t.Fatal(logs.String())
		}
		report, err := os.ReadFile(output)
		if err != nil {
			t.Fatal(err)
		}
		if bytes.Contains(report, []byte("CANARY_SECRET")) || strings.Contains(logs.String(), "CANARY_SECRET") {
			t.Fatal("preview leaked raw diff output")
		}
		_, data, _ := bytes.Cut(report, []byte(`<script id="laytrace-data" type="application/json">`))
		data, _, _ = bytes.Cut(data, []byte("</script>"))
		var g graph.Graph
		if err := json.Unmarshal(data, &g); err != nil {
			t.Fatal(err)
		}
		sidecar, err := os.ReadFile("preview.json")
		if err != nil {
			t.Fatal(err)
		}
		var saved graph.Graph
		if err := json.Unmarshal(sidecar, &saved); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(g, saved) || saved.PreviewProvider != "aws-cdk" || bytes.Contains(sidecar, []byte("CANARY_SECRET")) {
			t.Fatal("saved preview graph differs from the HTML data or leaks raw output")
		}
		return report, g
	}
	_, fresh := run()
	for _, test := range []struct {
		flags []string
		kind  string
	}{
		{[]string{"--graph-output", "./cdk.json"}, "graph"},
		{[]string{"--costs", "--cost-output", "./cdk.json"}, "cost"},
	} {
		logs.Reset()
		conflict := append([]string{"preview", "--provider=aws-cdk", "--no-open", "--output", "blocked.html"}, test.flags...)
		if cli.Run(conflict) == 0 || !strings.Contains(logs.String(), "not a Laytrace "+test.kind+" report") ||
			strings.Contains(logs.String(), "Generating an infrastructure preview") {
			t.Fatalf("CDK preview accepted its configuration as %s output: %s", test.kind, logs.String())
		}
		config, err := os.ReadFile("cdk.json")
		if err != nil || string(config) != projectConfig {
			t.Fatalf("output conflict changed project configuration: %v", err)
		}
		if _, err := os.Stat("blocked.html"); !os.IsNotExist(err) {
			t.Fatalf("output conflict created a report: %v", err)
		}
	}
	if len(fresh.Nodes) != 6 {
		t.Fatalf("expected six resources from manifest templates, got %d", len(fresh.Nodes))
	}
	for _, node := range fresh.Nodes {
		if node.Change != graph.Create {
			t.Fatalf("%s/%s change = %q, want create", node.Stack, node.Name, node.Change)
		}
	}
	t.Setenv("TEST_CDK_DIFF", "mixed")
	initial, mixed := run()
	savedGraph, err := os.ReadFile("preview.json")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]graph.Change{
		"Main/Queue": graph.Update, "Main/Bucket": graph.Replace, "Main/Worker": graph.Update,
		"Main/Table": graph.Create, "Main/Stable": graph.Unchanged, "Main/LegacyQueue": graph.Delete,
		"Stage/Bucket/Bucket": graph.Create,
	}
	for _, node := range mixed.Nodes {
		key := node.Stack + "/" + node.Name
		if node.Change != want[key] {
			t.Errorf("%s change = %q, want %q", key, node.Change, want[key])
		}
		if node.MayReplace != (key == "Main/Worker") {
			t.Errorf("%s mayReplace = %v", key, node.MayReplace)
		}
		delete(want, key)
	}
	if len(want) != 0 {
		t.Fatalf("missing resources: %v", want)
	}
	logs.Reset()
	if cli.Run([]string{"query", "--input", "preview.json", "--change", "replace"}) != 0 {
		t.Fatal(logs.String())
	}
	var result graph.QueryResult
	if err := json.Unmarshal(logs.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Total != 2 || result.ChangeCounts["replace"] != 1 || result.PossibleReplacements != 1 {
		t.Fatalf("expected one planned and one possible replacement: %+v", result)
	}
	for _, resource := range result.Resources {
		switch resource.Name {
		case "Worker":
			if resource.Change != graph.Update || !resource.MayReplace {
				t.Fatalf("lost possible replacement: %+v", resource)
			}
		case "Bucket":
			if resource.Change != graph.Replace || resource.MayReplace {
				t.Fatalf("lost planned replacement: %+v", resource)
			}
		default:
			t.Fatalf("unexpected resource: %+v", resource)
		}
	}
	for mode, message := range map[string]string{
		"failure": "CDK diff failed", "incomplete": "unexpected or incomplete CDK diff output",
		"invalid": "unexpected or incomplete CDK diff output",
	} {
		t.Setenv("TEST_CDK_DIFF", mode)
		logs.Reset()
		if cli.Run(args) == 0 || !strings.Contains(logs.String(), message) || strings.Contains(logs.String(), "CANARY_SECRET") {
			t.Fatalf("%s: missing or unsafe error: %s", mode, logs.String())
		}
		current, err := os.ReadFile(output)
		if err != nil || !bytes.Equal(current, initial) {
			t.Fatalf("%s: failed diff changed existing report: %v", mode, err)
		}
		current, err = os.ReadFile("preview.json")
		if err != nil || !bytes.Equal(current, savedGraph) {
			t.Fatalf("%s: failed diff changed existing graph: %v", mode, err)
		}
	}
	if files, err := os.ReadDir(scratch); err != nil || len(files) != 0 {
		t.Fatalf("temporary CDK assembly was left on disk: %v, %v", files, err)
	}
}
