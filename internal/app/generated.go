package app

import (
	"context"
	"errors"
	"path/filepath"

	"infralens/internal/graph"
)

// PreviewFunc builds a preview graph and calls onStart just before running the preview.
type PreviewFunc func(ctx context.Context, onStart func()) (graph.Graph, error)

// Preview runs the provider's preview and writes HTML and optionally the same graph as JSON.
func Preview(ctx context.Context, output, provider string, sidecars Sidecars, preview PreviewFunc, onStart func()) (Report, error) {
	path, err := filepath.Abs(output)
	if err != nil {
		return Report{}, errors.New("cannot resolve output path")
	}
	if filepath.Ext(path) != ".html" {
		return Report{}, errors.New("preview output must have an .html extension")
	}
	return renderGenerated(path, sidecars, func() (graph.Graph, error) {
		g, err := preview(ctx, onStart)
		g.PreviewProvider = provider
		return g, err
	})
}

// RenderGenerated checks the destination both before and after building the graph.
func RenderGenerated(output string, build func() (graph.Graph, error)) (Report, error) {
	return renderGenerated(output, Sidecars{}, build)
}

func renderGenerated(output string, sidecars Sidecars, build func() (graph.Graph, error)) (Report, error) {
	if _, err := inspectReportOutputs(output, sidecars); err != nil {
		return Report{}, err
	}
	if err := checkSidecars(sidecars); err != nil {
		return Report{}, err
	}
	g, err := build()
	if err != nil {
		return Report{}, err
	}
	if _, err := inspectReportOutputs(output, sidecars); err != nil {
		return Report{}, err
	}
	return writeReport(output, sidecars, g)
}
