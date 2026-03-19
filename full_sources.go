package main

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"google.golang.org/api/sheets/v4"
)

type orderedTransaksi struct {
	Urut int
	Item Transaksi
}

var bankAliasPattern = regexp.MustCompile(`(?i)^bank\d{3}$`)

func LoadAllTransaksiFull(ctx context.Context, svc *sheets.Service, spreadsheetID string) ([]Transaksi, error) {
	merged := make([]orderedTransaksi, 0)

	bankRows, err := LoadBankGabunganTransaksi(ctx, svc, spreadsheetID)
	if err != nil {
		return nil, fmt.Errorf("gagal load transaksi bank gabungan: %w", err)
	}
	merged = append(merged, bankRows...)

	jurnalRows, err := LoadJurnalInvTransaksi(ctx, svc, spreadsheetID)
	if err != nil {
		return nil, fmt.Errorf("gagal load jurnal inv: %w", err)
	}
	merged = append(merged, jurnalRows...)

	backtestRows, err := LoadBacktestTransaksi(ctx, svc, spreadsheetID)
	if err != nil {
		return nil, fmt.Errorf("gagal load backtest: %w", err)
	}
	merged = append(merged, backtestRows...)

	sort.Slice(merged, func(i, j int) bool {
		ti := parseTanggal(merged[i].Item.Tanggal)
		tj := parseTanggal(merged[j].Item.Tanggal)
		if !ti.Equal(tj) {
			return ti.Before(tj)
		}
		if merged[i].Urut != merged[j].Urut {
			return merged[i].Urut < merged[j].Urut
		}
		return merged[i].Item.NoBukti < merged[j].Item.NoBukti
	})

	out := make([]Transaksi, 0, len(merged))
	for _, row := range merged {
		out = append(out, row.Item)
	}
	return out, nil
}

func LoadBankGabunganTransaksi(ctx context.Context, svc *sheets.Service, spreadsheetID string) ([]orderedTransaksi, error) {
	masterRange := "master_coa!B2:C"
	masterResp, err := svc.Spreadsheets.Values.Get(spreadsheetID, masterRange).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("gagal membaca data alias dari %s: %w", masterRange, err)
	}

	out := make([]orderedTransaksi, 0)
	aliasOrder := make(map[string]int)
	nextOrder := 1

	for _, row := range masterResp.Values {
		alias := strings.TrimSpace(fmt.Sprintf("%v", getValue(row, 1)))
		if alias == "" {
			continue
		}
		if !bankAliasPattern.MatchString(alias) {
			continue
		}

		readRange := fmt.Sprintf("%s!B4:H", quoteSheetName(alias))
		resp, err := svc.Spreadsheets.Values.Get(spreadsheetID, readRange).Context(ctx).Do()
		if err != nil {
			return nil, fmt.Errorf("gagal membaca transaksi bank sheet %q (%s): %w", alias, readRange, err)
		}

		orderKey := strings.ToLower(alias)
		if _, exists := aliasOrder[orderKey]; !exists {
			aliasOrder[orderKey] = nextOrder
			nextOrder++
		}

		for _, trxRow := range resp.Values {
			noBukti := strings.TrimSpace(fmt.Sprintf("%v", getValue(trxRow, 0)))
			if strings.Contains(strings.ToLower(noBukti), "nobukti") {
				continue
			}

			keterangan := strings.TrimSpace(fmt.Sprintf("%v", getValue(trxRow, 3)))
			if keterangan == "" {
				continue
			}

			dr := getValue(trxRow, 5)
			cr := getValue(trxRow, 6)

			var debit float64
			var kredit float64
			if isKosong(dr) {
				debit = toFloat(cr)
			}
			if isKosong(cr) {
				kredit = toFloat(dr)
			}

			item := Transaksi{
				NoBukti:    noBukti,
				Tanggal:    strings.TrimSpace(fmt.Sprintf("%v", getValue(trxRow, 1))),
				CustVendor: strings.TrimSpace(fmt.Sprintf("%v", getValue(trxRow, 4))),
				COA:        strings.TrimSpace(fmt.Sprintf("%v", getValue(trxRow, 2))), // Ikuti script: COA dari kolom transaksi
				Keterangan: keterangan,
				Debit:      debit,
				Kredit:     kredit,
				Sumber:     alias,
			}

			out = append(out, orderedTransaksi{
				Urut: aliasOrder[orderKey],
				Item: item,
			})
		}
	}

	return out, nil
}

