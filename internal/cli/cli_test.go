package cli

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"infralens/internal/graph"
	"infralens/internal/graph/awscdk"
	"infralens/internal/graph/pulumi"
	"infralens/internal/graph/pulumi/simulate"
)

func newPulumiCLI(stdout, stderr io.Writer) *CLI {
	return New(stdout, stderr, map[string]Provider{
		"pulumi": {ReadInputs: pulumi.ReadInputs, Preview: pulumi.Preview, MockTopology: simulate.RunInputs},
	})
}

func TestInjectedProvider(t *testing.T) {
	dir := t.TempDir()
	inputs := []string{filepath.Join(dir, "first"), filepath.Join(dir, "second")}
	for _, input := range inputs {
		if err := os.WriteFile(input, []byte(filepath.Base(input)), 0600); err != nil {
			t.Fatal(err)
		}
	}
	result := graph.Graph{
		SchemaVersion: 1,
		Nodes: []graph.Node{
			{ID: "example", Name: "Fixture from provider", Type: "Example"},
		},
		Edges: []graph.Edge{},
	}
	var logs bytes.Buffer
	readCalls, previewCalls := 0, 0
	cli := New(&logs, &logs, map[string]Provider{
		"aws-cdk": {},
		"terraform": {
			ReadInputs: func(args []string, open func(string) (io.Reader, error)) (graph.Graph, error) {
				readCalls++
				if !slices.Equal(args, inputs) {
					t.Fatalf("provider received %v, want %v", args, inputs)
				}
				for _, input := range args {
					reader, err := open(input)
					if err != nil {
						return graph.Graph{}, err
					}
					data, err := io.ReadAll(reader)
					if err != nil {
						return graph.Graph{}, err
					}
					if string(data) != filepath.Base(input) {
						t.Fatalf("provider received wrong contents: %q", data)
					}
				}
				return result, nil
			},
			Preview: func(_ context.Context, onStart func()) (graph.Graph, error) {
				previewCalls++
				onStart()
				return result, nil
			},
		},
	})
	for _, command := range []string{"graph", "render", "preview"} {
		output := filepath.Join(dir, command+".html")
		if command == "graph" {
			output = filepath.Join(dir, "graph.json")
		}
		args := []string{command, "--provider=terraform", "--output", output}
		if command == "preview" {
			args = append(args, "--no-open")
		} else {
			args = append(args, "--input", inputs[0], "--input", inputs[1])
		}
		if cli.Run(args) != 0 {
			t.Fatal(logs.String())
		}
		data, err := os.ReadFile(output)
		if err != nil || !bytes.Contains(data, []byte("Fixture from provider")) {
			t.Fatalf("%s did not write the provider graph: %v", command, err)
		}
	}
	invalidOutput := filepath.Join(dir, "directory.html")
	if err := os.Mkdir(invalidOutput, 0700); err != nil {
		t.Fatal(err)
	}
	if cli.Run([]string{"preview", "--provider=terraform", "--output", invalidOutput, "--no-open"}) == 0 {
		t.Fatal("preview accepted a directory as its output")
	}
	for _, check := range []struct {
		args []string
		want string
	}{
		{[]string{"preview"}, "--provider is required"},
		{[]string{"graph", "--input", inputs[0], "--output", invalidOutput}, "--provider is required"},
		{[]string{"mock-topology", "--project", "stack=dir", "--output", invalidOutput}, "--provider is required"},
		{[]string{"preview", "--provider=aws-cdk"}, "not implemented yet"},
		{[]string{"preview", "--provider=CANARY_SECRET"}, "unknown --provider"},
	} {
		logs.Reset()
		if cli.Run(check.args) == 0 || !strings.Contains(logs.String(), check.want) || strings.Contains(logs.String(), "CANARY_SECRET") {
			t.Fatalf("expected provider error %q, got %q", check.want, logs.String())
		}
	}
	if readCalls != 2 || previewCalls != 1 {
		t.Fatalf("provider called %d times for input and %d times for preview", readCalls, previewCalls)
	}
}

