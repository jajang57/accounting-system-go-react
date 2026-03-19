package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
)

type CompareSummary struct {
	SourceA              string        `json:"sourceA"`
	SourceB              string        `json:"sourceB"`
	RowsA                int           `json:"rowsA"`
	RowsB                int           `json:"rowsB"`
	OnlyInA              int           `json:"onlyInA"`
	OnlyInB              int           `json:"onlyInB"`
	AmountMismatch       int           `json:"amountMismatch"`
	SampleOnlyInA        []CompareItem `json:"sampleOnlyInA"`
	SampleOnlyInB        []CompareItem `json:"sampleOnlyInB"`
	SampleAmountMismatch []CompareDiff `json:"sampleAmountMismatch"`
}

type CompareItem struct {
	Key    string  `json:"key"`
	Count  int     `json:"count"`
	Debit  float64 `json:"debit"`
	Kredit float64 `json:"kredit"`
}

type CompareDiff struct {
	Key     string  `json:"key"`
	DebitA  float64 `json:"debitA"`
	KreditA float64 `json:"kreditA"`
	DebitB  float64 `json:"debitB"`
	KreditB float64 `json:"kreditB"`
	CountA  int     `json:"countA"`
	CountB  int     `json:"countB"`
}

type bucket struct {
	Key    string
	Count  int
	Debit  float64
	Kredit float64
}

func flattenBukuBesar(rowsByAkun map[string][]BukuBesarRow) []BukuBesarRow {
	out := make([]BukuBesarRow, 0)
	for _, rows := range rowsByAkun {
		out = append(out, rows...)
	}

	sort.Slice(out, func(i, j int) bool {
		ai := strings.ToLower(strings.TrimSpace(out[i].COA))
		aj := strings.ToLower(strings.TrimSpace(out[j].COA))
		if ai != aj {
			return ai < aj
		}
		ti := parseTanggal(out[i].Tanggal)
		tj := parseTanggal(out[j].Tanggal)
		if !ti.Equal(tj) {
			return ti.Before(tj)
		}
		if out[i].NoBukti != out[j].NoBukti {
			return out[i].NoBukti < out[j].NoBukti
		}
		return out[i].Keterangan < out[j].Keterangan
	})

	return out
}

func compareBukuBesar(sourceA string, a []BukuBesarRow, sourceB string, b []BukuBesarRow) CompareSummary {
	mapA := toBucketMap(a)
	mapB := toBucketMap(b)

	onlyA := make([]CompareItem, 0)
	onlyB := make([]CompareItem, 0)
	diff := make([]CompareDiff, 0)

	for key, ba := range mapA {
		bb, exists := mapB[key]
		if !exists {
			onlyA = append(onlyA, CompareItem{
				Key:    key,
				Count:  ba.Count,
				Debit:  ba.Debit,
				Kredit: ba.Kredit,
			})
			continue
		}
		if !almostEqual(ba.Debit, bb.Debit) || !almostEqual(ba.Kredit, bb.Kredit) || ba.Count != bb.Count {
			diff = append(diff, CompareDiff{
				Key:     key,
				DebitA:  ba.Debit,
				KreditA: ba.Kredit,
				DebitB:  bb.Debit,
				KreditB: bb.Kredit,
				CountA:  ba.Count,
				CountB:  bb.Count,
			})
		}
	}

	for key, bb := range mapB {
		if _, exists := mapA[key]; exists {
			continue
		}
		onlyB = append(onlyB, CompareItem{
			Key:    key,
			Count:  bb.Count,
			Debit:  bb.Debit,
			Kredit: bb.Kredit,
		})
	}

	sort.Slice(onlyA, func(i, j int) bool { return onlyA[i].Key < onlyA[j].Key })
	sort.Slice(onlyB, func(i, j int) bool { return onlyB[i].Key < onlyB[j].Key })
	sort.Slice(diff, func(i, j int) bool { return diff[i].Key < diff[j].Key })

	return CompareSummary{
		SourceA:              sourceA,
		SourceB:              sourceB,
		RowsA:                len(a),
		RowsB:                len(b),
		OnlyInA:              len(onlyA),
		OnlyInB:              len(onlyB),
		AmountMismatch:       len(diff),
		SampleOnlyInA:        limitCompareItems(onlyA, 20),
		SampleOnlyInB:        limitCompareItems(onlyB, 20),
		SampleAmountMismatch: limitCompareDiffs(diff, 20),
	}
}

func writeBukuBesarCSV(w io.Writer, rows []BukuBesarRow) error {
	cw := csv.NewWriter(w)
	if err := cw.Write([]string{"Akun", "Tanggal", "No Bukti", "Keterangan", "Debit", "Kredit", "Saldo"}); err != nil {
		return err
	}

	for _, row := range rows {
		record := []string{
			row.COA,
			row.Tanggal,
			row.NoBukti,
			row.Keterangan,
			strings.ReplaceAll(strconv.FormatFloat(row.Debit, 'f', 2, 64), ".", ","),
			strings.ReplaceAll(strconv.FormatFloat(row.Kredit, 'f', 2, 64), ".", ","),
			strings.ReplaceAll(strconv.FormatFloat(row.Saldo, 'f', 2, 64), ".", ","),
		}
		if err := cw.Write(record); err != nil {
			return err
		}
	}

	cw.Flush()
	return cw.Error()
}

func toBucketMap(rows []BukuBesarRow) map[string]bucket {
	out := make(map[string]bucket, len(rows))
	for _, row := range rows {
		if isPlaceholderRow(row) {
			continue
		}
		key := buildCompareKey(row)
		b := out[key]
		b.Key = key
		b.Count++
		b.Debit += row.Debit
		b.Kredit += row.Kredit
		out[key] = b
	}
	return out
}

func buildCompareKey(row BukuBesarRow) string {
	coa := normalizeAkun(row.COA)
	tanggal := canonicalDateKey(row.Tanggal)
	nobukti := strings.ToLower(strings.TrimSpace(row.NoBukti))
	ket := strings.ToLower(strings.TrimSpace(row.Keterangan))
	return fmt.Sprintf("%s|%s|%s|%s", coa, tanggal, nobukti, ket)
}

func almostEqual(a, b float64) bool {
	const eps = 0.1
	if a > b {
		return a-b <= eps
	}
	return b-a <= eps
}

func canonicalDateKey(raw string) string {
	t := parseTanggal(raw)
	if t.IsZero() {
		return strings.TrimSpace(raw)
	}
	return t.Format("2006-01-02")
}

func isPlaceholderRow(row BukuBesarRow) bool {
	return strings.TrimSpace(row.NoBukti) == "" &&
		row.Debit == 0 &&
		row.Kredit == 0
}

func limitCompareItems(items []CompareItem, n int) []CompareItem {
	if len(items) <= n {
		return items
	}
	return items[:n]
}

func limitCompareDiffs(items []CompareDiff, n int) []CompareDiff {
	if len(items) <= n {
		return items
	}
	return items[:n]
}
