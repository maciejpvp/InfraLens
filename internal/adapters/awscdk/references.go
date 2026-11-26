package awscdk

import (
	"regexp"
	"strings"
)

var substitution = regexp.MustCompile(`\$\{([A-Za-z0-9_.:]+)\}`)

func walkReferences(value any, visit func(target, intrinsic string)) {
	switch value := value.(type) {
	case map[string]any:
		if len(value) == 1 {
			if target, ok := value["Ref"].(string); ok {
				if target != "" {
					visit(target, "Ref")
				}
				return
			}
			if att, ok := value["Fn::GetAtt"]; ok {
				if target, _ := getAtt(att); target != "" {
					visit(target, "Fn::GetAtt")
					return
				}
			}
			if sub, ok := value["Fn::Sub"]; ok {
				walkSubstitution(sub, visit)
				return
			}
			if _, ok := value["Fn::ImportValue"]; ok {
				return
			}
		}
		for _, item := range value {
			walkReferences(item, visit)
		}
	case []any:
		for _, item := range value {
			walkReferences(item, visit)
		}
	}
}

func walkSubstitution(value any, visit func(target, intrinsic string)) {
	pattern, _ := value.(string)
	var overrides map[string]any
	if args, ok := value.([]any); ok && len(args) == 2 {
		pattern, _ = args[0].(string)
		overrides, _ = args[1].(map[string]any)
		walkReferences(overrides, visit)
	}
	for _, match := range substitution.FindAllStringSubmatch(pattern, -1) {
		if _, overridden := overrides[match[1]]; !overridden {
			target, _, _ := strings.Cut(match[1], ".")
			visit(target, "Fn::Sub")
		}
	}
}

func getAtt(value any) (target, attribute string) {
	switch value := value.(type) {
	case string:
		target, attribute, _ = strings.Cut(value, ".")
	case []any:
		if len(value) == 2 {
			target, _ = value[0].(string)
			attribute, _ = value[1].(string)
		}
	}
	if attribute == "" {
		return "", ""
	}
	return target, attribute
}
