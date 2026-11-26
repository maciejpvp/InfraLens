package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"

	"infralens/internal/app"
)

const graphUsage = " --provider NAME --input [NAME=]FILE [--input ...] --output FILE"
const sidecarUsage = " [--graph-output FILE.json] [--cost-output FILE.json]"

func sidecarFlags(flags *flag.FlagSet) *app.Sidecars {
	sidecars := &app.Sidecars{}
	flags.StringVar(&sidecars.Graph, "graph-output", "", "save the report's graph JSON")
	flags.StringVar(&sidecars.Cost, "cost-output", "", "save the report's cost data as JSON (requires --costs)")
	return sidecars
}

func (c *CLI) reportSaved(report app.Report) {
	if report.Path == "" {
		return
	}
	fmt.Fprintln(c.stdout, "Saved HTML:", report.Path)
	if report.GraphPath != "" {
		fmt.Fprintln(c.stdout, "Saved graph:", report.GraphPath)
	}
	if report.CostPath != "" {
		fmt.Fprintln(c.stdout, "Saved costs:", report.CostPath)
	}
}

func (c *CLI) graphOrRender(command string, args []string) error {
	flags := newFlagSet(command)
	providerName := flags.String("provider", "", "IaC provider")
	var inputs []string
	flags.Func("input", "infrastructure input file; repeat for multiple inputs", func(value string) error {
		if value == "" {
			return errors.New("empty input")
		}
		inputs = append(inputs, value)
		return nil
	})
	costs := &app.CostOptions{}
	sidecars := &app.Sidecars{}
	if command == "render" {
		costs = costFlags(flags)
		sidecars = sidecarFlags(flags)
	}
	output := flags.String("output", "", "destination file")
	err := flags.Parse(args)
	if errors.Is(err, flag.ErrHelp) {
		usage := graphUsage
		if command == "render" {
			usage += sidecarUsage + costUsage
		}
		fmt.Fprintln(c.stdout, "Usage: infralens "+command+usage+"\n"+c.app.ProviderHelp())
		return nil
	}
	if err != nil {
		return errors.New("invalid flags; use --help")
	}
	if *output == "" || flags.NArg() != 0 {
		return errors.New("--output is required; positional arguments are unsupported")
	}
	if len(inputs) == 0 {
		return errors.New("graph/render require --input and do not accept --project")
	}
	if command == "graph" {
		report, err := c.app.Graph(*providerName, inputs, *output)
		if err == nil {
			c.reportOmittedRelations(report)
		}
		return err
	}
	report, err := c.app.Render(context.Background(), inputs, app.ReportOptions{
		Provider: *providerName, Output: *output, Sidecars: *sidecars, Costs: *costs,
	})
	if *sidecars != (app.Sidecars{}) {
		c.reportSaved(report)
	}
	if err != nil {
		return err
	}
	c.reportOmittedRelations(report)
	return nil
}
