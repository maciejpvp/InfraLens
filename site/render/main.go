// Command render builds the public Pages demo from its checked-in graph.
package main

import (
	"log"
	"os"

	"laytrace/internal/graph"
	"laytrace/internal/render"
)

func main() {
	if len(os.Args) != 2 {
		log.Fatal("usage: go run ./site/render GRAPH_JSON > demo.html")
	}
	file, err := os.Open(os.Args[1])
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()

	demo, err := graph.ReadJSON(file)
	if err != nil {
		log.Fatal(err)
	}
	if err := render.HTML(os.Stdout, demo, nil); err != nil {
		log.Fatal(err)
	}
}
