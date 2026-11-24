package cli

import (
	"errors"
	"flag"
	"fmt"

	"infralens/internal/app"
)

const graphUsage = " --provider NAME --input [NAME=]FILE [--input ...] --output FILE"

func (c *CLI) graphOrRender(command string, args []string, run func([]string, string, app.ReadInputsFunc) (app.Report, error)) error {
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
	costs := &costOptions{}
	if command == "render" {
		costs = costFlags(flags)
	}
	output := flags.String("output", "", "destination file")
	err := flags.Parse(args)
	if errors.Is(err, flag.ErrHelp) {
		usage := graphUsage
		if command == "render" {
			usage += costUsage
		}
		fmt.Fprintln(c.stdout, "Usage: infralens "+command+usage+"\n"+c.providerHelp())
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
	if err := costs.load(*output); err != nil {
		return err
	}
	provider, err := c.provider(*providerName)
	if err != nil {
		return err
	}
	if provider.ReadInputs == nil {
		return fmt.Errorf("provider %q does not support file inputs", *providerName)
	}
	read := provider.ReadInputs
	if costs.enabled {
		if provider.ReadCostInputs == nil {
			return fmt.Errorf("provider %q does not support cost estimates", *providerName)
		}
		read = c.costReader(provider, *costs)
	}
	report, err := run(inputs, *output, read)
	if err != nil {
		return err
	}
	c.reportOmittedRelations(report)
	return nil
}
