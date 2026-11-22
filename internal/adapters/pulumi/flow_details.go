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
	redactedKeys := false
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
				if privateIdentifier.MatchString(k) {
					redactedKeys = true
					continue
				}
				result[k] = clean(v)
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
	if redactedKeys {
		return string(data) + " · contains [redacted] keys"
	}
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
		label = "DynamoDB Streams · " + dynamoFilterLabel(r.Inputs["filterCriteria"])
	}
	if string(r.Inputs["enabled"]) == "false" {
		label += " · disabled"
	}
	return label, detailFields(r.Inputs, "filterCriteria", "enabled", "startingPosition", "batchSize", "maximumBatchingWindowInSeconds")
}

func dynamoFilterLabel(raw json.RawMessage) string {
	const allEvents = "INSERT, MODIFY, REMOVE"
	if len(raw) == 0 || string(raw) == "null" {
		return allEvents
	}
	// Read the outer object once so missing, empty and unrecognized filters stay distinct.
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) == nil && fields != nil {
		if len(fields) == 0 {
			return allEvents
		}
		if names, ok := dynamoFilterEvents(fields["filters"]); ok {
			if len(names) > 0 {
				return strings.Join(names, ", ")
			}
			if len(fields) == 1 {
				return allEvents
			}
		}
	}
	if unavailable(raw) {
		return "unknown filter"
	}
	return "filtered"
}

func dynamoFilterEvents(raw json.RawMessage) ([]string, bool) {
	var filters []struct{ Pattern string }
	if json.Unmarshal(raw, &filters) != nil {
		return nil, false
	}
	events := map[string]bool{}
	for _, f := range filters {
		var pattern map[string]json.RawMessage
		if json.Unmarshal([]byte(f.Pattern), &pattern) != nil || len(pattern) != 1 {
			return nil, false
		}
		var names []string
		if json.Unmarshal(pattern["eventName"], &names) != nil || len(names) == 0 {
			return nil, false
		}
		for _, name := range names {
			switch name {
			case "INSERT", "MODIFY", "REMOVE":
				events[name] = true
			default:
				return nil, false
			}
		}
	}
	names := make([]string, 0, len(events))
	for name := range events {
		names = append(names, name)
	}
	sort.Strings(names)
	return names, true
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
