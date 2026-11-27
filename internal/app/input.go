package app

import (
	"errors"
	"io"
	"os"

	"laytrace/internal/cost"
	"laytrace/internal/fileio"
	"laytrace/internal/graph"
)

func readInputs(inputs []string, outputs []os.FileInfo, adapter Adapter, inventory *cost.Inventory) (graph.Graph, error) {
	var opened []*os.File
	defer func() {
		for _, in := range opened {
			in.Close()
		}
	}()
	return adapter.ReadInputs(inputs, func(path string) (io.Reader, error) {
		in, info, err := fileio.OpenRegular(path)
		if errors.Is(err, fileio.ErrNotRegular) {
			return nil, errors.New("input must be a regular file")
		}
		if err != nil {
			return nil, errors.New("cannot open input file")
		}
		opened = append(opened, in)
		for _, output := range outputs {
			if fileio.SameFile(info, output) {
				return nil, errors.New("input and output must be different files")
			}
		}
		return in, nil
	}, inventory)
}
