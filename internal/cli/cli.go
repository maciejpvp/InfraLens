// Package cli handles command-line interaction with InfraLens.
package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"maps"
	"slices"
	"strings"

	"infralens/internal/app"
	"infralens/internal/graph"
)

// Provider contains the operations available for an IaC source.
type Provider struct {
	ReadInputs   app.ReadInputsFunc
	Preview      app.PreviewFunc
	MockTopology func(context.Context, []string, string) (graph.Graph, error)
}

// CLI runs InfraLens commands using the configured output streams.
type CLI struct {
	stdout, stderr io.Writer
	providers      map[string]Provider
}

// New constructs a CLI with its IaC providers and output streams.
func New(stdout, stderr io.Writer, providers map[string]Provider) *CLI {
	return &CLI{stdout: stdout, stderr: stderr, providers: providers}
}

func (p Provider) available() bool {
	return p.ReadInputs != nil || p.Preview != nil || p.MockTopology != nil
}

func (c *CLI) provider(name string) (Provider, error) {
	if name == "" {
		return Provider{}, errors.New("--provider is required; use --help for choices")
	}
	provider, ok := c.providers[name]
	if !ok {
		return Provider{}, errors.New("unknown --provider; use --help for choices")
	}
	if !provider.available() {
		return Provider{}, fmt.Errorf("provider %q is not implemented yet", name)
	}
	return provider, nil
}

func (c *CLI) providerHelp() string {
	var choices []string
	for _, name := range slices.Sorted(maps.Keys(c.providers)) {
		if c.providers[name].available() {
			choices = append(choices, name)
		} else {
			choices = append(choices, name+" (planned)")
		}
	}
	return "Provider choices: " + strings.Join(choices, ", ") + "."
}

// Run executes a command and returns its process exit code.
func (c *CLI) Run(args []string) int {
	if err := c.dispatch(args); err != nil {
		fmt.Fprintln(c.stderr, "infralens:", err)
		return 1
	}
	return 0
}

func (c *CLI) dispatch(args []string) error {
	if len(args) == 0 {
		c.help()
		return nil
	}
	switch args[0] {
	case "help", "--help", "-h":
		c.help()
		return nil
	case "preview":
		return c.preview(args[1:])
	case "graph":
		return c.graphOrRender(args[0], args[1:], app.Graph)
	case "render":
		return c.graphOrRender(args[0], args[1:], app.Render)
	case "mock-topology":
		return c.mockTopology(args[1:])
	default:
		return errors.New("unknown command; use --help")
	}
}

func (c *CLI) help() {
	fmt.Fprintln(c.stdout, "Usage: "+previewUsage+"\n       infralens <graph|render>"+graphUsage+
		"\n       "+mockTopologyUsage+" (deprecated)\n"+c.providerHelp())
}

func newFlagSet(command string) *flag.FlagSet {
	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	// Flag parsing errors can contain user-supplied values.
	flags.SetOutput(io.Discard)
	return flags
}

func (c *CLI) reportOmittedRelations(report app.Report) {
	if report.OmittedRelations > 0 {
		fmt.Fprintln(c.stderr, "Omitted references to hidden or missing resources:", report.OmittedRelations)
	}
}
