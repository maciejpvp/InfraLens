package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"

	"laytrace/internal/app"
)

const previewUsage = "Laytrace preview --provider NAME [--output laytrace.html] [--no-open]" + sidecarUsage + costUsage

func (c *CLI) preview(args []string) error {
	flags := newFlagSet("preview")
	costs := costFlags(flags)
	providerName := flags.String("provider", "", "IaC provider")
	output := flags.String("output", "laytrace.html", "destination HTML file")
	sidecars := sidecarFlags(flags)
	noOpen := flags.Bool("no-open", false, "save without opening the browser")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fmt.Fprintln(c.stdout, "Usage: "+previewUsage+"\nGenerates an infrastructure report for the current project without deploying.\n"+c.app.ProviderHelp())
			return nil
		}
		return errors.New("invalid flags; use preview --help")
	}
	if *output == "" || flags.NArg() != 0 {
		return errors.New("output must not be empty; positional arguments are unsupported")
	}
	report, err := c.app.Preview(context.Background(), app.ReportOptions{
		Provider: *providerName, Output: *output, Sidecars: *sidecars, Costs: *costs,
	})
	if report.Path != "" {
		c.reportOmittedRelations(report)
	}
	c.reportSaved(report)
	if err != nil {
		return err
	}
	if !*noOpen && openHTML(report.Path) != nil {
		fmt.Fprintln(c.stderr, "Could not open the browser; open the saved HTML manually.")
	}
	return nil
}
