package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"

	"infralens/internal/app"
	"infralens/internal/graph"
)

const mockTopologyUsage = "infralens mock-topology --provider NAME --project NAME=DIRECTORY [--project ...] --output FILE"

const mockTopologyDeprecated = "The mock-topology command is deprecated."

func (c *CLI) mockTopology(args []string) error {
	flags := newFlagSet("mock-topology")
	providerName := flags.String("provider", "", "IaC provider")
	var projects []string
	flags.Func("project", "project to simulate; repeat for multiple projects", func(value string) error {
		projects = append(projects, value)
		return nil
	})
	output := flags.String("output", "", "destination file")
	err := flags.Parse(args)
	if errors.Is(err, flag.ErrHelp) {
		fmt.Fprintln(c.stdout, "Usage: "+mockTopologyUsage+"\n"+mockTopologyDeprecated+"\n"+c.providerHelp())
		return nil
	}
	if err != nil {
		return errors.New("invalid flags; use --help")
	}
	if *output == "" || flags.NArg() != 0 {
		return errors.New("--output is required; positional arguments are unsupported")
	}
	if len(projects) == 0 {
		return errors.New("mock-topology requires --project and does not accept --input")
	}
	provider, err := c.provider(*providerName)
	if err != nil {
		return err
	}
	if provider.MockTopology == nil {
		return fmt.Errorf("provider %q does not support mock-topology", *providerName)
	}
	fmt.Fprintln(c.stderr, mockTopologyDeprecated)
	report, err := app.RenderGenerated(*output, func() (graph.Graph, error) {
		fmt.Fprintln(c.stderr, "Simulating trusted Go project code with test mocks; first build may take several minutes.")
		return provider.MockTopology(context.Background(), projects, *output)
	})
	if err != nil {
		return err
	}
	c.reportOmittedRelations(report)
	return nil
}
