package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"time"

	"infralens/internal/app"
	"infralens/internal/cost"
	"infralens/internal/fileio"
	"infralens/internal/graph"
)

const costUsage = " [--costs [--cost-region REGION] [--cost-rules FILE] [--cost-assumptions FILE]]"

type costOptions struct {
	enabled   bool
	region    string
	rulesPath string
	rules     cost.Rules
	usagePath string
	usage     *cost.UsageFile
}

func costFlags(flags *flag.FlagSet) *costOptions {
	options := &costOptions{}
	flags.BoolVar(&options.enabled, "costs", false, "embed AWS cost estimates")
	flags.StringVar(&options.region, "cost-region", "", "fallback AWS pricing region")
	flags.StringVar(&options.rulesPath, "cost-rules", "", "JSON billing rules for additional AWS resource types")
	flags.StringVar(&options.usagePath, "cost-assumptions", "", "JSON workload assumptions for cost estimates")
	return options
}

func (o *costOptions) load(outputs ...string) error {
	if o.region != "" && (!o.enabled || !cost.ValidRegion(o.region)) {
		return errors.New("--cost-region requires --costs and a valid AWS region")
	}
	if o.rulesPath != "" {
		if !o.enabled {
			return errors.New("--cost-rules requires --costs")
		}
		file, err := openCostInput(o.rulesPath, "cost rules", outputs...)
		if err != nil {
			return err
		}
		defer file.Close()
		o.rules, err = cost.ReadRules(file)
		if err != nil {
			return err
		}
	}
	if o.usagePath != "" {
		if !o.enabled {
			return errors.New("--cost-assumptions requires --costs")
		}
		file, err := openCostInput(o.usagePath, "cost assumptions", outputs...)
		if err != nil {
			return err
		}
		defer file.Close()
		o.usage, err = cost.ReadUsage(file)
		if err != nil {
			return err
		}
	}
	return nil
}

func openCostInput(path, label string, outputs ...string) (io.ReadCloser, error) {
	file, info, err := fileio.OpenRegular(path)
	if err != nil {
		return nil, fmt.Errorf("cannot open %s file", label)
	}
	for _, output := range outputs {
		outputInfo, _ := fileio.StatRegular(output)
		if fileio.SameFile(info, outputInfo) {
			file.Close()
			return nil, fmt.Errorf("%s and output must be different files", label)
		}
	}
	return file, nil
}

func (c *CLI) costReader(provider Provider, options costOptions) app.ReadInputsFunc {
	return func(inputs []string, open func(string) (io.Reader, error)) (graph.Graph, error) {
		var inventory cost.Inventory
		g, err := provider.ReadCostInputs(inputs, open, &inventory)
		if err != nil {
			return g, err
		}
		return c.attachCosts(context.Background(), g, inventory, options)
	}
}

func (c *CLI) costPreview(provider Provider, options costOptions) app.PreviewFunc {
	return func(ctx context.Context, onStart func()) (graph.Graph, error) {
		var inventory cost.Inventory
		g, err := provider.PreviewCosts(ctx, onStart, &inventory)
		if err != nil {
			return g, err
		}
		return c.attachCosts(ctx, g, inventory, options)
	}
}

func (c *CLI) attachCosts(ctx context.Context, g graph.Graph, inventory cost.Inventory, options costOptions) (graph.Graph, error) {
	if err := g.Validate(); err != nil {
		return g, err
	}
	workflows, err := options.usage.Workload(inventory)
	if err != nil {
		return g, err
	}
	fmt.Fprintln(c.stderr, "Estimating costs from public AWS prices.")
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	g.Costs = cost.Build(ctx, inventory, options.region, options.rules, workflows)
	if options.usage != nil && options.usage.Version == 1 {
		if err := options.usage.Apply(inventory, g.Costs); err != nil {
			return g, err
		}
		for _, warning := range g.Costs.Usage.Warnings {
			fmt.Fprintln(c.stderr, "Cost assumptions:", warning)
		}
	}
	return g, nil
}
