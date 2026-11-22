package pulumi

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"
)

var privateIdentifier = regexp.MustCompile(`(?i)[a-z][a-z0-9+.-]*://|\barn:|\burn:pulumi:|\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b|(?:[0-9a-f]{0,4}:){2,}[0-9a-f:]*`)

// Only explicitly selected configuration fields reach this formatter.
func detailValue(raw json.RawMessage) string {
	if len(raw) == 0 {
		return "unknown"
	}
	var value any
	if json.Unmarshal(raw, &value) != nil {
		return "unsupported"
	}
	if s, ok := value.(string); ok && json.Valid([]byte(s)) {
		_ = json.Unmarshal([]byte(s), &value)
	}
	var clean func(any) any
	clean = func(v any) any {
		switch x := v.(type) {
		case string:
			if strings.HasPrefix(x, "{") || strings.HasPrefix(x, "[") {
				var nested any
				if json.Unmarshal([]byte(x), &nested) == nil {
					return clean(nested)
				}
			}
			if strings.Contains(x, unknownValue) {
				return "unknown"
			}
			if x == "[secret]" || privateIdentifier.MatchString(x) {
				return "[redacted]"
			}
		case map[string]any:
			if _, ok := x["4dabf18193072939515e22adb298388d"]; ok {
				return "[redacted]"
			}
			result := map[string]any{}
			for k, v := range x {
				key := k
				if privateIdentifier.MatchString(k) {
					key = "[redacted]"
				}
				result[key] = clean(v)
			}
			return result
		case []any:
			for i, v := range x {
				x[i] = clean(v)
			}
			return x
		}
		return v
	}
	value = clean(value)
	if s, ok := value.(string); ok {
		return s
	}
	data, _ := json.Marshal(value)
	return string(data)
}

func detailFields(inputs map[string]json.RawMessage, keys ...string) string {
	var lines []string
	for _, key := range keys {
		if raw, ok := inputs[key]; ok {
			lines = append(lines, key+": "+detailValue(raw))
		}
	}
	return strings.Join(lines, "\n")
}

func eventLabel(raw json.RawMessage, fallback string) string {
	var events []string
	if json.Unmarshal(raw, &events) != nil || len(events) == 0 {
		return fallback
	}
	sort.Strings(events)
	result := make([]string, 0, len(events))
	for _, event := range events {
		data, _ := json.Marshal(event)
		result = append(result, detailValue(data))
	}
	return strings.Join(result, ", ")
}

func mappingDescription(r resource, dynamo bool) (string, string) {
	label := "SQS messages"
	if dynamo {
		label = "DynamoDB Streams"
		if raw, ok := r.Inputs["filterCriteria"]; !ok || string(raw) == "null" {
			label += " · INSERT, MODIFY, REMOVE"
		} else {
			var criteria struct {
				Filters []struct {
					Pattern string `json:"pattern"`
				} `json:"filters"`
			}
			var fields map[string]json.RawMessage
			var filters []json.RawMessage
			empty := json.Unmarshal(raw, &fields) == nil && fields != nil && (len(fields) == 0 || len(fields) == 1 && fields["filters"] != nil && json.Unmarshal(fields["filters"], &filters) == nil && len(filters) == 0)
			events := map[string]bool{}
			simple := json.Unmarshal(raw, &criteria) == nil && len(criteria.Filters) > 0
			for _, f := range criteria.Filters {
				var pattern map[string]json.RawMessage
				if json.Unmarshal([]byte(f.Pattern), &pattern) != nil || len(pattern) != 1 {
					simple = false
					break
				}
				var names []string
				if json.Unmarshal(pattern["eventName"], &names) != nil || len(names) == 0 {
					simple = false
					break
				}
				for _, name := range names {
					if name != "INSERT" && name != "MODIFY" && name != "REMOVE" {
						simple = false
					}
					events[name] = true
				}
			}
			if simple {
				names := make([]string, 0, len(events))
				for n := range events {
					names = append(names, n)
				}
				sort.Strings(names)
				label += " · " + strings.Join(names, ", ")
			} else if unavailable(raw) {
				label += " · unknown filter"
			} else if empty {
				label += " · INSERT, MODIFY, REMOVE"
			} else {
				label += " · filtered"
			}
		}
	}
	if string(r.Inputs["enabled"]) == "false" {
		label += " · disabled"
	}
	return label, detailFields(r.Inputs, "filterCriteria", "enabled", "startingPosition", "batchSize", "maximumBatchingWindowInSeconds")
}

func eventBridgeDescription(r resource) (string, string) {
	inputs := map[string]json.RawMessage{}
	for key, value := range r.Inputs {
		inputs[key] = value
	}
	label := "EventBridge"
	if raw, ok := r.Inputs["scheduleExpression"]; ok {
		label = detailValue(raw)
	} else if raw, ok := r.Inputs["eventPattern"]; ok {
		var pattern map[string]json.RawMessage
		if json.Unmarshal([]byte(scalar(raw)), &pattern) == nil {
			var detail map[string]json.RawMessage
			if json.Unmarshal(pattern["detail"], &detail) == nil {
				if _, ok := detail["bucket"]; ok {
					detail["bucket"] = json.RawMessage(`{"name":"[redacted]"}`)
				}
				pattern["detail"], _ = json.Marshal(detail)
			}
			inputs["eventPattern"], _ = json.Marshal(pattern)
			parts := []string{}
			for _, key := range []string{"source", "detail-type"} {
				if len(pattern[key]) > 0 {
					parts = append(parts, eventLabel(pattern[key], "unknown"))
				}
			}
			if len(parts) > 0 {
				label = strings.Join(parts, " · ")
			}
		}
	}
	return label, detailFields(inputs, "eventPattern", "scheduleExpression")
}
