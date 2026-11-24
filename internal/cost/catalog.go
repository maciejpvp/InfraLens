package cost

import (
	"cmp"
	"context"
	"encoding/csv"
	"errors"
	"io"
	"maps"
	"math"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
)

type match struct {
	sku   string
	tiers []Tier
}

type catalogRequest struct {
	components []pending
	services   map[string]bool
}

type catalogResult struct {
	matches []match
	rates   []PriceRange
	region  string
}

type catalogLoader func(context.Context, catalogKey, catalogRequest) (catalogResult, error)

var catalogClient = &http.Client{Timeout: 90 * time.Second}

const catalogBase = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/"

func publicCatalog(ctx context.Context, key catalogKey, request catalogRequest) (catalogResult, error) {
	result, missing, err := fetchCatalog(ctx, key, request, false)
	if missing && key.region != "global" && len(request.services) > 0 {
		// The full offer also contains unscoped products such as CloudFront edge rates.
		// Regional estimate lookups must keep their original region.
		global, _, globalErr := fetchCatalog(ctx, catalogKey{key.service, "global"}, catalogRequest{services: request.services}, true)
		if globalErr == nil && len(global.rates) > 0 {
			global.matches = make([]match, len(request.components))
			return global, nil
		}
	}
	return result, err
}

func fetchCatalog(ctx context.Context, key catalogKey, query catalogRequest, unscopedOnly bool) (catalogResult, bool, error) {
	url := catalogBase + key.service + "/current/"
	if key.region != "global" {
		url += key.region + "/"
	}
	url += "index.csv"
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return catalogResult{}, false, err
	}
	response, err := catalogClient.Do(request)
	if err != nil {
		return catalogResult{}, false, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		missing := response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusForbidden
		return catalogResult{}, missing, errors.New("AWS pricing response unavailable")
	}
	limit := int64(512 << 20)
	if unscopedOnly {
		// shortcut: cap fallback downloads of all-region files, use the AWS region index when larger global offers need support.
		limit = 64 << 20
	}
	if response.ContentLength > limit {
		return catalogResult{}, false, errors.New("AWS pricing catalog exceeds size limit")
	}
	result, err := readCatalog(&io.LimitedReader{R: response.Body, N: limit}, key.region, query.components, len(query.services) > 0, unscopedOnly)
	return result, false, err
}

type priceBand struct{ start, end, price float64 }

func readCatalog(input *io.LimitedReader, region string, components []pending, summarize, unscopedOnly bool) (catalogResult, error) {
	reader := csv.NewReader(input)
	reader.FieldsPerRecord = -1
	reader.ReuseRecord = true
	columns := map[string]int{}
	for range 6 {
		row, err := reader.Read()
		if err != nil {
			return catalogResult{}, err
		}
		if row[0] == "SKU" {
			for i, name := range row {
				columns[name] = i
			}
			reader.FieldsPerRecord = len(row)
			break
		}
	}
	for _, field := range []string{"SKU", "TermType", "Currency", "Unit", "StartingRange", "EndingRange", "PricePerUnit"} {
		if _, ok := columns[field]; !ok {
			return catalogResult{}, errors.New("invalid AWS pricing columns")
		}
	}
	type selector struct {
		value, unit string
		sku         bool
	}
	queries := map[selector][]int{}
	for i, query := range components {
		key := selector{value: query.quote.usage, unit: query.quote.unit}
		if query.quote.sku != "" {
			key.value, key.sku = query.quote.sku, true
		}
		queries[key] = append(queries[key], i)
	}
	regionColumn, hasRegion := columns["Region Code"]
	usageColumn, hasUsage := columns["usageType"]
	familyColumn, hasFamily := columns["Product Family"]
	groups := map[priceGroup]PriceRange{}
	bands := make([]map[string][]priceBand, len(components))
	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return catalogResult{}, err
		}
		if row[columns["TermType"]] != "OnDemand" || row[columns["Currency"]] != "USD" {
			continue
		}
		rowRegion := ""
		if hasRegion {
			rowRegion = row[regionColumn]
		}
		if (unscopedOnly && ValidRegion(rowRegion)) || (region != "global" && rowRegion != "" && rowRegion != region) {
			continue
		}
		sku, unit := row[columns["SKU"]], row[columns["Unit"]]
		if sku == "" {
			continue
		}
		if summarize && unit != "" && (region != "global" || !ValidRegion(rowRegion)) {
			var family string
			if hasFamily {
				family = row[familyColumn]
			}
			addPriceRange(groups, family, unit, row[columns["PricePerUnit"]])
		}
		exact := queries[selector{value: sku, unit: unit, sku: true}]
		usage, regionalUsage := "", ""
		var byUsage, byRegionalUsage []int
		if hasUsage {
			usage = row[usageColumn]
			byUsage = queries[selector{value: usage, unit: unit}]
			if prefix, rest, ok := strings.Cut(usage, "-"); ok && isRegionPrefix(prefix) {
				regionalUsage = rest
				byRegionalUsage = queries[selector{value: rest, unit: unit}]
			}
		}
		for _, i := range slices.Concat(exact, byUsage, byRegionalUsage) {
			query := components[i].quote
			if (query.usage != "" && query.usage != usage && query.usage != regionalUsage) ||
				!matchesAttributes(row, columns, query) {
				continue
			}
			start, startErr := strconv.ParseFloat(row[columns["StartingRange"]], 64)
			end, endErr := strconv.ParseFloat(row[columns["EndingRange"]], 64)
			price, priceErr := strconv.ParseFloat(row[columns["PricePerUnit"]], 64)
			if startErr != nil || endErr != nil || priceErr != nil || math.IsNaN(start) ||
				math.IsNaN(end) || math.IsNaN(price) || math.IsInf(price, 0) || start < 0 || end <= start || price < 0 {
				return catalogResult{}, errors.New("invalid AWS price range")
			}
			if bands[i] == nil {
				bands[i] = map[string][]priceBand{}
			}
			bands[i][sku] = append(bands[i][sku], priceBand{start, end, price})
		}
	}
	if input.N == 0 {
		return catalogResult{}, errors.New("AWS pricing catalog exceeds size limit")
	}
	result := make([]match, len(components))
	for i, candidates := range bands {
		if len(candidates) != 1 {
			continue
		}
		for sku, prices := range candidates {
			result[i] = match{sku, paidTiers(prices)}
		}
	}
	rates := slices.Collect(maps.Values(groups))
	slices.SortFunc(rates, func(a, b PriceRange) int {
		if byFamily := cmp.Compare(a.Family, b.Family); byFamily != 0 {
			return byFamily
		}
		return cmp.Compare(a.Unit, b.Unit)
	})
	return catalogResult{matches: result, rates: rates, region: region}, nil
}

