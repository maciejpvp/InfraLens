// Package simulate captures Go Pulumi registrations using a project's test mocks.
package simulate

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"infralens/internal/adapters/pulumi"
	"infralens/internal/graph"
)

//go:embed runner_test.go.txt
var runner string

type Project struct {
	Stack     string
	Directory string
}

type simulation struct {
	tmp, output string
	modules     map[string]string
	references  map[string]json.RawMessage
}

// Run executes trusted project code. Pulumi operations use the project's mocks;
// this is not a sandbox for arbitrary Go code.
func Run(ctx context.Context, projects []Project, output string) (graph.Graph, error) {
	if len(projects) == 0 {
		return graph.Graph{}, errors.New("at least one --project is required")
	}
	absoluteOutput, err := filepath.Abs(output)
	if err != nil {
		return graph.Graph{}, errors.New("invalid output path")
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(absoluteOutput))
	if err != nil {
		return graph.Graph{}, errors.New("cannot resolve output directory")
	}
	tmp, err := os.MkdirTemp("", "infralens-simulate-")
	if err != nil {
		return graph.Graph{}, errors.New("cannot create simulation directory")
	}
	defer os.RemoveAll(tmp)
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	s := simulation{
		tmp: tmp, output: filepath.Join(parent, filepath.Base(absoluteOutput)),
		modules: map[string]string{}, references: map[string]json.RawMessage{},
	}
	sources := make([]pulumi.Source, 0, len(projects))
	for _, project := range projects {
		source, err := s.runProject(ctx, project)
		if err != nil {
			return graph.Graph{}, err
		}
		sources = append(sources, source)
	}
	g, err := pulumi.ReadSources(sources...)
	if err != nil {
		return graph.Graph{}, err
	}
	g.Simulated = true
	for i := range g.Nodes {
		g.Nodes[i].Change = graph.Create
	}
	return g, g.Validate()
}

func (s *simulation) runProject(ctx context.Context, project Project) (pulumi.Source, error) {
	if _, ok := pulumi.ParseStackIdentity(project.Stack); !ok {
		return pulumi.Source{}, errors.New("--project requires org/project/stack=DIRECTORY")
	}
	work, err := s.projectCopy(project.Directory)
	if err != nil {
		return pulumi.Source{}, err
	}
	if err := os.WriteFile(filepath.Join(work, "zz_infralens_simulation_test.go"), []byte(runner), 0600); err != nil {
		return pulumi.Source{}, errors.New("cannot prepare simulation test")
	}
	result, err := os.CreateTemp(s.tmp, "capture-*.json")
	if err != nil {
		return pulumi.Source{}, errors.New("cannot prepare simulation capture")
	}
	if err := result.Close(); err != nil {
		return pulumi.Source{}, errors.New("cannot prepare simulation capture")
	}
	referencePath := filepath.Join(s.tmp, "references.json")
	raw, _ := json.Marshal(s.references)
	if err := os.WriteFile(referencePath, raw, 0600); err != nil {
		return pulumi.Source{}, errors.New("cannot prepare simulated stack outputs")
	}
	command := exec.CommandContext(ctx, "go", "test", "-buildvcs=false", "-count=1", "-run=^TestInfraLensSimulation$", "-timeout=8m", ".")
	command.Dir = work
	command.Env = append(environment(project.Stack, result.Name()), "INFRALENS_REFERENCES="+referencePath)
	// Test/build logs can contain project secrets and are never forwarded.
	if err := command.Run(); err != nil {
		if ctx.Err() != nil {
			return pulumi.Source{}, errors.New("simulation cancelled or timed out")
		}
		return pulumi.Source{}, errors.New("simulation failed: requires cached Go dependencies, deploy/infraMocks/withStackConfig test helpers, and dependencies listed before consumers; run project tests to diagnose")
	}
	data, err := os.ReadFile(result.Name())
	if err != nil || len(data) == 0 {
		return pulumi.Source{}, errors.New("simulation produced no capture; check the Go test hook")
	}
	var captured struct {
		Exports json.RawMessage `json:"exports"`
	}
	if json.Unmarshal(data, &captured) != nil {
		return pulumi.Source{}, errors.New("invalid simulation capture")
	}
	if captured.Exports != nil {
		s.references[project.Stack] = captured.Exports
	}
	return pulumi.Source{Stack: project.Stack, Reader: bytes.NewReader(data)}, nil
}

func (s *simulation) projectCopy(directory string) (string, error) {
	directory, err := filepath.Abs(directory)
	if err != nil {
		return "", errors.New("invalid project directory")
	}
	directory, err = filepath.EvalSymlinks(directory)
	if err != nil {
		return "", errors.New("cannot resolve project directory")
	}
	module, err := moduleRoot(directory)
	if err != nil {
		return "", err
	}
	if within(module, s.output) {
		return "", errors.New("simulation output must be outside source modules")
	}
	relative, err := filepath.Rel(module, directory)
	if err != nil {
		return "", errors.New("invalid project path")
	}
	folder, ok := s.modules[module]
	if !ok {
		folder, err = os.MkdirTemp(s.tmp, "module-")
		if err != nil {
			return "", errors.New("cannot prepare module copy")
		}
		if err := copyModule(module, folder); err != nil {
			return "", errors.New("cannot copy Go module for simulation")
		}
		s.modules[module] = folder
	}
	return filepath.Join(folder, relative), nil
}

func within(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func moduleRoot(directory string) (string, error) {
	for current := directory; ; current = filepath.Dir(current) {
		if info, err := os.Stat(filepath.Join(current, "go.mod")); err == nil && info.Mode().IsRegular() {
			return current, nil
		}
		if filepath.Dir(current) == current {
			return "", errors.New("project must belong to a Go module")
		}
	}
}

func copyModule(source, destination string) error {
	// shortcut: Go sources and Pulumi.yaml only; add declared assets when supporting hooks with embedded files.
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if path != source && (strings.HasPrefix(entry.Name(), ".") || entry.Name() == "node_modules" || entry.Name() == "vendor" || entry.Name() == "bin") {
				return filepath.SkipDir
			}
			return nil
		}
		name := entry.Name()
		if !entry.Type().IsRegular() || !(strings.HasSuffix(name, ".go") || name == "go.mod" || name == "go.sum" || name == "Pulumi.yaml") {
			return nil
		}
		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, rel)
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0600)
	})
}

func environment(stack, output string) []string {
	var env []string
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		if strings.HasPrefix(key, "AWS_") || strings.HasPrefix(key, "PULUMI_") || strings.HasPrefix(key, "INFRALENS_") {
			continue
		}
		switch key {
		case "GOPROXY", "GOSUMDB", "GOTOOLCHAIN", "GOWORK", "GOFLAGS":
			continue
		}
		env = append(env, entry)
	}
	return append(env, "GOPROXY=off", "GOSUMDB=off", "GOTOOLCHAIN=local", "GOWORK=off", "GOFLAGS=-mod=readonly", "AWS_EC2_METADATA_DISABLED=true", "INFRALENS_STACK="+stack, "INFRALENS_CAPTURE="+output)
}
