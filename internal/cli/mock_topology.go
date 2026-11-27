package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"

	"laytrace/internal/app"
)

const mockTopologyUsage = "Laytrace mock-topology --provider NAME --project NAME=DIRECTORY [--project ...] --output FILE"

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
		fmt.Fprintln(c.stdout, "Usage: "+mockTopologyUsage+"\n"+app.MockTopologyDeprecated+"\n"+c.app.ProviderHelp())
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
	report, err := c.app.MockTopology(context.Background(), *providerName, projects, *output)
	if err != nil {
		return err
	}
	c.reportOmittedRelations(report)
	return nil
}
