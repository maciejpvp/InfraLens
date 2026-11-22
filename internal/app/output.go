package app

import (
	"encoding/json"
	"errors"
	"io"
	"os"

	"infralens/internal/fileio"
	"infralens/internal/graph"
	"infralens/internal/render"
)

type outputFormat uint8

const (
	outputHTML outputFormat = iota
	outputJSON
)

func inspectOutput(path string) (os.FileInfo, error) {
	info, err := fileio.StatRegular(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if errors.Is(err, fileio.ErrNotRegular) {
		return nil, errors.New("output must be a regular file")
	}
	if err != nil {
		return nil, errors.New("cannot inspect output file")
	}
	return info, nil
}

func writeOutput(path string, g graph.Graph, format outputFormat) (Report, error) {
	err := fileio.WriteAtomic(path, func(w io.Writer) error {
		if format == outputJSON {
			encoder := json.NewEncoder(w)
			encoder.SetIndent("", "  ")
			return encoder.Encode(g)
		}
		return render.HTML(w, g)
	})
	if err != nil {
		return Report{}, err
	}
	return Report{Path: path, OmittedRelations: g.OmittedRelations}, nil
}
