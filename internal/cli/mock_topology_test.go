package cli

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMockTopologyCommand(t *testing.T) {
	dir := t.TempDir()
	module := filepath.Join(dir, "module")
	if err := os.MkdirAll(module, 0700); err != nil {
		t.Fatal(err)
	}
	for name, data := range map[string]string{"go.mod": "module example\n", "main.go": "package main\n"} {
		if err := os.WriteFile(filepath.Join(module, name), []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
	}
	tools := filepath.Join(dir, "tools")
	if err := os.Mkdir(tools, 0700); err != nil {
		t.Fatal(err)
	}
	script := `#!/bin/sh
printf '%s' '{"version":3,"deployment":{"resources":[{"urn":"urn:pulumi:dev::base::pulumi:pulumi:Stack::base-dev","type":"pulumi:pulumi:Stack"},{"urn":"urn:pulumi:dev::base::test:Resource::item","type":"test:Resource"}]}}' > "$LAYTRACE_CAPTURE"
`
	if err := os.WriteFile(filepath.Join(tools, "go"), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", tools)
	output := filepath.Join(dir, "result.html")
	var logs bytes.Buffer
	cli := newPulumiCLI(&logs, &logs)
	if cli.Run([]string{"mock-topology", "--provider=pulumi", "--project", "org/base/dev=" + module, "--output", output}) != 0 {
		t.Fatal(logs.String())
	}
	if !strings.Contains(logs.String(), "mock-topology command is deprecated") {
		t.Fatal("missing simulation deprecation notice")
	}
	data, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "SIMULATION") || !strings.Contains(string(data), "+ create") {
		t.Fatal("simulation not labeled")
	}
	for _, args := range [][]string{{"mock-topology", "--provider=pulumi", "--input", "x", "--output", output}, {"render", "--provider=pulumi", "--project", "org/base/dev=" + module, "--output", output}, {"mock-topology", "--provider=pulumi", "--project", "invalid", "--output", output}} {
		if cli.Run(args) == 0 {
			t.Fatal("accepted incompatible flags")
		}
	}
}
