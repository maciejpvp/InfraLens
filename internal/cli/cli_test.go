package cli

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCommands(t *testing.T) {
	for _, command := range []string{"graph", "render"} {
		for _, fixture := range []string{"export", "preview"} {
			t.Run(command+"/"+fixture, func(t *testing.T) {
				output := filepath.Join(t.TempDir(), "result")
				var stdout, stderr bytes.Buffer
				if code := New(&stdout, &stderr).Run([]string{command, "--input", "../../testdata/pulumi/" + fixture + ".json", "--output", output}); code != 0 {
					t.Fatal(stderr.String())
				}
				data, err := os.ReadFile(output)
				if err != nil {
					t.Fatal(err)
				}
				if len(data) == 0 || strings.Contains(string(data), "CANARY_SECRET") || strings.Contains(stdout.String()+stderr.String(), "CANARY_SECRET") {
					t.Fatal("invalid or unsafe output")
				}
			})
		}
	}
}

func TestInputAndOutputProtection(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "input")
	output := filepath.Join(dir, "output")
	bad := []byte(`{"secret":"CANARY_SECRET",`)
	if err := os.WriteFile(input, bad, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(output, []byte("existing"), 0600); err != nil {
		t.Fatal(err)
	}
	var logs bytes.Buffer
	if New(&logs, &logs).Run([]string{"render", "--input", input, "--output", output}) == 0 {
		t.Fatal("accepted malformed input")
	}
	data, _ := os.ReadFile(output)
	if string(data) != "existing" || strings.Contains(logs.String(), "CANARY_SECRET") {
		t.Fatal("destroyed output or leaked input")
	}
	if err := os.WriteFile(input, []byte(`{"version":3,"deployment":{}}`), 0600); err != nil {
		t.Fatal(err)
	}
	for _, alias := range []string{input, filepath.Join(dir, "hardlink"), filepath.Join(dir, "symlink")} {
		if alias != input {
			var err error
			if strings.HasSuffix(alias, "hardlink") {
				err = os.Link(input, alias)
			} else {
				err = os.Symlink(input, alias)
			}
			if err != nil {
				t.Fatal(err)
			}
		}
		if New(&logs, &logs).Run([]string{"graph", "--input", input, "--output", alias}) == 0 {
			t.Fatal("accepted input/output alias")
		}
	}
}

func TestHelpAndInvalidFlags(t *testing.T) {
	for _, args := range [][]string{nil, {"--help"}, {"graph", "--help"}, {"preview", "--help"}, {"mock-topology", "--help"}} {
		var out bytes.Buffer
		if New(&out, &out).Run(args) != 0 || out.Len() == 0 {
			t.Fatal("help failed")
		}
	}
	for _, args := range [][]string{{"unknown"}, {"generate"}, {"simulate"}, {"graph"}, {"render", "--secret=CANARY_SECRET"}} {
		var out bytes.Buffer
		if New(&out, &out).Run(args) == 0 || strings.Contains(out.String(), "CANARY_SECRET") {
			t.Fatal("unsafe argument error")
		}
	}
}

func TestMultipleInputs(t *testing.T) {
	for _, command := range []string{"graph", "render"} {
		output := filepath.Join(t.TempDir(), "result")
		args := []string{command, "--output", output}
		for _, name := range []string{"base", "separation", "transcription"} {
			args = append(args, "--input", "example/"+name+"/dev=../../testdata/pulumi/multi/"+name+".json")
		}
		var logs bytes.Buffer
		if New(&logs, &logs).Run(args) != 0 {
			t.Fatal(logs.String())
		}
		data, err := os.ReadFile(output)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(data), "stackReference") || strings.Contains(string(data), "MULTI_CANARY_SECRET") {
			t.Fatal("missing stack links or secret leak")
		}
	}
}

func TestInputPathsWithEquals(t *testing.T) {
	fixture, err := os.ReadFile("../../testdata/pulumi/multi/base.json")
	if err != nil {
		t.Fatal(err)
	}
	t.Chdir(t.TempDir())
	if err := os.MkdirAll("org/base", 0700); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"stack=dev.json", "org/base/dev=literal.json"} {
		if err := os.WriteFile(path, fixture, 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, input := range []string{"stack=dev.json", "org/base/dev=literal.json", "org/base/dev=stack=dev.json"} {
		var logs bytes.Buffer
		if New(&logs, &logs).Run([]string{"graph", "--input", input, "--output", "result.json"}) != 0 {
			t.Fatalf("%q: %s", input, logs.String())
		}
	}
}

func TestOutputCannotOverwriteAnyInput(t *testing.T) {
	first := filepath.Join(t.TempDir(), "first")
	second := filepath.Join(t.TempDir(), "second")
	for _, p := range []string{first, second} {
		if err := os.WriteFile(p, []byte(`{"version":3,"deployment":{}}`), 0600); err != nil {
			t.Fatal(err)
		}
	}
	var logs bytes.Buffer
	if New(&logs, &logs).Run([]string{"graph", "--input", first, "--input", second, "--output", second}) == 0 {
		t.Fatal("accepted output equal to second input")
	}
	data, _ := os.ReadFile(second)
	if string(data) != `{"version":3,"deployment":{}}` {
		t.Fatal("overwrote input")
	}
}
