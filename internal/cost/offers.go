package cost

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"slices"
	"strings"
)

type offerIndex map[string][]string

func publicOffers(ctx context.Context) (offerIndex, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, catalogBase+"index.json", nil)
	if err != nil {
		return nil, err
	}
	response, err := catalogClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, errors.New("AWS service index unavailable")
	}
	return readOffers(io.LimitReader(response.Body, 2<<20))
}

func readOffers(r io.Reader) (offerIndex, error) {
	var index struct {
		Offers map[string]struct{} `json:"offers"`
	}
	if err := json.NewDecoder(r).Decode(&index); err != nil {
		return nil, err
	}
	if len(index.Offers) == 0 {
		return nil, errors.New("AWS service index is empty")
	}
	result := offerIndex{}
	for code := range index.Offers {
		if serviceCodePattern.MatchString(code) {
			name := offerName(code)
			result[name] = append(result[name], code)
		}
	}
	for _, codes := range result {
		slices.Sort(codes)
	}
	return result, nil
}

func offerName(name string) string {
	name = strings.ToLower(name)
	name = strings.TrimPrefix(strings.TrimPrefix(name, "amazon"), "aws")
	return strings.NewReplacer("-", "", "_", "").Replace(name)
}

// Only namespace aliases live here. The index supplies the available offers.
var offerAliases = map[string]string{
	"accessanalyzer": "iamaccessanalyzer", "acm": "certificatemanager", "acmpca": "certificatemanager",
	"autoscaling": "ec2", "cdn": "cloudfront", "cloudwatchlogs": "cloudwatch",
	"emr": "elasticmapreduce", "eventbridge": "events",
	"firehose": "kinesisfirehose", "logs": "cloudwatch", "opensearch": "es",
	"route53domains": "route53", "s3express": "s3", "sqs": "queueservice",
	"ssm": "systemsmanager", "stepfunctions": "states", "timestreamwrite": "timestream",
}

func (index offerIndex) codes(service string) []string {
	name := offerName(service)
	if direct := index[name]; len(direct) > 0 {
		return direct
	}
	name = strings.TrimSuffix(name, "v2")
	if direct := index[name]; len(direct) > 0 {
		return direct
	}
	return index[offerAliases[name]]
}
