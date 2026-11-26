package cli

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"

	"infralens/internal/graph"
)

const queryUsage = "infralens query --input GRAPH.json [--summary] [--changed] [--change STATUS] [--search TEXT] [--id ID] [--name NAME] [--stack STACK] [--type TYPE] [--limit N] [--offset N] [--relation-offset N]"

func (c *CLI) query(args []string) error {
	flags := newFlagSet("query")
	input := flags.String("input", "", "normalized InfraLens graph JSON")
	change := flags.String("change", "", "change status (replace also matches possible CDK replacements)")
	var options graph.QueryOptions
	flags.StringVar(&options.ID, "id", "", "exact resource ID")
	flags.StringVar(&options.Name, "name", "", "exact resource name")
	flags.StringVar(&options.Stack, "stack", "", "exact stack name")
	flags.StringVar(&options.Type, "type", "", "exact IaC resource type")
	flags.StringVar(&options.Search, "search", "", "case-insensitive text in resource names, stacks, types, or services")
	flags.BoolVar(&options.Changed, "changed", false, "only planned creates, updates, replacements, and deletions")
	flags.BoolVar(&options.Summary, "summary", false, "report counts without listing resources")
	flags.IntVar(&options.Limit, "limit", 0, "page size (default 10, maximum 25)")
	flags.IntVar(&options.Offset, "offset", 0, "result offset")
	flags.IntVar(&options.RelationOffset, "relation-offset", 0, "relationship offset for a single resource")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fmt.Fprintln(c.stdout, "Usage: "+queryUsage)
			return nil
		}
		return errors.New("invalid flags; use query --help")
	}
	if *input == "" || flags.NArg() != 0 {
		return errors.New("--input is required; positional arguments are unsupported")
	}

	options.Change = graph.Change(*change)
	result, err := c.app.Query(*input, options)
	if err != nil {
		return err
	}
	return json.NewEncoder(c.stdout).Encode(result)
}
