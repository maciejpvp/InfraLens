package cli

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

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
test "$#" = 6
test "$1 $2 $3 $4 $5" = 'synth --all --no-lookups --quiet --output'
if [ "${TEST_CDK_FAIL:-}" = 1 ]; then
	echo CANARY_SECRET >&2
	exit 1
fi
/bin/mkdir "$6/assembly-Stage"
printf '%s' '{"artifacts":{"Main":{"type":"aws:cloudformation:stack","properties":{"templateFile":"Main.template.json"}},"Empty":{"type":"aws:cloudformation:stack","properties":{"templateFile":"Empty.template.json"}},"Stage":{"type":"cdk:cloud-assembly","properties":{"directoryName":"assembly-Stage"}}}}' > "$6/manifest.json"
printf '%s' '{"Resources":{"Queue":{"Type":"AWS::SQS::Queue"}}}' > "$6/Main.template.json"
printf '%s' '{"Parameters":{"BootstrapVersion":{"Type":"String"}}}' > "$6/Empty.template.json"
printf '%s' '{"Resources":{"Decoy":{"Type":"AWS::SNS::Topic"}}}' > "$6/Decoy.template.json"
printf '%s' '{"artifacts":{"StageBucket":{"type":"aws:cloudformation:stack","displayName":"Stage/Bucket","properties":{"templateFile":"Nested.template.json"}}}}' > "$6/assembly-Stage/manifest.json"
printf '%s' '{"Resources":{"Bucket":{"Type":"AWS::S3::Bucket"}}}' > "$6/assembly-Stage/Nested.template.json"
`)
	t.Setenv("TMPDIR", scratch)
	t.Setenv("PATH", "")
	t.Chdir(project)
	var logs bytes.Buffer
	cli := New(&logs, &logs, map[string]Provider{"aws-cdk": {Preview: awscdk.Preview}})
	args := []string{"preview", "--provider=aws-cdk", "--no-open"}
	if cli.Run(args) != 0 {
		t.Fatal(logs.String())
	}
	const output = "infralens.html"
	initial, err := os.ReadFile(output)
	if err != nil || !bytes.Contains(initial, []byte("AWS::SQS::Queue")) ||
		!bytes.Contains(initial, []byte("Stage/Bucket")) || bytes.Contains(initial, []byte("AWS::SNS::Topic")) {
		t.Fatalf("preview did not render precisely the manifest's stacks: %v", err)
	}
	t.Setenv("TEST_CDK_FAIL", "1")
	logs.Reset()
	if cli.Run(args) == 0 || !strings.Contains(logs.String(), "CDK synthesis failed") || strings.Contains(logs.String(), "CANARY_SECRET") {
		t.Fatalf("missing or unsafe synthesis error: %s", logs.String())
	}
	current, err := os.ReadFile(output)
	if err != nil || !bytes.Equal(current, initial) {
		t.Fatalf("failed synthesis changed existing report: %v", err)
	}
	if files, err := os.ReadDir(scratch); err != nil || len(files) != 0 {
		t.Fatalf("temporary CDK assembly was left on disk: %v, %v", files, err)
	}
}