func TestCommands(t *testing.T) {
	for _, command := range []string{"graph", "render"} {
		for _, fixture := range []string{"export", "preview"} {
			t.Run(command+"/"+fixture, func(t *testing.T) {
				output := filepath.Join(t.TempDir(), "result")
				var stdout, stderr bytes.Buffer
				if code := newPulumiCLI(&stdout, &stderr).Run([]string{command, "--provider=pulumi", "--input", "../../testdata/pulumi/" + fixture + ".json", "--output", output}); code != 0 {
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

func TestCDKReports(t *testing.T) {
	var logs bytes.Buffer
	cli := New(&logs, &logs, map[string]Provider{"aws-cdk": {ReadInputs: awscdk.ReadInputs}})
	for _, command := range []string{"graph", "render"} {
		t.Run(command, func(t *testing.T) {
			output := filepath.Join(t.TempDir(), "report")
			args := []string{command, "--provider=aws-cdk", "--input", "../../testdata/awscdk/Example.template.json", "--output", output}
			if cli.Run(args) != 0 {
				t.Fatal(logs.String())
			}
			data, err := os.ReadFile(output)
			if err != nil || !bytes.Contains(data, []byte("AWS::SQS::Queue")) ||
				bytes.Contains(data, []byte("CANARY_CDK_SECRET")) || strings.Contains(logs.String(), "CANARY_CDK_SECRET") {
				t.Fatalf("invalid or unsafe CDK report: %v", err)
			}
		})
	}
}

func TestInvalidProviderGraphPreservesReports(t *testing.T) {
	var logs bytes.Buffer
	cli := New(&logs, &logs, map[string]Provider{
		"example": {ReadInputs: func([]string, func(string) (io.Reader, error)) (graph.Graph, error) {
			return graph.Graph{
				SchemaVersion: 1,
				Nodes:         []graph.Node{{ID: "source", Name: "Source", Type: "Example"}},
				Edges: []graph.Edge{{
					From: "source", To: "missing", Kind: graph.DependsOn, Evidence: []graph.Evidence{{Source: "example"}},
				}},
			}, nil
		}},
	})
	for _, command := range []string{"graph", "render"} {
		t.Run(command, func(t *testing.T) {
			output := filepath.Join(t.TempDir(), "report")
			const previous = "previous report"
			if err := os.WriteFile(output, []byte(previous), 0600); err != nil {
				t.Fatal(err)
			}
			if cli.Run([]string{command, "--provider=example", "--input", "unused", "--output", output}) == 0 {
				t.Fatal("accepted a graph with a dangling edge")
			}
			data, err := os.ReadFile(output)
			if err != nil || string(data) != previous {
				t.Fatalf("previous report changed: %q, %v", data, err)
			}
		})
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
	if newPulumiCLI(&logs, &logs).Run([]string{"render", "--provider=pulumi", "--input", input, "--output", output}) == 0 {
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
		if newPulumiCLI(&logs, &logs).Run([]string{"graph", "--provider=pulumi", "--input", input, "--output", alias}) == 0 {
			t.Fatal("accepted input/output alias")
		}
	}
}

func TestHelpAndInvalidFlags(t *testing.T) {
	for _, args := range [][]string{nil, {"--help"}, {"graph", "--provider=pulumi", "--help"}, {"preview", "--provider=pulumi", "--help"}, {"mock-topology", "--provider=pulumi", "--help"}} {
		var out bytes.Buffer
		if newPulumiCLI(&out, &out).Run(args) != 0 || out.Len() == 0 {
			t.Fatal("help failed")
		}
	}
	for _, args := range [][]string{{"unknown"}, {"generate"}, {"simulate"}, {"graph"}, {"render", "--provider=pulumi", "--secret=CANARY_SECRET"}} {
		var out bytes.Buffer
		if newPulumiCLI(&out, &out).Run(args) == 0 || strings.Contains(out.String(), "CANARY_SECRET") {
			t.Fatal("unsafe argument error")
		}
	}
}

func TestMultipleInputs(t *testing.T) {
	for _, command := range []string{"graph", "render"} {
		output := filepath.Join(t.TempDir(), "result")
		args := []string{command, "--provider=pulumi", "--output", output}
		for _, name := range []string{"base", "separation", "transcription"} {
			args = append(args, "--input", "example/"+name+"/dev=../../testdata/pulumi/multi/"+name+".json")
		}
		var logs bytes.Buffer
		if newPulumiCLI(&logs, &logs).Run(args) != 0 {
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
		if newPulumiCLI(&logs, &logs).Run([]string{"graph", "--provider=pulumi", "--input", input, "--output", "result.json"}) != 0 {
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
	if newPulumiCLI(&logs, &logs).Run([]string{"graph", "--provider=pulumi", "--input", first, "--input", second, "--output", second}) == 0 {
		t.Fatal("accepted output equal to second input")
	}
	data, _ := os.ReadFile(second)
	if string(data) != `{"version":3,"deployment":{}}` {
		t.Fatal("overwrote input")
	}
}
