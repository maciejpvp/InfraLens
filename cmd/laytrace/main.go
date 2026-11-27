package main

import (
	"fmt"
	"os"

	"laytrace/internal/adapters/awscdk"
	"laytrace/internal/adapters/pulumi"
	"laytrace/internal/adapters/pulumi/simulate"
	"laytrace/internal/app"
	"laytrace/internal/cli"
)

func main() {
	application := app.New(map[string]app.Provider{
		"pulumi":    {Adapter: pulumi.Adapter{}, MockTopology: simulate.RunInputs},
		"terraform": {},
		"aws-cdk":   {Adapter: awscdk.Adapter{}},
	}, func(message string) {
		fmt.Fprintln(os.Stderr, message)
	})
	os.Exit(cli.New(os.Stdout, os.Stderr, application).Run(os.Args[1:]))
}
