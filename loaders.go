package main

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"google.golang.org/api/sheets/v4"
)

const (
	rangeKasBesar          = "KAS BESAR!A6:M"
	rangeMasterCOA         = "master_coa!A2:P"
	rangeBukuSetelahJurnal = "BUKU_SETELAH_JURNAL!A2:H"
)

func LoadKasBesar(ctx context.Context, svc *sheets.Service, spreadsheetID string) ([]Transaksi, error) {
	resp, err := svc.Spreadsheets.Values.Get(spreadsheetID, rangeKasBesar).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("gagal membaca data KAS BESAR: %w", err)
	}

	result := make([]Transaksi, 0, len(resp.Values))
	for _, row := range resp.Values {
		item := Transaksi{
			NoBukti:    fmt.Sprintf("%v", getValue(row, 1)),
			Tanggal:    fmt.Sprintf("%v", getValue(row, 2)),
			COA:        fmt.Sprintf("%v", getValue(row, 3)),
			Keterangan: fmt.Sprintf("%v", getValue(row, 4)),
			CustVendor: fmt.Sprintf("%v", getValue(row, 5)),
			Debit:      toFloat(getValue(row, 6)),
			Kredit:     toFloat(getValue(row, 7)),
			Sumber:     "KAS BESAR",
		}
		result = append(result, item)
	}

	return result, nil
}

func LoadMasterCOA(ctx context.Context, svc *sheets.Service, spreadsheetID string) ([]COA, error) {
	resp, err := svc.Spreadsheets.Values.Get(spreadsheetID, rangeMasterCOA).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("gagal membaca data master_coa: %w", err)
	}

	result := make([]COA, 0, len(resp.Values))
	for _, row := range resp.Values {
		item := COA{
			KodeAkun:   fmt.Sprintf("%v", getValue(row, 0)),
			NamaAkun:   fmt.Sprintf("%v", getValue(row, 1)),
			SaldoAwal:  toFloat(getValue(row, 7)),
			HeaderNRC:  fmt.Sprintf("%v", getValue(row, 8)),
			HeaderLR:   fmt.Sprintf("%v", getValue(row, 10)),
			headingnrc: fmt.Sprintf("%v", getValue(row, 9)),  // pastikan index sesuai
			headinglr:  fmt.Sprintf("%v", getValue(row, 11)), // pastikan index sesuai
		}
		result = append(result, item)
	}

	return result, nil
}

func LoadAllTransaksi(ctx context.Context, svc *sheets.Service, spreadsheetID string) ([]Transaksi, error) {
	masterRange := "master_coa!B2:C"
	masterResp, err := svc.Spreadsheets.Values.Get(spreadsheetID, masterRange).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("gagal membaca data alias dari %s: %w", masterRange, err)
	}

	all := make([]Transaksi, 0)
	for _, row := range masterResp.Values {
		namaAkun := strings.TrimSpace(fmt.Sprintf("%v", getValue(row, 0)))
		alias := strings.TrimSpace(fmt.Sprintf("%v", getValue(row, 1)))
		if alias == "" {
			continue
		}

		sheetNames := uniqueNonEmpty(alias, namaAkun)
		var resp *sheets.ValueRange
		var lastErr error
		usedSheet := ""
		for _, sheetName := range sheetNames {
			readRange := fmt.Sprintf("%s!B4:H", quoteSheetName(sheetName))
			resp, err = svc.Spreadsheets.Values.Get(spreadsheetID, readRange).Context(ctx).Do()
			if err == nil {
				usedSheet = sheetName
				break
			}
			lastErr = err
		}

		if resp == nil {
			return nil, fmt.Errorf("gagal membaca transaksi akun %q (alias %q): %w", namaAkun, alias, lastErr)
		}

		for _, trxRow := range resp.Values {
			item := Transaksi{
				NoBukti:    fmt.Sprintf("%v", getValue(trxRow, 0)),
				Tanggal:    fmt.Sprintf("%v", getValue(trxRow, 1)),
				COA:        namaAkun,
				Keterangan: fmt.Sprintf("%v", getValue(trxRow, 3)),
				CustVendor: fmt.Sprintf("%v", getValue(trxRow, 4)),
				Debit:      toFloat(getValue(trxRow, 5)),
				Kredit:     toFloat(getValue(trxRow, 6)),
				Sumber:     usedSheet,
			}
			all = append(all, item)
		}
	}

	sort.Slice(all, func(i, j int) bool {
		ti := parseTanggal(all[i].Tanggal)
		tj := parseTanggal(all[j].Tanggal)
		if !ti.Equal(tj) {
			return ti.Before(tj)
		}

		return all[i].NoBukti < all[j].NoBukti
	})

	return all, nil
}

func LoadBukuSetelahJurnal(ctx context.Context, svc *sheets.Service, spreadsheetID string) ([]Transaksi, error) {
	resp, err := svc.Spreadsheets.Values.Get(spreadsheetID, rangeBukuSetelahJurnal).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("gagal membaca data %s: %w", rangeBukuSetelahJurnal, err)
	}

	out := make([]Transaksi, 0, len(resp.Values))
	for _, row := range resp.Values {
		item := Transaksi{
			NoBukti:    strings.TrimSpace(fmt.Sprintf("%v", getValue(row, 1))),
			Tanggal:    strings.TrimSpace(fmt.Sprintf("%v", getValue(row, 2))),
			CustVendor: strings.TrimSpace(fmt.Sprintf("%v", getValue(row, 3))),
			COA:        strings.TrimSpace(fmt.Sprintf("%v", getValue(row, 4))),
			Keterangan: strings.TrimSpace(fmt.Sprintf("%v", getValue(row, 5))),
			Debit:      toFloat(getValue(row, 6)),
			Kredit:     toFloat(getValue(row, 7)),
			Sumber:     "BUKU_SETELAH_JURNAL",
		}

		if item.NoBukti == "" && item.Debit == 0 && item.Kredit == 0 {
			continue
		}
		out = append(out, item)
	}

	sort.Slice(out, func(i, j int) bool {
		ti := parseTanggal(out[i].Tanggal)
		tj := parseTanggal(out[j].Tanggal)
		if !ti.Equal(tj) {
			return ti.Before(tj)
		}
		return out[i].NoBukti < out[j].NoBukti
	})

	return out, nil
}

func quoteSheetName(name string) string {
	escaped := strings.ReplaceAll(strings.TrimSpace(name), "'", "''")
	return "'" + escaped + "'"
}

func uniqueNonEmpty(values ...string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		v := strings.TrimSpace(value)
		if v == "" {
			continue
		}
		k := strings.ToLower(v)
		if _, exists := seen[k]; exists {
			continue
		}
		seen[k] = struct{}{}
		result = append(result, v)
	}
	return result
}
