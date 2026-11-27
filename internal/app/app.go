// Package app runs Laytrace workflows.
package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"maps"
	"slices"
	"strings"

	"laytrace/internal/cost"
	"laytrace/internal/graph"
)

// Adapter builds graphs from a provider's files or project. A non-nil inventory
// requests billing inputs alongside the graph.
type Adapter interface {
	// Readers obtained through open are valid until ReadInputs returns.
	ReadInputs(inputs []string, open func(string) (io.Reader, error), inventory *cost.Inventory) (graph.Graph, error)
	// Preview calls onStart just before running the provider tool.
	Preview(ctx context.Context, onStart func(), inventory *cost.Inventory) (graph.Graph, error)
}

type Provider struct {
	Adapter      Adapter
	MockTopology func(context.Context, []string, string) (graph.Graph, error)
}

type App struct {
	providers map[string]Provider
	notify    func(string)
}

func New(providers map[string]Provider, notify func(string)) *App {
	if notify == nil {
		notify = func(string) {}
	}
	return &App{providers: maps.Clone(providers), notify: notify}
}

func (p Provider) available() bool {
	return p.Adapter != nil || p.MockTopology != nil
}

func (a *App) provider(name string) (Provider, error) {
	if name == "" {
		return Provider{}, errors.New("--provider is required; use --help for choices")
	}
	provider, ok := a.providers[name]
	if !ok {
		return Provider{}, errors.New("unknown --provider; use --help for choices")
	}
	if !provider.available() {
		return Provider{}, fmt.Errorf("provider %q is not implemented yet", name)
	}
	return provider, nil
}

func (a *App) ProviderHelp() string {
	var choices []string
	for _, name := range slices.Sorted(maps.Keys(a.providers)) {
		if !a.providers[name].available() {
			name += " (planned)"
		}
		choices = append(choices, name)
	}
	return "Provider choices: " + strings.Join(choices, ", ") + "."
}