type priceGroup struct{ family, unit string }

func addPriceRange(groups map[priceGroup]PriceRange, family, unit, raw string) {
	price, err := strconv.ParseFloat(raw, 64)
	if err != nil || price < 0 || math.IsNaN(price) || math.IsInf(price, 0) {
		return
	}
	key := priceGroup{family, unit}
	current := groups[key]
	if current.Unit == "" {
		current = PriceRange{Family: family, Unit: unit, Min: price, Max: price}
	}
	// A free tier should not replace the smallest paid rate.
	if price > 0 && (current.Min == 0 || price < current.Min) {
		current.Min = price
	}
	current.Max = max(current.Max, price)
	groups[key] = current
}

// AWS uses prefixes such as EU and USE1. Variant prefixes such as IA and TS
// must remain part of the usage type.
func isRegionPrefix(prefix string) bool {
	if prefix == "EU" || prefix == "AP" {
		return true
	}
	if len(prefix) < 3 || strings.Trim(prefix, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") != "" {
		return false
	}
	last := prefix[len(prefix)-1]
	return last >= '0' && last <= '9'
}

func matchesAttributes(row []string, columns map[string]int, query quote) bool {
	if query.operation != "" {
		if i, ok := columns["operation"]; !ok || row[i] != query.operation {
			return false
		}
	}
	for name, value := range query.attributes {
		if i, ok := columns[name]; !ok || row[i] != value {
			return false
		}
	}
	return true
}

func paidTiers(prices []priceBand) []Tier {
	slices.SortFunc(prices, func(a, b priceBand) int {
		return cmp.Compare(a.start, b.start)
	})
	prices = slices.Compact(prices)
	if len(prices) == 0 || prices[0].start != 0 || !math.IsInf(prices[len(prices)-1].end, 1) {
		return nil
	}
	var tiers []Tier
	var previous, freeAllowance float64
	for _, band := range prices {
		if band.start != previous {
			return nil
		}
		previous = band.end
		if len(tiers) == 0 && band.price == 0 {
			freeAllowance = band.end
			continue
		}
		tier := Tier{Price: band.price}
		if !math.IsInf(band.end, 1) {
			end := band.end - freeAllowance
			tier.UpTo = &end
		}
		tiers = append(tiers, tier)
	}
	if len(tiers) == 0 {
		return []Tier{{Price: 0}}
	}
	return tiers
}
