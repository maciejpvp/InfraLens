package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"strings"

	"infralens/internal/app"
)

const mockTopologyUsage = "infralens mock-topology --project org/project/stack=DIRECTORY [--project ...] --output FILE"

const mockTopologyDeprecated = "The mock-topology command is deprecated."

func (c *CLI) mockTopology(args []string) error {
	flags := newFlagSet("mock-topology")
	var projects []app.SimulationProject
	flags.Func("project", "Go Pulumi project with deploy/infraMocks/withStackConfig test helpers: org/project/stack=DIRECTORY", func(value string) error {
		stack, directory, ok := strings.Cut(value, "=")
		if !ok || stack == "" || directory == "" {
			return errors.New("invalid project")
		}
		projects = append(projects, app.SimulationProject{Stack: stack, Directory: directory})
		return nil
	})
	output := flags.String("output", "", "destination file")
	err := flags.Parse(args)
	if errors.Is(err, flag.ErrHelp) {
		fmt.Fprintln(c.stdout, "Usage: "+mockTopologyUsage+"\n"+mockTopologyDeprecated)
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
	fmt.Fprintln(c.stderr, mockTopologyDeprecated)
	report, err := app.MockTopology(context.Background(), projects, *output, func() {
		fmt.Fprintln(c.stderr, "Simulating trusted Go project code with test mocks; first build may take several minutes.")
	})
	if err != nil {
		return err
	}
	c.reportOmittedRelations(report)
	return nil
}
