package cli

import (
	"errors"
	"flag"
	"fmt"

	"infralens/internal/app"
)

const graphUsage = " --input [org/project/stack=]FILE [--input ...] --output FILE"

func (c *CLI) graphOrRender(command string, args []string, run func([]string, string) (app.Report, error)) error {
	flags := newFlagSet(command)
	var inputs []string
	flags.Func("input", "Pulumi JSON file, optionally org/project/stack=FILE; repeat for multiple stacks", func(value string) error {
		if value == "" {
			return errors.New("empty input")
		}
		inputs = append(inputs, value)
		return nil
	})
	output := flags.String("output", "", "destination file")
	err := flags.Parse(args)
	if errors.Is(err, flag.ErrHelp) {
		fmt.Fprintln(c.stdout, "Usage: infralens "+command+graphUsage)
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
	report, err := run(inputs, *output)
	if err != nil {
		return err
	}
	c.reportOmittedRelations(report)
	return nil
}
