package app

import (
	"os"
	"path/filepath"
	"testing"

	"infralens/internal/graph"
)

func TestRenderGeneratedRejectsDestinationChangedDuringBuild(t *testing.T) {
	dir := t.TempDir()
	output := filepath.Join(dir, "report.html")
	_, err := RenderGenerated(output, func() (graph.Graph, error) {
		if err := os.Symlink(dir, output); err != nil {
			t.Fatal(err)
		}
		return graph.Graph{SchemaVersion: 1}, nil
	})
	if err == nil {
		t.Error("accepted a destination changed to a symlink to a directory")
	}
	if target, err := os.Readlink(output); err != nil || target != dir {
		t.Fatalf("changed the destination symlink: target %q, error %v", target, err)
	}
}
