package app

import (
	"errors"
	"io"
	"os"

	"infralens/internal/fileio"
	"infralens/internal/graph"
)

// ReadInputsFunc builds a graph from an ordered batch of CLI inputs.
// Readers obtained through open are valid until the function returns.
type ReadInputsFunc func(inputs []string, open func(path string) (io.Reader, error)) (graph.Graph, error)

func readInputs(inputs []string, outputs []os.FileInfo, read ReadInputsFunc) (graph.Graph, error) {
	var opened []*os.File
	defer func() {
		for _, in := range opened {
			in.Close()
		}
	}()
	return read(inputs, func(path string) (io.Reader, error) {
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
	})
}
