package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestPreview(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("fake xdg-open tests the Linux browser launcher")
	}
	fixture, err := os.ReadFile("../../testdata/pulumi/preview.json")
	if err != nil {
		t.Fatal(err)
	}
	var preview struct {
		Steps []json.RawMessage `json:"steps"`
	}
	if err := json.Unmarshal(fixture, &preview); err != nil {
		t.Fatal(err)
	}
	preview.Steps = append(preview.Steps, json.RawMessage(`{"op":"delete","urn":"urn:pulumi:dev::example::aws:sqs/queue:Queue::obsolete","oldState":{"urn":"urn:pulumi:dev::example::aws:sqs/queue:Queue::obsolete","type":"aws:sqs/queue:Queue"}}`))
	fixture, err = json.Marshal(preview)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	project := filepath.Join(dir, "project with spaces #1")
	tools := filepath.Join(dir, "tools")
	previewDir := filepath.Join(dir, "preview=location")
	for _, path := range []string{project, tools, previewDir} {
		if err := os.Mkdir(path, 0700); err != nil {
			t.Fatal(err)
		}
	}
	write := func(path, data string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(data), 0700); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(project, "Pulumi.yaml"), "name: example\nruntime: go\n")
	write(filepath.Join(dir, "preview.json"), string(fixture))
	write(filepath.Join(tools, "pulumi"), `#!/bin/sh
set -eu
test "$*" = 'preview --json --show-sames --non-interactive'
test "$PULUMI_ENABLE_STREAMING_JSON_PREVIEW" = false
test -f Pulumi.yaml
exec /bin/cat "$TEST_PREVIEW"
`)
	write(filepath.Join(tools, "xdg-open"), "#!/bin/sh\nprintf '%s' \"$1\" > \"$TEST_OPENED\"\n")
	opened := filepath.Join(dir, "opened")
	t.Setenv("PATH", tools)
	t.Setenv("TMPDIR", previewDir)
	t.Setenv("PULUMI_ENABLE_STREAMING_JSON_PREVIEW", "true")
	t.Setenv("TEST_PREVIEW", filepath.Join(dir, "preview.json"))
	t.Setenv("TEST_OPENED", opened)
	t.Chdir(project)
	var logs bytes.Buffer
	cli := New(&logs, &logs)
	if cli.Run([]string{"preview"}) != 0 {
		t.Fatal(logs.String())
	}
	output := filepath.Join(project, "infralens.html")
	data, err := os.ReadFile(output)
	if err != nil || !strings.Contains(string(data), `"change":"create"`) || !strings.Contains(string(data), `"change":"unchanged"`) || !strings.Contains(string(data), `"change":"delete"`) || strings.Contains(string(data)+logs.String(), "CANARY_SECRET") {
		t.Fatal("missing preview statuses, HTML, or leaked secrets", err)
	}
	if !bytes.Contains(data, []byte(`<div id="infralens-root"></div>`)) {
		t.Fatal("preview did not embed the React viewer")
	}
	rendered := filepath.Join(dir, "rendered.html")
	if cli.Run([]string{"render", "--input", filepath.Join(dir, "preview.json"), "--output", rendered}) != 0 {
		t.Fatal(logs.String())
	}
	same, err := os.ReadFile(rendered)
	if err != nil || !bytes.Equal(same, data) {
		t.Fatal("preview and render produced different HTML for the same preview", err)
	}
	uri, err := os.ReadFile(opened)
	if err != nil || !strings.HasPrefix(string(uri), "file:///") || !strings.Contains(string(uri), "%20%231/infralens.html") {
		t.Fatalf("browser did not receive an escaped file URL: %s, %v", uri, err)
	}
	if err := os.Remove(opened); err != nil {
		t.Fatal(err)
	}
	if cli.Run([]string{"preview", "--no-open", "--output", "custom.html"}) != 0 {
		t.Fatal(logs.String())
	}
	if _, err := os.Stat(opened); !os.IsNotExist(err) {
		t.Fatal("--no-open opened browser")
	}
	write(filepath.Join(tools, "xdg-open"), "#!/bin/sh\nexit 1\n")
	if cli.Run([]string{"preview"}) != 0 || !strings.Contains(logs.String(), "open the saved HTML manually") {
		t.Fatal("browser failure must preserve successful generation")
	}
	for _, failure := range []string{"#!/bin/sh\necho CANARY_SECRET >&2\nexit 1\n", "#!/bin/sh\nprintf CANARY_SECRET\n"} {
		write(filepath.Join(tools, "pulumi"), failure)
		logs.Reset()
		if cli.Run([]string{"preview"}) == 0 || strings.Contains(logs.String(), "CANARY_SECRET") {
			t.Fatal("missing or unsafe preview error")
		}
		unchanged, _ := os.ReadFile(output)
		if !bytes.Equal(unchanged, data) {
			t.Fatal("failed preview overwrote existing HTML")
		}
	}
	for _, args := range [][]string{{"preview", "--unknown=CANARY_SECRET"}, {"preview", "positional"}, {"preview", "--output", "Pulumi.yaml"}} {
		logs.Reset()
		if cli.Run(args) == 0 || strings.Contains(logs.String(), "CANARY_SECRET") {
			t.Fatal("accepted invalid flags or leaked arguments")
		}
	}
	t.Chdir(dir)
	if cli.Run([]string{"preview"}) == 0 {
		t.Fatal("accepted directory without a Pulumi project")
	}
}
