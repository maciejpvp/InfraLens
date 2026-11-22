package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"

	"infralens/internal/app"
)

const previewUsage = "InfraLens preview --provider NAME [--output infralens.html] [--no-open]"

func (c *CLI) preview(args []string) error {
	flags := newFlagSet("preview")
	providerName := flags.String("provider", "", "IaC provider")
	output := flags.String("output", "infralens.html", "destination HTML file")
	noOpen := flags.Bool("no-open", false, "save without opening the browser")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fmt.Fprintln(c.stdout, "Usage: "+previewUsage+"\nPreviews infrastructure changes for the current project without deploying.\n"+c.providerHelp())
			return nil
		}
		return errors.New("invalid flags; use preview --help")
	}
	if *output == "" || flags.NArg() != 0 {
		return errors.New("output must not be empty; positional arguments are unsupported")
	}
	provider, err := c.provider(*providerName)
	if err != nil {
		return err
	}
	if provider.Preview == nil {
		return fmt.Errorf("provider %q does not support preview", *providerName)
	}
	report, err := app.Preview(context.Background(), *output, provider.Preview, func() {
		fmt.Fprintln(c.stderr, "Previewing infrastructure changes for the current project.")
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
