package awscdk

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"laytrace/internal/cost"
	"laytrace/internal/fileio"
	"laytrace/internal/graph"
)

// Preview compares synthesized CDK stacks with their deployed templates.
func (Adapter) Preview(ctx context.Context, onStart func(), inventory *cost.Inventory) (graph.Graph, error) {
	if _, err := fileio.StatRegular("cdk.json"); err != nil {
		return graph.Graph{}, errors.New("run preview from an AWS CDK project directory containing cdk.json")
	}
	cdk, err := exec.LookPath(filepath.Join("node_modules", ".bin", "cdk"))
	if err != nil {
		cdk, err = exec.LookPath("cdk")
		if err != nil {
			return graph.Graph{}, errors.New("AWS CDK CLI not found; install the project dependencies or put cdk on PATH")
		}
	}
	output, err := os.MkdirTemp("", "laytrace-cdk-")
	if err != nil {
		return graph.Graph{}, errors.New("cannot create temporary CDK assembly directory")
	}
	defer os.RemoveAll(output)

	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, cdk, "diff", "**", "--no-lookups", "--method=template",
		"--strict", "--no-quiet", "--no-fail", "--no-security-only", "--output", output)
	// CDK and project diagnostics may contain secrets.
	if onStart != nil {
		onStart()
	}
	diff, err := cmd.CombinedOutput()
	if err != nil {
		if ctx.Err() != nil {
			return graph.Graph{}, ctx.Err()
		}
		return graph.Graph{}, errors.New("CDK diff failed; run cdk diff '**' --no-lookups --method=template to check diagnostics")
	}

	root, err := os.OpenRoot(output)
	if err != nil {
		return graph.Graph{}, errors.New("cannot open synthesized CDK assembly")
	}
	defer root.Close()
	assembly := root.FS()
	sources, err := assemblySources(assembly, ".")
	if err != nil {
		return graph.Graph{}, err
	}
	if len(sources) == 0 {
		return graph.Graph{}, errors.New("CDK synthesis produced no stack templates")
	}
	g, err := readSources(sources, func(path string) (io.Reader, error) {
		data, err := readAssemblyFile(assembly, path)
		return bytes.NewReader(data), err
	}, inventory)
	if err != nil {
		return graph.Graph{}, err
	}
	if err := applyDiff(&g, sources, string(diff)); err != nil {
		return graph.Graph{}, err
	}
	if inventory != nil {
		collectDeployedCosts(ctx, sources, inventory, awsCommand)
	}
	return g, nil
}
