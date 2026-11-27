package pulumi

import (
	"io"
	"strings"

	"laytrace/internal/cost"
	"laytrace/internal/fileio"
	"laytrace/internal/graph"
)

type Adapter struct{}

// ReadInputs builds a graph from exported stacks or preview files.
func (Adapter) ReadInputs(inputs []string, open func(string) (io.Reader, error), inventory *cost.Inventory) (graph.Graph, error) {
	sources := make([]Source, 0, len(inputs))
	for _, input := range inputs {
		stack, path := splitInput(input)
		reader, err := open(path)
		if err != nil {
			return graph.Graph{}, err
		}
		sources = append(sources, Source{Reader: reader, Stack: stack})
	}
	return readSources(inventory, sources...)
}

func splitInput(input string) (stack, path string) {
	stack, path, named := strings.Cut(input, "=")
	if !named {
		return "", input
	}
	if _, ok := ParseStackIdentity(stack); !ok {
		return "", input
	}
	if fileio.Exists(input) {
		return "", input
	}
	return stack, path
}
