// Package cli handles command-line interaction with InfraLens.
package cli

import (
	"errors"
	"flag"
	"fmt"
	"io"

	"infralens/internal/app"
)

// CLI runs InfraLens commands using the configured output streams.
type CLI struct {
	stdout, stderr io.Writer
	app            *app.App
}

func New(stdout, stderr io.Writer, application *app.App) *CLI {
	return &CLI{stdout: stdout, stderr: stderr, app: application}
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
		return c.graphOrRender(args[0], args[1:])
	case "render":
		return c.graphOrRender(args[0], args[1:])
	case "query":
		return c.query(args[1:])
	case "mock-topology":
		return c.mockTopology(args[1:])
	default:
		return errors.New("unknown command; use --help")
	}
}

func (c *CLI) help() {
	fmt.Fprintln(c.stdout, "Usage: "+previewUsage+"\n       infralens graph"+graphUsage+"\n       infralens render"+graphUsage+sidecarUsage+costUsage+
		"\n       "+queryUsage+"\n       "+mockTopologyUsage+" (deprecated)\n"+c.app.ProviderHelp())
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
