package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"infralens/internal/adapters/pulumi"
)

func (c commandLine) generate(args []string) error {
	flags := flag.NewFlagSet("generate", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	output := flags.String("output", "infralens.html", "destination HTML file")
	noOpen := flags.Bool("no-open", false, "save without opening the browser")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fmt.Fprintln(c.stdout, "Usage: InfraLens generate [--output infralens.html] [--no-open]\nPreviews changes against the current Pulumi stack without deployment; requires Pulumi CLI and a selected stack.")
			return nil
		}
		return errors.New("invalid flags; use generate --help")
	}
	if *output == "" || flags.NArg() != 0 {
		return errors.New("output must not be empty; positional arguments are unsupported")
	}
	if !regularFile("Pulumi.yaml") && !regularFile("Pulumi.yml") {
		return errors.New("run generate from a Pulumi project directory containing Pulumi.yaml or Pulumi.yml")
	}
	path, err := filepath.Abs(*output)
	if err != nil {
		return errors.New("cannot resolve output path")
	}
	if filepath.Ext(path) != ".html" {
		return errors.New("generate output must have an .html extension")
	}
	preview, err := os.CreateTemp("", "infralens-preview-*.json")
	if err != nil {
		return errors.New("cannot create temporary preview")
	}
	defer os.Remove(preview.Name())
	defer preview.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
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
	fmt.Fprintln(c.stderr, "Previewing current Pulumi project; no deployment will be performed.")
	if err := command.Run(); err != nil {
		return errors.New("preview failed; check Pulumi CLI, login, stack selection and project dependencies with pulumi preview")
	}
	if _, err := inspectOutput(path); err != nil {
		return err
	}
	if _, err := preview.Seek(0, io.SeekStart); err != nil {
		return errors.New("cannot read temporary preview")
	}
	g, err := pulumi.Read(preview)
	if err != nil {
		return err
	}
	if err := preview.Close(); err != nil {
		return errors.New("cannot close temporary preview")
	}
	if err := c.writeOutput(path, g, false); err != nil {
		return err
	}
	fmt.Fprintln(c.stdout, "Saved HTML:", path)
	if !*noOpen && openHTML(path) != nil {
		fmt.Fprintln(c.stderr, "Could not open the browser; open the saved HTML manually.")
	}
	return nil
}

func regularFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}
