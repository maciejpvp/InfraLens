package app

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
)

const MockTopologyDeprecated = "The mock-topology command is deprecated."

func (a *App) Preview(ctx context.Context, options ReportOptions) (Report, error) {
	pricing, err := loadCosts(options)
	if err != nil {
		return Report{}, err
	}
	provider, err := a.provider(options.Provider)
	if err != nil {
		return Report{}, err
	}
	if provider.Adapter == nil {
		return Report{}, fmt.Errorf("provider %q does not support preview", options.Provider)
	}
	path, err := filepath.Abs(options.Output)
	if err != nil {
		return Report{}, errors.New("cannot resolve output path")
	}
	if filepath.Ext(path) != ".html" {
		return Report{}, errors.New("preview output must have an .html extension")
	}
	if err := checkGeneratedOutputs(path, options.Sidecars); err != nil {
		return Report{}, err
	}

	inventory := options.Costs.inventory()
	g, err := provider.Adapter.Preview(ctx, func() {
		a.notify("Generating an infrastructure preview for the current project.")
	}, inventory)
	if err != nil {
		return Report{}, err
	}
	costs, err := a.estimateCosts(ctx, g, inventory, pricing)
	if err != nil {
		return Report{}, err
	}
	g.PreviewProvider = options.Provider
	if _, err := inspectReportOutputs(path, options.Sidecars); err != nil {
		return Report{}, err
	}
	return writeReport(path, options.Sidecars, g, costs)
}

func (a *App) MockTopology(ctx context.Context, providerName string, projects []string, output string) (Report, error) {
	provider, err := a.provider(providerName)
	if err != nil {
		return Report{}, err
	}
	if provider.MockTopology == nil {
		return Report{}, fmt.Errorf("provider %q does not support mock-topology", providerName)
	}
	a.notify(MockTopologyDeprecated)
	if err := checkGeneratedOutputs(output, Sidecars{}); err != nil {
		return Report{}, err
	}
	a.notify("Simulating trusted Go project code with test mocks; first build may take several minutes.")
	g, err := provider.MockTopology(ctx, projects, output)
	if err != nil {
		return Report{}, err
	}
	if _, err := inspectReportOutputs(output, Sidecars{}); err != nil {
		return Report{}, err
	}
	return writeReport(output, Sidecars{}, g, nil)
}

func checkGeneratedOutputs(output string, sidecars Sidecars) error {
	if _, err := inspectReportOutputs(output, sidecars); err != nil {
		return err
	}
	return checkSidecars(sidecars)
}
