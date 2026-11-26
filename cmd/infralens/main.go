package main

import (
	"fmt"
	"os"

	"infralens/internal/adapters/awscdk"
	"infralens/internal/adapters/pulumi"
	"infralens/internal/adapters/pulumi/simulate"
	"infralens/internal/app"
	"infralens/internal/cli"
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
