package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"

	"infralens/internal/app"
)

const previewUsage = "InfraLens preview [--output infralens.html] [--no-open]"

func (c *CLI) preview(args []string) error {
	flags := newFlagSet("preview")
	output := flags.String("output", "infralens.html", "destination HTML file")
	noOpen := flags.Bool("no-open", false, "save without opening the browser")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fmt.Fprintln(c.stdout, "Usage: "+previewUsage+"\nPreviews changes against the current Pulumi stack without deployment; requires Pulumi CLI and a selected stack.")
			return nil
		}
		return errors.New("invalid flags; use preview --help")
	}
	if *output == "" || flags.NArg() != 0 {
		return errors.New("output must not be empty; positional arguments are unsupported")
	}
	report, err := app.Preview(context.Background(), *output, func() {
		fmt.Fprintln(c.stderr, "Previewing current Pulumi project; no deployment will be performed.")
	})
	if err != nil {
		return err
	}
	c.reportOmittedRelations(report)
	fmt.Fprintln(c.stdout, "Saved HTML:", report.Path)
	if !*noOpen && openHTML(report.Path) != nil {
		fmt.Fprintln(c.stderr, "Could not open the browser; open the saved HTML manually.")
	}
	return nil
}
