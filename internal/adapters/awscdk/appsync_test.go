package awscdk

import (
	"io"
	"reflect"
	"slices"
	"strings"
	"testing"

	"infralens/internal/graph"
)

func TestAppSyncResolvers(t *testing.T) {
	const input = `{"Resources":{
		"Api":{"Type":"AWS::AppSync::GraphQLApi"},
		"OtherApi":{"Type":"AWS::AppSync::GraphQLApi"},
		"Key":{"Type":"AWS::AppSync::ApiKey","Properties":{"ApiId":{"Fn::GetAtt":"Api.ApiId"}}},
		"Schema":{"Type":"AWS::AppSync::GraphQLSchema","Properties":{"ApiId":{"Fn::GetAtt":"Api.ApiId"}}},
		"Get":{"Type":"AWS::Lambda::Function"},
		"Write":{"Type":"AWS::Lambda::Function"},
		"Other":{"Type":"AWS::Lambda::Function"},
		"Source":{"Type":"AWS::AppSync::DataSource","Properties":{"ApiId":{"Fn::GetAtt":"Api.ApiId"},"Name":"shared","Type":"AWS_LAMBDA","LambdaConfig":{"LambdaFunctionArn":{"Fn::GetAtt":"Get.Arn"}}}},
		"Writer":{"Type":"AWS::AppSync::DataSource","Properties":{"ApiId":{"Fn::GetAtt":"Api.ApiId"},"Name":"writer","Type":"AWS_LAMBDA","LambdaConfig":{"LambdaFunctionArn":{"Fn::GetAtt":"Write.Arn"}}}},
		"OtherSource":{"Type":"AWS::AppSync::DataSource","Properties":{"ApiId":{"Fn::GetAtt":"OtherApi.ApiId"},"Name":"shared","Type":"AWS_LAMBDA","LambdaConfig":{"LambdaFunctionArn":{"Fn::GetAtt":"Other.Arn"}}}},
		"Unit":{"Type":"AWS::AppSync::Resolver","Properties":{"ApiId":{"Fn::GetAtt":"Api.ApiId"},"TypeName":"Query","FieldName":"getItem","DataSourceName":"shared"}},
		"OtherUnit":{"Type":"AWS::AppSync::Resolver","Properties":{"ApiId":{"Fn::GetAtt":"OtherApi.ApiId"},"TypeName":"Query","FieldName":"otherItem","DataSourceName":"shared"}},
		"ForeignUnit":{"Type":"AWS::AppSync::Resolver","Properties":{"ApiId":{"Fn::GetAtt":"Api.ApiId"},"TypeName":"Query","FieldName":"foreign","DataSourceName":{"Fn::GetAtt":"OtherSource.Name"}}},
		"ReadStage":{"Type":"AWS::AppSync::FunctionConfiguration","Properties":{"ApiId":{"Fn::GetAtt":"Api.ApiId"},"DataSourceName":{"Fn::GetAtt":"Source.Name"}}},
		"WriteStage":{"Type":"AWS::AppSync::FunctionConfiguration","Properties":{"ApiId":{"Fn::GetAtt":"Api.ApiId"},"DataSourceName":"writer"}},
		"Pipeline":{"Type":"AWS::AppSync::Resolver","Properties":{"ApiId":{"Fn::GetAtt":"Api.ApiId"},"Kind":"PIPELINE","TypeName":"Mutation","FieldName":"updateItem","PipelineConfig":{"Functions":[{"Fn::GetAtt":"ReadStage.FunctionId"},{"Fn::GetAtt":"WriteStage.FunctionId"},{"Fn::GetAtt":"ReadStage.FunctionId"}]}}}
	}}`
	g, err := (Adapter{}).ReadInputs([]string{"app.json"}, func(string) (io.Reader, error) { return strings.NewReader(input), nil }, nil)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]string{}
	for _, n := range g.Nodes {
		names[n.ID] = n.Name
	}
	labels, owners := map[string][]string{}, map[string]string{}
	for _, e := range g.Edges {
		from, to := names[e.From], names[e.To]
		if e.Kind == graph.ConnectsTo {
			pair := from + "/" + to
			for _, proof := range e.Evidence {
				if proof.Label != "" {
					labels[pair] = append(labels[pair], proof.Label)
				}
			}
			slices.Sort(labels[pair])
		}
		if e.Kind == graph.DependsOn && slices.ContainsFunc(e.Evidence, func(p graph.Evidence) bool {
			return p.Source == graph.AppSyncAPISource
		}) {
			owners[from] = to
		}
	}
	want := map[string][]string{
		"Api/Get": {"Mutation.updateItem", "Query.getItem"}, "Api/Write": {"Mutation.updateItem"},
		"OtherApi/Other": {"Query.otherItem"},
	}
	if !reflect.DeepEqual(labels, want) {
		t.Fatalf("flow labels = %v, want %v", labels, want)
	}
	if len(owners) != 11 || owners["Schema"] != "Api" || owners["Key"] != "Api" || owners["OtherUnit"] != "OtherApi" {
		t.Fatalf("unexpected AppSync ownership: %v", owners)
	}
}
