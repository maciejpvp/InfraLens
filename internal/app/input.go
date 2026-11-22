package app

import (
	"errors"
	"os"
	"strings"

	"infralens/internal/adapters/pulumi"
	"infralens/internal/fileio"
	"infralens/internal/graph"
)

func readInputs(inputs []string, outputInfo os.FileInfo) (graph.Graph, error) {
	sources := make([]pulumi.Source, 0, len(inputs))
	for _, input := range inputs {
		name, path := splitInput(input)
		in, info, err := fileio.OpenRegular(path)
		if errors.Is(err, fileio.ErrNotRegular) {
			return graph.Graph{}, errors.New("input must be a regular file")
		}
		if err != nil {
			return graph.Graph{}, errors.New("cannot open input file")
		}
		defer in.Close()
		if fileio.SameFile(info, outputInfo) {
			return graph.Graph{}, errors.New("input and output must be different files")
		}
		sources = append(sources, pulumi.Source{Reader: in, Stack: name})
	}
	return pulumi.ReadSources(sources...)
}

func splitInput(input string) (stack, path string) {
	stack, path, named := strings.Cut(input, "=")
	if !named {
		return "", input
	}
	if _, ok := pulumi.ParseStackIdentity(stack); !ok {
		return "", input
	}
	if fileio.Exists(input) {
		return "", input
	}
	return stack, path
}
