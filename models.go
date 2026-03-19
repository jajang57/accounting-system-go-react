package main

type Transaksi struct {
	Tanggal    string
	NoBukti    string
	COA        string
	Keterangan string
	CustVendor string
	Debit      float64
	Kredit     float64
	Sumber     string
}

type COA struct {
	KodeAkun   string
	NamaAkun   string
	SaldoAwal  float64
	HeaderLR   string
	HeaderNRC  string
	headingnrc string
	headinglr  string
}

type BukuBesarRow struct {
	COA        string
	Tanggal    string
	NoBukti    string
	Keterangan string
	CustVendor string
	Debit      float64
	Kredit     float64
	Saldo      float64
}
