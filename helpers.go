package main

import (
	"fmt"
	"strconv"
	"strings"
)

func getValue(row []interface{}, index int) interface{} {
	if index < 0 || index >= len(row) {
		return ""
	}

	return row[index]
}

func toFloat(value interface{}) float64 {
	s := strings.TrimSpace(fmt.Sprintf("%v", value))
	if s == "" {
		return 0
	}

	s = normalizeNumberString(s)
	number, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}

	return number
}

func normalizeNumberString(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, " ", "")

	commaCount := strings.Count(s, ",")
	dotCount := strings.Count(s, ".")

	switch {
	case commaCount > 0 && dotCount > 0:
		lastComma := strings.LastIndex(s, ",")
		lastDot := strings.LastIndex(s, ".")
		if lastComma > lastDot {
			s = strings.ReplaceAll(s, ".", "")
			s = strings.ReplaceAll(s, ",", ".")
		} else {
			s = strings.ReplaceAll(s, ",", "")
		}
	case commaCount > 0 && dotCount == 0:
		if commaCount == 1 {
			s = strings.ReplaceAll(s, ",", ".")
		} else {
			s = strings.ReplaceAll(s, ",", "")
		}
	case dotCount > 0 && commaCount == 0:
		// "960.000" -> 960000 (thousands separator style)
		// but keep "5.20" as decimal.
		if dotCount == 1 {
			parts := strings.Split(s, ".")
			if len(parts) == 2 && len(parts[1]) == 3 && len(parts[0]) >= 1 {
				s = strings.ReplaceAll(s, ".", "")
			}
		} else {
			s = strings.ReplaceAll(s, ".", "")
		}
	}

	return s
}
