package pulumi

import (
	"strings"
	"testing"

	"laytrace/internal/cost"
)

func TestCostInventoryKeepsDifferentPreviewStates(t *testing.T) {
	var inventory cost.Inventory
	_, err := readSources(&inventory, Source{Reader: strings.NewReader(`{
		"steps":[
			{"op":"same","urn":"urn:pulumi:dev::p::pulumi:providers:aws::east",
			 "oldState":{"urn":"urn:pulumi:dev::p::pulumi:providers:aws::east","type":"pulumi:providers:aws","inputs":{"region":"us-east-2"}},
			 "newState":{"urn":"urn:pulumi:dev::p::pulumi:providers:aws::east","type":"pulumi:providers:aws","inputs":{"region":"us-east-2"}}},
			{"op":"update","urn":"urn:pulumi:dev::p::aws:lambda/function:Function::worker",
			 "oldState":{"urn":"urn:pulumi:dev::p::aws:lambda/function:Function::worker","type":"aws:lambda/function:Function","provider":"urn:pulumi:dev::p::pulumi:providers:aws::east::123","inputs":{"memorySize":128}},
			 "newState":{"urn":"urn:pulumi:dev::p::aws:lambda/function:Function::worker","type":"aws:lambda/function:Function","provider":"urn:pulumi:dev::p::pulumi:providers:aws::east::123","inputs":{"memorySize":512}}},
			{"op":"delete","urn":"urn:pulumi:dev::p::aws:sqs/queue:Queue::old",
			 "oldState":{"urn":"urn:pulumi:dev::p::aws:sqs/queue:Queue::old","type":"aws:sqs/queue:Queue"}},
			{"op":"create","urn":"urn:pulumi:dev::p::aws:sqs/queue:Queue::new",
			 "newState":{"urn":"urn:pulumi:dev::p::aws:sqs/queue:Queue::new","type":"aws:sqs/queue:Queue"}}
		]
	}`)})
	if err != nil {
		t.Fatal(err)
	}
	if !inventory.Compare || len(inventory.Before) != 2 || len(inventory.After) != 2 {
		t.Fatalf("unexpected inventory %+v", inventory)
	}
	for _, side := range []struct {
		items  []cost.Resource
		queue  string
		memory float64
	}{
		{inventory.Before, "old", 128},
		{inventory.After, "new", 512},
	} {
		for _, item := range side.items {
			switch item.Type {
			case lambdaType:
				if item.Region != "us-east-2" || item.Properties["memorySize"] != side.memory {
					t.Errorf("unexpected function configuration: %+v", item)
				}
			case queueType:
				if item.Name != side.queue {
					t.Errorf("unexpected queue: %+v", item)
				}
			}
		}
	}
}
