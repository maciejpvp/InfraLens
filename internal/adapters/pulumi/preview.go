package pulumi

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"

	"infralens/internal/cost"
	"infralens/internal/fileio"
	"infralens/internal/graph"
)

// Preview builds a graph from the current Pulumi project.
// If supplied, onPreview runs just before the preview starts.
func (Adapter) Preview(ctx context.Context, onPreview func(), inventory *cost.Inventory) (graph.Graph, error) {
	if _, yamlErr := fileio.StatRegular("Pulumi.yaml"); yamlErr != nil {
		if _, ymlErr := fileio.StatRegular("Pulumi.yml"); ymlErr != nil {
			return graph.Graph{}, errors.New("run preview from a Pulumi project directory containing Pulumi.yaml or Pulumi.yml")
		}
	}
	preview, cleanup, err := fileio.CreateScratch("infralens-preview-*.json")
	if err != nil {
		return graph.Graph{}, errors.New("cannot create temporary preview")
	}
	defer cleanup()
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	command := exec.CommandContext(ctx, "pulumi", "preview", "--json", "--show-sames", "--non-interactive")
	for _, entry := range os.Environ() {
		if !strings.HasPrefix(entry, "PULUMI_ENABLE_STREAMING_JSON_PREVIEW=") {
			command.Env = append(command.Env, entry)
		}
	}
	command.Env = append(command.Env, "PULUMI_ENABLE_STREAMING_JSON_PREVIEW=false")
	command.Stdout = preview
	// Pulumi diagnostics may contain secrets; do not forward them to logs.
	if onPreview != nil {
		onPreview()
	}
	if err := command.Run(); err != nil {
		return graph.Graph{}, errors.New("preview failed; check Pulumi CLI, login, stack selection and project dependencies with pulumi preview")
	}
	if _, err := preview.Seek(0, io.SeekStart); err != nil {
		return graph.Graph{}, errors.New("cannot read temporary preview")
	}
	g, err := readSources(inventory, Source{Reader: preview})
	if err != nil {
		return graph.Graph{}, err
	}
	if err := preview.Close(); err != nil {
		return graph.Graph{}, errors.New("cannot close temporary preview")
	}
	return g, nil
}
