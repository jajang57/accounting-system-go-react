package main

import (
	"sort"
	"strings"
	"time"
)

const (
	tipeDebit  = "DEBIT"
	tipeKredit = "KREDIT"
)

func GenerateBukuBesar(transaksi []Transaksi, coaList []COA) map[string][]BukuBesarRow {
	saldoAwalByAkun := make(map[string]float64, len(coaList))
	tipeByAkun := make(map[string]string, len(coaList))
	namaAsliByAkun := make(map[string]string, len(coaList))
	headingNRCByAkun := make(map[string]string, len(coaList))
	headingLRByAkun := make(map[string]string, len(coaList))

	for _, coa := range coaList {
		key := normalizeAkun(coa.KodeAkun)
		if key == "" {
			continue
		}

		saldoAwalByAkun[key] = coa.SaldoAwal
		tipeByAkun[key] = tipeAkunDariKode(coa.KodeAkun)
		namaAsliByAkun[key] = strings.TrimSpace(coa.NamaAkun)
		headingNRCByAkun[key] = strings.ToLower(strings.TrimSpace(coa.headingnrc))
		headingLRByAkun[key] = strings.ToLower(strings.TrimSpace(coa.headinglr))
	}

	grouped := make(map[string][]Transaksi)
	for _, trx := range transaksi {
		key := normalizeAkun(trx.COA)
		if key == "" {
			key = "__coa_kosong__"
			trx.COA = "COA KOSONG"
		}

		grouped[key] = append(grouped[key], trx)
		if _, exists := namaAsliByAkun[key]; !exists {
			namaAsliByAkun[key] = strings.TrimSpace(trx.COA)
		}
		if _, exists := tipeByAkun[key]; !exists {
			tipeByAkun[key] = tipeKredit
		}
	}

	result := make(map[string][]BukuBesarRow, len(grouped))
	for key, rows := range grouped {
		println("\n=== DEBUG: Proses COA ===")
		println("Key:", key)
		println("SaldoAwal:", saldoAwalByAkun[key])
		println("HeadingNRC:", headingNRCByAkun[key], "| HeadingLR:", headingLRByAkun[key])
		sort.Slice(rows, func(i, j int) bool {
			ti := parseTanggal(rows[i].Tanggal)
			tj := parseTanggal(rows[j].Tanggal)
			if !ti.Equal(tj) {
				return ti.Before(tj)
			}
			return rows[i].NoBukti < rows[j].NoBukti
		})

		saldo := saldoAwalByAkun[key]
		// tipe := tipeByAkun[key] // tidak dipakai lagi
		akun := namaAsliByAkun[key]
		headingnrc := headingNRCByAkun[key]
		headinglr := headingLRByAkun[key]

		ledgerRows := make([]BukuBesarRow, 0, len(rows))
		for _, trx := range rows {
			// DEBUG: Print transaksi sebelum proses saldo
			//println("Transaksi:", trx.Tanggal, trx.NoBukti, trx.Keterangan, "Debit:", trx.Debit, "Kredit:", trx.Kredit)
			//saldoSebelum := saldo
			if headingnrc == "pasiva" {
				saldo += trx.Kredit - trx.Debit
				//println("[PASIVA] saldo =", saldoSebelum, "+", trx.Kredit, "-", trx.Debit, "=", saldo)
			} else if headinglr == "pendapatan" {
				saldo += trx.Kredit - trx.Debit
				//println("[PENDAPATAN] saldo =", saldoSebelum, "+", trx.Kredit, "-", trx.Debit, "=", saldo)
			} else {
				saldo += trx.Debit - trx.Kredit
				//println("[LAIN] saldo =", saldoSebelum, "+", trx.Debit, "-", trx.Kredit, "=", saldo)
			}
			ledgerRows = append(ledgerRows, BukuBesarRow{
				COA:        akun,
				Tanggal:    trx.Tanggal,
				NoBukti:    trx.NoBukti,
				Keterangan: trx.Keterangan,
				Debit:      trx.Debit,
				Kredit:     trx.Kredit,
				Saldo:      saldo,
			})
		}

		result[akun] = ledgerRows
	}

	return result
}

func normalizeAkun(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func hitungSaldo(saldo, debit, kredit float64, tipe string) float64 {
	if strings.EqualFold(tipe, tipeDebit) {
		return saldo + debit - kredit
	}

	return saldo - debit + kredit
}

func tipeAkunDariKode(kode string) string {
	clean := strings.TrimSpace(kode)
	if strings.HasPrefix(clean, "1.") || strings.HasPrefix(clean, "5.") {
		return tipeDebit
	}

	return tipeKredit
}

func parseTanggal(raw string) time.Time {
	value := strings.TrimSpace(raw)
	if value == "" {
		return time.Time{}
	}

	layouts := []string{
		"2006-01-02",
		"02/01/2006",
		"2/1/2006",
		"02/01/06",
		"2/1/06",
		"02-01-2006",
		"2-1-2006",
		"02-01-06",
		"2-1-06",
		"02 Jan 2006",
		"2 Jan 2006",
	}

	for _, layout := range layouts {
		if t, err := time.Parse(layout, value); err == nil {
			return t
		}
	}

	return time.Time{}
}
