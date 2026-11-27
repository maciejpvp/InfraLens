package simulate

import (
	"context"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func write(t *testing.T, path, content string, mode os.FileMode) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), mode); err != nil {
		t.Fatal(err)
	}
}

func TestRunWithMockedGoCommand(t *testing.T) {
	dir := t.TempDir()
	module := filepath.Join(dir, "source")
	project := filepath.Join(module, "infra", "base")
	write(t, filepath.Join(module, "go.mod"), "module example\n\ngo 1.27.4\n", 0600)
	write(t, filepath.Join(project, "main.go"), "package main\n", 0600)
	write(t, filepath.Join(project, "Pulumi.yaml"), "name: base\n", 0600)
	write(t, filepath.Join(module, ".aws", "credentials"), "CANARY_SECRET", 0600)
	write(t, filepath.Join(module, ".env"), "CANARY_SECRET", 0600)
	tools := filepath.Join(dir, "tools")
	write(t, filepath.Join(tools, "go"), `#!/bin/sh
set -eu
test -z "${AWS_ACCESS_KEY_ID:-}"
test -z "${PULUMI_ACCESS_TOKEN:-}"
test "$GOPROXY" = off
test "$GOWORK" = off
test -f zz_laytrace_simulation_test.go
test ! -f ../../.aws/credentials
test ! -f ../../.env
printf '%s' '{"version":3,"deployment":{"resources":[{"urn":"urn:pulumi:dev::base::pulumi:pulumi:Stack::base-dev","type":"pulumi:pulumi:Stack"},{"urn":"urn:pulumi:dev::base::test:Resource::item","type":"test:Resource"}]}}' > "$LAYTRACE_CAPTURE"
`, 0700)
	t.Setenv("PATH", tools)
	t.Setenv("AWS_ACCESS_KEY_ID", "CANARY_SECRET")
	t.Setenv("PULUMI_ACCESS_TOKEN", "CANARY_SECRET")
	g, err := Run(context.Background(), []Project{{Stack: "org/base/dev", Directory: project}}, filepath.Join(dir, "result.html"))
	if err != nil {
		t.Fatal(err)
	}
	if !g.Simulated || len(g.Nodes) != 1 || g.Nodes[0].Change != "create" {
		t.Fatalf("unexpected simulation: %+v", g)
	}
	if _, err := os.Stat(filepath.Join(project, "zz_laytrace_simulation_test.go")); !os.IsNotExist(err) {
		t.Fatal("modified source project")
	}
	if _, err := Run(context.Background(), []Project{{Stack: "org/base/dev", Directory: project}}, filepath.Join(module, "main.go")); err == nil {
		t.Fatal("accepted output inside source module")
	}
}

func TestCopyModuleAndRunner(t *testing.T) {
	if _, err := parser.ParseFile(token.NewFileSet(), "runner_test.go", runner, parser.AllErrors); err != nil {
		t.Fatal(err)
	}
	source, dest := t.TempDir(), t.TempDir()
	write(t, filepath.Join(source, "main.go"), "package main", 0600)
	write(t, filepath.Join(source, "bin", "generated.go"), "secret", 0600)
	write(t, filepath.Join(source, "Pulumi.dev.yaml"), "secret", 0600)
	if err := os.Symlink(filepath.Join(source, "main.go"), filepath.Join(source, "alias.go")); err != nil {
		t.Fatal(err)
	}
	if err := copyModule(source, dest); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"bin/generated.go", "Pulumi.dev.yaml", "alias.go"} {
		if _, err := os.Stat(filepath.Join(dest, name)); !os.IsNotExist(err) {
			t.Fatalf("copied %s", name)
		}
	}
	if !within(source, filepath.Join(source, "child")) || within(source, source+"-other") {
		t.Fatal("invalid containment check")
	}
}

func TestFailureDoesNotLeakLogs(t *testing.T) {
	dir := t.TempDir()
	module := filepath.Join(dir, "source")
	write(t, filepath.Join(module, "go.mod"), "module example\n", 0600)
	write(t, filepath.Join(module, "main.go"), "package main\n", 0600)
	tools := filepath.Join(dir, "tools")
	write(t, filepath.Join(tools, "go"), "#!/bin/sh\necho CANARY_SECRET >&2\nexit 1\n", 0700)
	t.Setenv("PATH", tools)
	_, err := Run(context.Background(), []Project{{Stack: "org/base/dev", Directory: module}}, filepath.Join(dir, "out.html"))
	if err == nil || strings.Contains(err.Error(), "CANARY_SECRET") {
		t.Fatal("missing or unsafe error")
	}
	if _, err := Run(context.Background(), nil, filepath.Join(dir, "out.html")); err == nil {
		t.Fatal("accepted no projects")
	}
}
