package graph

import "regexp"

// AppSyncAPISource identifies an explicit association with an AppSync GraphQL API.
const AppSyncAPISource = "appsync_api"

var graphQLName = regexp.MustCompile(`^[_A-Za-z][_0-9A-Za-z]*$`)

func AppSyncField(typeName, fieldName string) string {
	if graphQLName.MatchString(typeName) && graphQLName.MatchString(fieldName) {
		return typeName + "." + fieldName
	}
	return ""
}