func isKosong(v interface{}) bool {
	s := strings.TrimSpace(fmt.Sprintf("%v", v))
	return s == "" || s == "0" || s == "0.0" || s == "<nil>"
}

func LoadBacktestTransaksi(ctx context.Context, svc *sheets.Service, spreadsheetID string) ([]orderedTransaksi, error) {
	masterRange := "master_coa!B2:C"
	masterResp, err := svc.Spreadsheets.Values.Get(spreadsheetID, masterRange).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("gagal membaca data alias dari %s: %w", masterRange, err)
	}

	out := make([]orderedTransaksi, 0)
	aliasOrder := make(map[string]int)
	nextOrder := 26

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
			return nil, fmt.Errorf("gagal membaca sheet backtest akun %q (alias %q): %w", namaAkun, alias, lastErr)
		}

		orderKey := strings.ToLower(strings.TrimSpace(usedSheet))
		if _, exists := aliasOrder[orderKey]; !exists {
			aliasOrder[orderKey] = nextOrder
			nextOrder++
		}

		for _, trxRow := range resp.Values {
			noBukti := strings.TrimSpace(fmt.Sprintf("%v", getValue(trxRow, 0)))
			if strings.Contains(strings.ToLower(noBukti), "nobukti") {
				continue
			}

			debit := toFloat(getValue(trxRow, 5))
			kredit := toFloat(getValue(trxRow, 6))
			if debit == 0 && kredit == 0 {
				continue
			}

			item := Transaksi{
				NoBukti:    noBukti,
				Tanggal:    strings.TrimSpace(fmt.Sprintf("%v", getValue(trxRow, 1))),
				CustVendor: strings.TrimSpace(fmt.Sprintf("%v", getValue(trxRow, 4))),
				COA:        namaAkun,
				Keterangan: strings.TrimSpace(fmt.Sprintf("%v", getValue(trxRow, 3))),
				Debit:      debit,
				Kredit:     kredit,
				Sumber:     "BACKTEST_" + usedSheet,
			}

			out = append(out, orderedTransaksi{
				Urut: aliasOrder[orderKey],
				Item: item,
			})
		}
	}

	return out, nil
}

