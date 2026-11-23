package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"infralens/internal/graph"
	"infralens/internal/graph/awscdk"
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
	write(filepath.Join(project, "cdk.json"), "{}")
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
	cli := New(&logs, &logs, map[string]Provider{"aws-cdk": {Preview: awscdk.Preview}})
	args := []string{"preview", "--provider=aws-cdk", "--no-open"}
	const output = "infralens.html"
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
		_, data, _ := bytes.Cut(report, []byte(`<script id="infralens-data" type="application/json">`))
		data, _, _ = bytes.Cut(data, []byte("</script>"))
		var g graph.Graph
		if err := json.Unmarshal(data, &g); err != nil {
			t.Fatal(err)
		}
		return report, g
	}
	_, fresh := run()
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
		delete(want, key)
	}
	if len(want) != 0 {
		t.Fatalf("missing resources: %v", want)
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
	}
	if files, err := os.ReadDir(scratch); err != nil || len(files) != 0 {
		t.Fatalf("temporary CDK assembly was left on disk: %v, %v", files, err)
	}
}
