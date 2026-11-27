package app

import (
	"errors"

	"laytrace/internal/fileio"
	"laytrace/internal/graph"
)

func (a *App) Query(input string, options graph.QueryOptions) (graph.QueryResult, error) {
	file, _, err := fileio.OpenRegular(input)
	if err != nil {
		return graph.QueryResult{}, errors.New("cannot open graph input file")
	}
	defer file.Close()
	g, err := graph.ReadJSON(file)
	if err != nil {
		return graph.QueryResult{}, err
	}
	return g.Query(options)
}
