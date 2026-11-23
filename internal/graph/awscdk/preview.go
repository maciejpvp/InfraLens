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

	"infralens/internal/fileio"
	"infralens/internal/graph"
)

// Preview synthesizes the current CDK app and builds a topology report.
func Preview(ctx context.Context, onStart func()) (graph.Graph, error) {
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
	output, err := os.MkdirTemp("", "infralens-cdk-")
	if err != nil {
		return graph.Graph{}, errors.New("cannot create temporary CDK assembly directory")
	}
	defer os.RemoveAll(output)

	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, cdk, "synth", "--all", "--no-lookups", "--quiet", "--output", output)
	// CDK and project diagnostics may contain secrets.
	if onStart != nil {
		onStart()
	}
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return graph.Graph{}, ctx.Err()
		}
		return graph.Graph{}, errors.New("CDK synthesis failed; run cdk synth --all --no-lookups to check project diagnostics")
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
	return readSources(sources, func(path string) (io.Reader, error) {
		data, err := readAssemblyFile(assembly, path)
		return bytes.NewReader(data), err
	})
}
