package main

import (
	"os"

	"infralens/internal/cli"
)

func main() { os.Exit(cli.New(os.Stdout, os.Stderr).Run(os.Args[1:])) }
