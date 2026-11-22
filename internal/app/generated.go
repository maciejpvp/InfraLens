package app

import (
	"context"
	"errors"
	"path/filepath"

	"infralens/internal/graph"
)

// PreviewFunc builds a preview graph and calls onStart just before running the preview.
type PreviewFunc func(ctx context.Context, onStart func()) (graph.Graph, error)

// Preview runs the provider's preview and writes an HTML report.
func Preview(ctx context.Context, output string, preview PreviewFunc, onStart func()) (Report, error) {
	path, err := filepath.Abs(output)
	if err != nil {
		return Report{}, errors.New("cannot resolve output path")
	}
	if filepath.Ext(path) != ".html" {
		return Report{}, errors.New("preview output must have an .html extension")
	}
	return RenderGenerated(path, func() (graph.Graph, error) {
		return preview(ctx, onStart)
	})
}

// RenderGenerated checks the destination both before and after building the graph.
func RenderGenerated(output string, build func() (graph.Graph, error)) (Report, error) {
	if _, err := inspectOutput(output); err != nil {
		return Report{}, err
	}
	g, err := build()
	if err != nil {
		return Report{}, err
	}
	if _, err := inspectOutput(output); err != nil {
		return Report{}, err
	}
	return writeOutput(output, g, outputHTML)
}
