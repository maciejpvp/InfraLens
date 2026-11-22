package app

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"infralens/internal/adapters/pulumi"
	"infralens/internal/fileio"
)

// Preview previews the current Pulumi project and writes an HTML report.
// If supplied, onPreview runs just before the preview starts.
func Preview(ctx context.Context, output string, onPreview func()) (Report, error) {
	if _, yamlErr := fileio.StatRegular("Pulumi.yaml"); yamlErr != nil {
		if _, ymlErr := fileio.StatRegular("Pulumi.yml"); ymlErr != nil {
			return Report{}, errors.New("run preview from a Pulumi project directory containing Pulumi.yaml or Pulumi.yml")
		}
	}
	path, err := filepath.Abs(output)
	if err != nil {
		return Report{}, errors.New("cannot resolve output path")
	}
	if filepath.Ext(path) != ".html" {
		return Report{}, errors.New("preview output must have an .html extension")
	}
	preview, cleanup, err := fileio.CreateScratch("infralens-preview-*.json")
	if err != nil {
		return Report{}, errors.New("cannot create temporary preview")
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
		return Report{}, errors.New("preview failed; check Pulumi CLI, login, stack selection and project dependencies with pulumi preview")
	}
	if _, err := inspectOutput(path); err != nil {
		return Report{}, err
	}
	if _, err := preview.Seek(0, io.SeekStart); err != nil {
		return Report{}, errors.New("cannot read temporary preview")
	}
	g, err := pulumi.Read(preview)
	if err != nil {
		return Report{}, err
	}
	if err := preview.Close(); err != nil {
		return Report{}, errors.New("cannot close temporary preview")
	}
	return writeOutput(path, g, outputHTML)
}