func LoadJurnalInvTransaksi(ctx context.Context, svc *sheets.Service, spreadsheetID string) ([]orderedTransaksi, error) {
	pembelian, err := loadTableWithHeader(ctx, svc, spreadsheetID, "PEMBELIAN!B4:U")
	if err != nil {
		return nil, err
	}
	penjualan, err := loadTableWithHeader(ctx, svc, spreadsheetID, "PENJUALAN!B4:U")
	if err != nil {
		return nil, err
	}
	masterCOA, err := loadTableWithHeader(ctx, svc, spreadsheetID, "master_coa!B1:P")
	if err != nil {
		return nil, err
	}
	aje, err := loadTableWithHeader(ctx, svc, spreadsheetID, "AJE!B3:H")
	if err != nil {
		return nil, err
	}

	masterByCOA := make(map[string]tableRow)
	pajakMasukanRows := make([]tableRow, 0)
	pajakKeluaranRows := make([]tableRow, 0)
	for _, row := range masterCOA {
		coaKey := normalizeHeaderKey(row.Get("coa"))
		if coaKey != "" {
			masterByCOA[coaKey] = row
		}
		if strings.EqualFold(strings.TrimSpace(row.Get("pajakmasukan")), "yes") {
			pajakMasukanRows = append(pajakMasukanRows, row)
		}
		if strings.EqualFold(strings.TrimSpace(row.Get("pajakkeluaran")), "yes") {
			pajakKeluaranRows = append(pajakKeluaranRows, row)
		}
	}

	result := make([]orderedTransaksi, 0)
	add := func(urut int, noBukti, tanggal, customer, coa, ket string, debit, kredit float64) {
		if strings.TrimSpace(noBukti) == "" {
			return
		}
		result = append(result, orderedTransaksi{
			Urut: urut,
			Item: Transaksi{
				NoBukti:    strings.TrimSpace(noBukti),
				Tanggal:    strings.TrimSpace(tanggal),
				CustVendor: strings.TrimSpace(customer),
				COA:        strings.TrimSpace(coa),
				Keterangan: strings.TrimSpace(ket),
				Debit:      debit,
				Kredit:     kredit,
				Sumber:     "JURNALINV",
			},
		})
	}

	for _, row := range pembelian {
		noBukti := row.Get("nobukti")
		tanggal := row.Get("tanggal")
		vendor := row.GetAny("vendor", "customer")
		coa := row.Get("coa")
		ket := row.Get("ket")
		dpp := toFloat(row.Get("dpp"))
		ppn := toFloat(row.Get("ppn"))
		subtot := toFloat(row.GetAny("subtot", "subtotal"))
		coapph := row.Get("coapph")
		pph := toFloat(row.Get("pph"))

		add(14, noBukti, tanggal, vendor, coa, ket, dpp, 0)
		for _, m := range pajakMasukanRows {
			add(15, noBukti, tanggal, vendor, m.Get("coa"), ket, ppn, 0)
		}
		if m, ok := masterByCOA[normalizeHeaderKey(coa)]; ok {
			add(16, noBukti, tanggal, vendor, m.Get("kelompokpembelian"), ket, 0, subtot)
		}
		add(23, noBukti, tanggal, vendor, coapph, ket, 0, pph)
	}

	for _, row := range penjualan {
		noBukti := row.Get("nobukti")
		tanggal := row.Get("tanggal")
		customer := row.GetAny("customer", "vendor")
		coa := row.Get("coa")
		ket := row.Get("ket")
		subtot := toFloat(row.GetAny("subtot", "subtotal"))
		ppn := toFloat(row.Get("ppn"))
		dpp := toFloat(row.Get("dpp"))
		coapph := row.Get("coapph")
		pph := toFloat(row.Get("pph"))
		coahpp := row.Get("coahpp")
		coapersediaan := row.Get("coapersediaan")
		hpp := toFloat(row.Get("hpp"))

		if m, ok := masterByCOA[normalizeHeaderKey(coa)]; ok {
			add(17, noBukti, tanggal, customer, m.Get("kelompokpenjualan"), ket, subtot, 0)
		}
		for _, m := range pajakKeluaranRows {
			add(18, noBukti, tanggal, customer, m.Get("coa"), ket, 0, ppn)
		}
		add(19, noBukti, tanggal, customer, coa, ket, 0, dpp)
		add(22, noBukti, tanggal, customer, coapph, ket, pph, 0)
		add(24, noBukti, tanggal, customer, coahpp, ket, hpp, 0)
		add(25, noBukti, tanggal, customer, coapersediaan, ket, 0, hpp)
	}

	for _, row := range aje {
		noBukti := row.Get("nobukti")
		tanggal := row.Get("tanggal")
		ket := row.Get("ket")
		coad := row.Get("coad")
		coak := row.Get("coak")
		debit := toFloat(row.Get("debit"))
		kredit := toFloat(row.Get("kredit"))

		add(20, noBukti, tanggal, "", coad, ket, debit, 0)
		add(21, noBukti, tanggal, "", coak, ket, 0, kredit)
	}

	return result, nil
}

type tableRow map[string]string

func (r tableRow) Get(key string) string {
	return strings.TrimSpace(r[normalizeHeaderKey(key)])
}

func (r tableRow) GetAny(keys ...string) string {
	for _, key := range keys {
		if value := r.Get(key); value != "" {
			return value
		}
	}
	return ""
}

func loadTableWithHeader(ctx context.Context, svc *sheets.Service, spreadsheetID, readRange string) ([]tableRow, error) {
	resp, err := svc.Spreadsheets.Values.Get(spreadsheetID, readRange).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("gagal membaca range %s: %w", readRange, err)
	}
	if len(resp.Values) == 0 {
		return []tableRow{}, nil
	}

	header := resp.Values[0]
	out := make([]tableRow, 0, len(resp.Values)-1)
	for _, rawRow := range resp.Values[1:] {
		row := make(tableRow, len(header))
		for i, h := range header {
			key := normalizeHeaderKey(fmt.Sprintf("%v", h))
			if key == "" {
				continue
			}
			row[key] = strings.TrimSpace(fmt.Sprintf("%v", getValue(rawRow, i)))
		}
		out = append(out, row)
	}
	return out, nil
}

func normalizeHeaderKey(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return ""
	}

	var b strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}
