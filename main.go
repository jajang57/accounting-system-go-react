package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/api/sheets/v4"
)

//go:embed all:launcher-ui/dist
var assets embed.FS

//go:embed all:frontend/dist
var mainAssets embed.FS

//go:embed credential.json
var credentialData []byte

const (
	defaultSpreadsheetID = "1ALS7m3wpPhJsX2CXGiCid_AJOv0zX6vD49OYiOIcZ90"
	usersSheetTitle      = "users"
	defaultAdminPassword = "admin123"
)

func RegisterHandlers(mux *http.ServeMux, ctx context.Context, svc *sheets.Service) {
	mux.HandleFunc("/bukubesar", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		spreadsheetID := getSpreadsheetIDFromRequest(r)
		bukuBesar, err := loadBukuBesarBySource(ctx, svc, spreadsheetID, r.URL.Query().Get("source"))
		if err != nil {
			log.Println("gagal generate buku besar:", err)
			http.Error(w, "gagal memuat buku besar", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(bukuBesar); err != nil {
			log.Println("gagal encode response:", err)
			http.Error(w, "gagal encode json", http.StatusInternalServerError)
			return
		}
	})

	mux.HandleFunc("/compare", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		sourceA := r.URL.Query().Get("sourceA")
		if sourceA == "" {
			sourceA = "full"
		}
		sourceB := r.URL.Query().Get("sourceB")
		if sourceB == "" {
			sourceB = "alias"
		}

		spreadsheetID := getSpreadsheetIDFromRequest(r)
		dataA, err := loadBukuBesarBySource(ctx, svc, spreadsheetID, sourceA)
		if err != nil {
			log.Println("gagal load sourceA:", err)
			http.Error(w, "gagal memuat sourceA", http.StatusInternalServerError)
			return
		}
		dataB, err := loadBukuBesarBySource(ctx, svc, spreadsheetID, sourceB)
		if err != nil {
			log.Println("gagal load sourceB:", err)
			http.Error(w, "gagal memuat sourceB", http.StatusInternalServerError)
			return
		}

		summary := compareBukuBesar(
			sourceA,
			flattenBukuBesar(dataA),
			sourceB,
			flattenBukuBesar(dataB),
		)

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(summary); err != nil {
			log.Println("gagal encode compare:", err)
			http.Error(w, "gagal encode compare", http.StatusInternalServerError)
			return
		}
	})

	mux.HandleFunc("/sheets", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		spreadsheetID := getSpreadsheetIDFromRequest(r)
		meta, err := svc.Spreadsheets.Get(spreadsheetID).
			Fields("sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))").
			Context(ctx).
			Do()
		if err != nil {
			log.Println("gagal load sheets metadata:", err)
			http.Error(w, "gagal memuat daftar sheet", http.StatusInternalServerError)
			return
		}

		type sheetInfo struct {
			SheetID  int64  `json:"sheetId"`
			Title    string `json:"title"`
			Index    int64  `json:"index"`
			RowCount int64  `json:"rowCount"`
			ColCount int64  `json:"colCount"`
		}

		list := make([]sheetInfo, 0, len(meta.Sheets))
		for _, s := range meta.Sheets {
			if s == nil || s.Properties == nil {
				continue
			}
			list = append(list, sheetInfo{
				SheetID:  s.Properties.SheetId,
				Title:    s.Properties.Title,
				Index:    s.Properties.Index,
				RowCount: s.Properties.GridProperties.RowCount,
				ColCount: s.Properties.GridProperties.ColumnCount,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(list); err != nil {
			log.Println("gagal encode sheets:", err)
			http.Error(w, "gagal encode sheets", http.StatusInternalServerError)
			return
		}
	})

	mux.HandleFunc("/sheet/preview", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		spreadsheetID := getSpreadsheetIDFromRequest(r)
		sheet := strings.TrimSpace(r.URL.Query().Get("sheet"))
		if sheet == "" {
			http.Error(w, "sheet is required", http.StatusBadRequest)
			return
		}

		rangePart := strings.TrimSpace(r.URL.Query().Get("range"))
		if rangePart == "" {
			rangePart = "A4:M"
		}
		startRow := getRangeStartRow(rangePart)
		readRange := fmt.Sprintf("%s!%s", quoteSheetName(sheet), rangePart)

		resp, err := svc.Spreadsheets.Values.Get(spreadsheetID, readRange).Context(ctx).Do()
		if err != nil {
			log.Println("gagal load preview sheet:", err)
			http.Error(w, "gagal memuat preview sheet", http.StatusInternalServerError)
			return
		}

		headerRange := fmt.Sprintf("%s!A1:M3", quoteSheetName(sheet))
		headerResp, err := svc.Spreadsheets.Values.Get(spreadsheetID, headerRange).Context(ctx).Do()
		if err != nil {
			log.Println("gagal load header sheet preview:", err)
			http.Error(w, "gagal memuat header sheet", http.StatusInternalServerError)
			return
		}

		companyName := getCellValue(headerResp.Values, 0, 0) // A1
		tableName := getCellValue(headerResp.Values, 1, 0)   // A2

		rows := make([][]string, 0, len(resp.Values))
		rowNumbers := make([]int, 0, len(resp.Values))
		for _, row := range resp.Values {
			rw := make([]string, len(row))
			for i, v := range row {
				rw[i] = fmt.Sprintf("%v", v)
			}
			rows = append(rows, rw)
			rowNumbers = append(rowNumbers, startRow+len(rowNumbers))
		}

		out := map[string]interface{}{
			"sheet":       sheet,
			"range":       rangePart,
			"companyName": companyName,
			"tableName":   tableName,
			"startRow":    startRow,
			"rowNumbers":  rowNumbers,
			"rows":        rows,
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(out); err != nil {
			log.Println("gagal encode preview sheet:", err)
			http.Error(w, "gagal encode preview sheet", http.StatusInternalServerError)
			return
		}
	})

	mux.HandleFunc("/auth/login", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		type loginRequest struct {
			SpreadsheetID string `json:"spreadsheetId"`
			Username      string `json:"username"`
			Password      string `json:"password"`
		}

		var req loginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "request body tidak valid", http.StatusBadRequest)
			return
		}

		spreadsheetID := strings.TrimSpace(req.SpreadsheetID)
		if spreadsheetID == "" {
			spreadsheetID = getSpreadsheetIDFromRequest(r)
		}

		if strings.TrimSpace(req.Username) == "" || strings.TrimSpace(req.Password) == "" {
			http.Error(w, "username dan password wajib diisi", http.StatusBadRequest)
			return
		}

		if err := ensureUsersSheet(r.Context(), svc, spreadsheetID); err != nil {
			log.Println("gagal memastikan sheet users:", err)
			http.Error(w, "gagal memproses pengguna", http.StatusInternalServerError)
			return
		}

		if err := ensureDefaultAdmin(r.Context(), svc, spreadsheetID); err != nil {
			log.Println("gagal memastikan admin default:", err)
			http.Error(w, "gagal memproses pengguna", http.StatusInternalServerError)
			return
		}

		users, err := loadUsers(r.Context(), svc, spreadsheetID)
		if err != nil {
			log.Println("gagal memuat pengguna:", err)
			http.Error(w, "gagal memuat pengguna", http.StatusInternalServerError)
			return
		}

		var matched *UserRecord
		for _, u := range users {
			if strings.EqualFold(u.Username, req.Username) {
				matched = &u
				break
			}
		}
		if matched == nil || !comparePassword(matched.PasswordHash, req.Password) {
			http.Error(w, "username atau password salah", http.StatusUnauthorized)
			return
		}

		resp := loginResponse{
			Username:     matched.Username,
			FullName:     matched.FullName,
			Role:         matched.Role,
			AllowedMenus: matched.AllowedMenus,
			AllowedBanks: matched.AllowedBanks,
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			log.Println("gagal encode login response:", err)
		}
	})

	mux.HandleFunc("/auth/users", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		if r.Method == http.MethodGet {
			spreadsheetID := getSpreadsheetIDFromRequest(r)

			if err := ensureUsersSheet(r.Context(), svc, spreadsheetID); err != nil {
				log.Println("gagal memastikan sheet users:", err)
				http.Error(w, "gagal memuat pengguna", http.StatusInternalServerError)
				return
			}
			if err := ensureDefaultAdmin(r.Context(), svc, spreadsheetID); err != nil {
				log.Println("gagal memastikan admin default:", err)
				http.Error(w, "gagal memuat pengguna", http.StatusInternalServerError)
				return
			}

			users, err := loadUsers(r.Context(), svc, spreadsheetID)
			if err != nil {
				log.Println("gagal memuat pengguna:", err)
				http.Error(w, "gagal memuat pengguna", http.StatusInternalServerError)
				return
			}

			type userPayload struct {
				Username     string   `json:"username"`
				FullName     string   `json:"fullName"`
				Role         string   `json:"role"`
				AllowedMenus []string `json:"allowedMenus"`
				AllowedBanks []string `json:"allowedBanks"`
				RowNumber    int      `json:"rowNumber"`
			}

			payload := make([]userPayload, 0, len(users))
			for _, u := range users {
				payload = append(payload, userPayload{
					Username:     u.Username,
					FullName:     u.FullName,
					Role:         u.Role,
					AllowedMenus: u.AllowedMenus,
					AllowedBanks: u.AllowedBanks,
					RowNumber:    u.RowNumber,
				})
			}

			w.Header().Set("Content-Type", "application/json")
			if err := json.NewEncoder(w).Encode(map[string]interface{}{
				"users": payload,
			}); err != nil {
				log.Println("gagal encode user list:", err)
			}
			return
		}

		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		type upsertRequest struct {
			SpreadsheetID string   `json:"spreadsheetId"`
			RowNumber     int      `json:"rowNumber"`
			Username      string   `json:"username"`
			FullName      string   `json:"fullName"`
			Password      string   `json:"password"`
			Role          string   `json:"role"`
			AllowedMenus  []string `json:"allowedMenus"`
			AllowedBanks  []string `json:"allowedBanks"`
		}

		var reqPayload upsertRequest
		if err := json.NewDecoder(r.Body).Decode(&reqPayload); err != nil {
			http.Error(w, "request body tidak valid", http.StatusBadRequest)
			return
		}

		spreadsheetID := strings.TrimSpace(reqPayload.SpreadsheetID)
		if spreadsheetID == "" {
			spreadsheetID = getSpreadsheetIDFromRequest(r)
		}

		if err := ensureUsersSheet(r.Context(), svc, spreadsheetID); err != nil {
			log.Println("gagal memastikan sheet users:", err)
			http.Error(w, "gagal memproses pengguna", http.StatusInternalServerError)
			return
		}

		users, err := loadUsers(r.Context(), svc, spreadsheetID)
		if err != nil {
			log.Println("gagal memuat pengguna:", err)
			http.Error(w, "gagal memproses pengguna", http.StatusInternalServerError)
			return
		}

		username := strings.TrimSpace(reqPayload.Username)
		if username == "" {
			http.Error(w, "username wajib diisi", http.StatusBadRequest)
			return
		}

		role := strings.ToLower(strings.TrimSpace(reqPayload.Role))
		if role != "administrator" {
			role = "user"
		}

		var passwordHash string
		if strings.TrimSpace(reqPayload.Password) != "" {
			passwordHash, err = hashPassword(reqPayload.Password)
			if err != nil {
				log.Println("gagal hash password:", err)
				http.Error(w, "gagal memproses password", http.StatusInternalServerError)
				return
			}
		} else if reqPayload.RowNumber > 0 {
			for _, u := range users {
				if u.RowNumber == reqPayload.RowNumber {
					passwordHash = u.PasswordHash
					break
				}
			}
			if passwordHash == "" {
				http.Error(w, "user tidak ditemukan", http.StatusBadRequest)
				return
			}
		}

		if passwordHash == "" {
			http.Error(w, "password wajib diisi untuk user baru", http.StatusBadRequest)
			return
		}

		values := []interface{}{
			username,
			strings.TrimSpace(reqPayload.FullName),
			passwordHash,
			role,
			joinList(reqPayload.AllowedMenus),
			joinList(reqPayload.AllowedBanks),
		}

		if reqPayload.RowNumber > 0 {
			targetRange := fmt.Sprintf("%s!A%d:F%d", quoteSheetName(usersSheetTitle), reqPayload.RowNumber, reqPayload.RowNumber)
			vr := &sheets.ValueRange{Range: targetRange, Values: [][]interface{}{values}}
			if _, err := svc.Spreadsheets.Values.Update(spreadsheetID, targetRange, vr).
				ValueInputOption("RAW").
				Context(r.Context()).
				Do(); err != nil {
				log.Println("gagal update user:", err)
				http.Error(w, "gagal menyimpan pengguna", http.StatusInternalServerError)
				return
			}
		} else {
			targetRange := fmt.Sprintf("%s!A2:F2", quoteSheetName(usersSheetTitle))
			vr := &sheets.ValueRange{Values: [][]interface{}{values}}
			if _, err := svc.Spreadsheets.Values.Append(spreadsheetID, targetRange, vr).
				ValueInputOption("RAW").
				InsertDataOption("INSERT_ROWS").
				Context(r.Context()).
				Do(); err != nil {
				log.Println("gagal menambahkan user:", err)
				http.Error(w, "gagal menyimpan pengguna", http.StatusInternalServerError)
				return
			}
		}

		if err := ensureDefaultAdmin(r.Context(), svc, spreadsheetID); err != nil {
			log.Println("gagal memastikan admin default setelah simpan:", err)
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]bool{"ok": true}); err != nil {
			log.Println("gagal encode user save response:", err)
		}
	})

	mux.HandleFunc("/sheet/delete-rows", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		type deleteRequest struct {
			SpreadsheetID string `json:"spreadsheetId"`
			Sheet         string `json:"sheet"`
			RowNumbers    []int  `json:"rowNumbers"`
		}

		var req deleteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if len(req.RowNumbers) == 0 {
			http.Error(w, "rowNumbers required", http.StatusBadRequest)
			return
		}

		spreadsheetID := strings.TrimSpace(req.SpreadsheetID)
		if spreadsheetID == "" {
			spreadsheetID = getSpreadsheetIDFromRequest(r)
		}

		// Get Sheet ID from Name
		meta, err := svc.Spreadsheets.Get(spreadsheetID).Fields("sheets(properties(sheetId,title))").Do()
		if err != nil {
			http.Error(w, "gagal get sheet id", http.StatusInternalServerError)
			return
		}

		var sheetID int64 = -1
		for _, s := range meta.Sheets {
			if strings.EqualFold(s.Properties.Title, req.Sheet) {
				sheetID = s.Properties.SheetId
				break
			}
		}

		if sheetID == -1 {
			http.Error(w, "sheet not found", http.StatusNotFound)
			return
		}

		for i := 0; i < len(req.RowNumbers); i++ {
			for j := i + 1; j < len(req.RowNumbers); j++ {
				if req.RowNumbers[i] < req.RowNumbers[j] { // Descending
					req.RowNumbers[i], req.RowNumbers[j] = req.RowNumbers[j], req.RowNumbers[i]
				}
			}
		}

		var requests []*sheets.Request
		for _, rowNum := range req.RowNumbers {
			idx := int64(rowNum - 1)

			requests = append(requests, &sheets.Request{
				DeleteDimension: &sheets.DeleteDimensionRequest{
					Range: &sheets.DimensionRange{
						SheetId:    sheetID,
						Dimension:  "ROWS",
						StartIndex: idx,
						EndIndex:   idx + 1,
					},
				},
			})
		}

		_, err = svc.Spreadsheets.BatchUpdate(spreadsheetID, &sheets.BatchUpdateSpreadsheetRequest{
			Requests: requests,
		}).Context(ctx).Do()

		if err != nil {
			log.Println("gagal delete rows:", err)
			http.Error(w, "gagal delete rows", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
	})

	mux.HandleFunc("/sheet/filter", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		type filterRequest struct {
			SpreadsheetID string            `json:"spreadsheetId"`
			Sheet         string            `json:"sheet"`
			Filters       map[string]string `json:"filters"` // Index -> Value
		}

		var req filterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		spreadsheetID := strings.TrimSpace(req.SpreadsheetID)
		if spreadsheetID == "" {
			spreadsheetID = getSpreadsheetIDFromRequest(r)
		}

		readRange := fmt.Sprintf("%s!A4:Z", quoteSheetName(req.Sheet))
		resp, err := svc.Spreadsheets.Values.Get(spreadsheetID, readRange).Context(ctx).Do()
		if err != nil {
			log.Println("gagal load sheet for filter:", err)
			http.Error(w, "gagal load data", http.StatusInternalServerError)
			return
		}

		var filteredRows [][]string
		var rowNumbers []int

		getVal := func(row []interface{}, idx int) string {
			if idx < 0 || idx >= len(row) {
				return ""
			}
			return strings.TrimSpace(fmt.Sprintf("%v", row[idx]))
		}

		vals := resp.Values
		if len(vals) > 0 {
			headerLine := make([]string, len(vals[0]))
			for i, v := range vals[0] {
				headerLine[i] = fmt.Sprintf("%v", v)
			}
			filteredRows = append(filteredRows, headerLine)
			rowNumbers = append(rowNumbers, 4)

			for i := 1; i < len(vals); i++ {
				match := true
				row := vals[i]

				for colIdxStr, filterVal := range req.Filters {
					colIdx := -1
					fmt.Sscanf(colIdxStr, "%d", &colIdx)
					if colIdx == -1 {
						continue
					}

					cellVal := strings.ToLower(getVal(row, colIdx))
					query := strings.ToLower(filterVal)

					if !strings.Contains(cellVal, query) {
						match = false
						break
					}
				}

				if match {
					strRow := make([]string, len(row))
					for c, v := range row {
						strRow[c] = fmt.Sprintf("%v", v)
					}
					filteredRows = append(filteredRows, strRow)
					rowNumbers = append(rowNumbers, 4+i)
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"rows":       filteredRows,
			"rowNumbers": rowNumbers,
		})
	})

	mux.HandleFunc("/sheet/append-row", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		type appendRowRequest struct {
			SpreadsheetID string   `json:"spreadsheetId"`
			Sheet         string   `json:"sheet"`
			Values        []string `json:"values"`
		}

		var req appendRowRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.Sheet) == "" {
			http.Error(w, "sheet wajib diisi", http.StatusBadRequest)
			return
		}

		spreadsheetID := strings.TrimSpace(req.SpreadsheetID)
		if spreadsheetID == "" {
			spreadsheetID = getSpreadsheetIDFromRequest(r)
		}

		targetRange := fmt.Sprintf("%s!A:M", quoteSheetName(req.Sheet))

		writeValues := make([]interface{}, 13)
		for i := 0; i < len(writeValues); i++ {
			if i < len(req.Values) {
				writeValues[i] = req.Values[i]
			} else {
				writeValues[i] = ""
			}
		}

		vr := &sheets.ValueRange{
			Values: [][]interface{}{writeValues},
		}

		_, err := svc.Spreadsheets.Values.Append(spreadsheetID, targetRange, vr).
			ValueInputOption("USER_ENTERED").
			InsertDataOption("INSERT_ROWS").
			Context(ctx).
			Do()
		if err != nil {
			log.Println("gagal append row sheet:", err)
			http.Error(w, "gagal append row", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":    true,
			"sheet": req.Sheet,
		})
	})

	mux.HandleFunc("/sheet/update-row", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		type updateRowRequest struct {
			SpreadsheetID string   `json:"spreadsheetId"`
			Sheet         string   `json:"sheet"`
			RowNumber     int      `json:"rowNumber"`
			Values        []string `json:"values"`
		}

		var req updateRowRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.Sheet) == "" || req.RowNumber <= 0 {
			http.Error(w, "sheet dan rowNumber wajib diisi", http.StatusBadRequest)
			return
		}

		spreadsheetID := strings.TrimSpace(req.SpreadsheetID)
		if spreadsheetID == "" {
			spreadsheetID = getSpreadsheetIDFromRequest(r)
		}

		endCol := "M"
		if len(req.Values) > 0 {
			colIdx := len(req.Values) - 1
			if colIdx < 26 {
				endCol = string(rune('A' + colIdx))
			} else {
				first := (colIdx / 26) - 1
				second := colIdx % 26
				prefix := ""
				if first >= 0 {
					prefix = string(rune('A' + first))
				}
				endCol = prefix + string(rune('A'+second))
			}
		}

		targetRange := fmt.Sprintf("%s!A%d:%s%d", quoteSheetName(req.Sheet), req.RowNumber, endCol, req.RowNumber)
		writeValues := make([]interface{}, len(req.Values))
		for i, v := range req.Values {
			writeValues[i] = v
		}

		vr := &sheets.ValueRange{
			Range:  targetRange,
			Values: [][]interface{}{writeValues},
		}

		_, err := svc.Spreadsheets.Values.Update(spreadsheetID, targetRange, vr).
			ValueInputOption("USER_ENTERED").
			Context(ctx).
			Do()
		if err != nil {
			log.Println("gagal update row sheet:", err)
			http.Error(w, "gagal update row", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":        true,
			"sheet":     req.Sheet,
			"rowNumber": req.RowNumber,
			"range":     targetRange,
		})
	})

	mux.HandleFunc("/export/bukubesar.csv", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		source := r.URL.Query().Get("source")
		if source == "" {
			source = "full"
		}

		spreadsheetID := getSpreadsheetIDFromRequest(r)
		bukuBesar, err := loadBukuBesarBySource(ctx, svc, spreadsheetID, source)
		if err != nil {
			log.Println("gagal load buku besar export:", err)
			http.Error(w, "gagal memuat data export", http.StatusInternalServerError)
			return
		}
		rows := flattenBukuBesar(bukuBesar)

		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="bukubesar_`+source+`.csv"`)
		if err := writeBukuBesarCSV(w, rows); err != nil {
			log.Println("gagal menulis csv:", err)
			http.Error(w, "gagal membuat csv", http.StatusInternalServerError)
			return
		}
	})

	// Catch-all to serve the React SPA from embedded FS
	distFS, err := fs.Sub(mainAssets, "frontend/dist")
	if err != nil {
		log.Fatal("failed to create sub fs for frontend/dist:", err)
	}
	fileServer := http.FileServer(http.FS(distFS))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		// If it's a file that exists in the FS, serve it
		f, err := distFS.Open(strings.TrimPrefix(path, "/"))
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}
		// Otherwise, serve index.html for SPA routing
		indexFile, err := distFS.Open("index.html")
		if err != nil {
			http.Error(w, "index.html not found", http.StatusNotFound)
			return
		}
		defer indexFile.Close()
		http.ServeContent(w, r, "index.html", time.Now(), indexFile.(io.ReadSeeker))
	})

	mux.HandleFunc("/sheet/distinct", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		type distinctRequest struct {
			SpreadsheetID string   `json:"spreadsheetId"`
			Sheet         string   `json:"sheet"`
			Columns       []string `json:"columns"`
		}

		var req distinctRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		spreadsheetID := strings.TrimSpace(req.SpreadsheetID)
		if spreadsheetID == "" {
			spreadsheetID = getSpreadsheetIDFromRequest(r)
		}

		readRange := fmt.Sprintf("%s!A4:Z", quoteSheetName(req.Sheet))
		resp, err := svc.Spreadsheets.Values.Get(spreadsheetID, readRange).Context(ctx).Do()
		if err != nil {
			log.Println("gagal read distinct:", err)
			http.Error(w, "gagal read distinct", http.StatusInternalServerError)
			return
		}

		if len(resp.Values) == 0 {
			_ = json.NewEncoder(w).Encode(map[string][]string{})
			return
		}

		headerRow := resp.Values[0]
		dataRows := resp.Values[1:]

		findIdx := func(key string) int {
			normalize := func(s string) string {
				return strings.Map(func(r rune) rune {
					if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
						return r
					}
					return -1
				}, strings.ToUpper(s))
			}
			k := normalize(key)
			searchKeys := []string{k}

			if k == "CUSTOMER" {
				searchKeys = []string{"CUSTOMER", "PELANGGAN", "NAMACUSTOMER"}
			}
			if k == "ITEMBARANG" {
				searchKeys = []string{"ITEMBARANG", "NAMAITEM", "NAMABARANG", "DESKRIPSI", "ITEM"}
			}

			for i, h := range headerRow {
				hStr, ok := h.(string)
				if !ok {
					continue
				}
				normH := normalize(hStr)
				for _, sk := range searchKeys {
					if strings.Contains(normH, sk) {
						return i
					}
				}
			}
			return -1
		}

		results := make(map[string][]string)

		for _, col := range req.Columns {
			idx := findIdx(col)
			if idx == -1 {
				results[col] = []string{}
				continue
			}

			unique := make(map[string]bool)
			for _, row := range dataRows {
				if idx < len(row) {
					str, ok := row[idx].(string)
					if ok {
						trim := strings.TrimSpace(str)
						if trim != "" {
							unique[trim] = true
						}
					}
				}
			}

			var arr []string
			for k := range unique {
				arr = append(arr, k)
			}
			results[col] = arr
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(results)
	})
}

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "GL Workspace Launcher",
		Width:  400,
		Height: 300,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

type UserRecord struct {
	Username     string
	FullName     string
	PasswordHash string
	Role         string
	AllowedMenus []string
	AllowedBanks []string
	RowNumber    int
}

type loginResponse struct {
	Username     string   `json:"username"`
	FullName     string   `json:"fullName"`
	Role         string   `json:"role"`
	AllowedMenus []string `json:"allowedMenus"`
	AllowedBanks []string `json:"allowedBanks"`
}

func ensureUsersSheet(ctx context.Context, svc *sheets.Service, spreadsheetID string) error {
	meta, err := svc.Spreadsheets.Get(spreadsheetID).
		Fields("sheets(properties(sheetId,title))").
		Context(ctx).
		Do()
	if err != nil {
		return fmt.Errorf("gagal memuat metadata sheet: %w", err)
	}

	if findSheetByTitle(meta, usersSheetTitle) == nil {
		_, err := svc.Spreadsheets.BatchUpdate(spreadsheetID, &sheets.BatchUpdateSpreadsheetRequest{
			Requests: []*sheets.Request{
				{
					AddSheet: &sheets.AddSheetRequest{
						Properties: &sheets.SheetProperties{
							Title:          usersSheetTitle,
							GridProperties: &sheets.GridProperties{RowCount: 100, ColumnCount: 6},
						},
					},
				},
			},
		}).Context(ctx).Do()
		if err != nil {
			return fmt.Errorf("gagal membuat sheet %s: %w", usersSheetTitle, err)
		}
	}

	headerRange := fmt.Sprintf("%s!A1:F1", quoteSheetName(usersSheetTitle))
	headers := []interface{}{"Username", "FullName", "PasswordHash", "Role", "AllowedMenus", "AllowedBanks"}
	if _, err := svc.Spreadsheets.Values.Update(spreadsheetID, headerRange, &sheets.ValueRange{Values: [][]interface{}{headers}}).
		ValueInputOption("RAW").
		Context(ctx).
		Do(); err != nil {
		return fmt.Errorf("gagal menulis header sheet %s: %w", usersSheetTitle, err)
	}
	return nil
}

func ensureDefaultAdmin(ctx context.Context, svc *sheets.Service, spreadsheetID string) error {
	users, err := loadUsers(ctx, svc, spreadsheetID)
	if err != nil {
		return err
	}
	for _, u := range users {
		if strings.EqualFold(u.Role, "administrator") {
			return nil
		}
	}

	hashed, err := hashPassword(defaultAdminPassword)
	if err != nil {
		return err
	}

	values := []interface{}{
		"admin",
		"Administrator",
		hashed,
		"administrator",
		"",
		"",
	}
	targetRange := fmt.Sprintf("%s!A2:F2", quoteSheetName(usersSheetTitle))
	if _, err := svc.Spreadsheets.Values.Append(spreadsheetID, targetRange, &sheets.ValueRange{Values: [][]interface{}{values}}).
		ValueInputOption("RAW").
		InsertDataOption("INSERT_ROWS").
		Context(ctx).
		Do(); err != nil {
		return fmt.Errorf("gagal menambahkan admin default: %w", err)
	}

	log.Printf("menambahkan akun administrator default (admin/%s)", defaultAdminPassword)
	return nil
}

func loadUsers(ctx context.Context, svc *sheets.Service, spreadsheetID string) ([]UserRecord, error) {
	readRange := fmt.Sprintf("%s!A2:F", quoteSheetName(usersSheetTitle))
	resp, err := svc.Spreadsheets.Values.Get(spreadsheetID, readRange).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("gagal membaca pengguna: %w", err)
	}

	records := make([]UserRecord, 0, len(resp.Values))
	for idx, row := range resp.Values {
		username := strings.TrimSpace(fmt.Sprintf("%v", getValue(row, 0)))
		if username == "" {
			continue
		}
		record := UserRecord{
			Username:     username,
			FullName:     strings.TrimSpace(fmt.Sprintf("%v", getValue(row, 1))),
			PasswordHash: strings.TrimSpace(fmt.Sprintf("%v", getValue(row, 2))),
			Role:         normalizeRole(fmt.Sprintf("%v", getValue(row, 3))),
			AllowedMenus: parseCommaList(fmt.Sprintf("%v", getValue(row, 4)), true),
			AllowedBanks: parseCommaList(fmt.Sprintf("%v", getValue(row, 5)), false),
			RowNumber:    2 + idx,
		}
		records = append(records, record)
	}
	return records, nil
}

func findSheetByTitle(spread *sheets.Spreadsheet, title string) *sheets.Sheet {
	if spread == nil {
		return nil
	}
	for _, s := range spread.Sheets {
		if s == nil || s.Properties == nil {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(s.Properties.Title), title) {
			return s
		}
	}
	return nil
}

func parseCommaList(raw string, lowerOutput bool) []string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	seen := make(map[string]struct{}, 0)
	var result []string
	for _, part := range strings.Split(value, ",") {
		clean := strings.TrimSpace(part)
		if clean == "" {
			continue
		}
		norm := strings.ToLower(clean)
		if norm == "all" {
			return nil
		}
		if _, ok := seen[norm]; ok {
			continue
		}
		seen[norm] = struct{}{}
		if lowerOutput {
			result = append(result, norm)
		} else {
			result = append(result, clean)
		}
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

func joinList(list []string) string {
	if len(list) == 0 {
		return ""
	}
	seen := make(map[string]struct{}, 0)
	result := make([]string, 0, len(list))
	for _, item := range list {
		clean := strings.TrimSpace(item)
		if clean == "" {
			continue
		}
		norm := strings.ToLower(clean)
		if norm == "all" {
			continue
		}
		if _, ok := seen[norm]; ok {
			continue
		}
		seen[norm] = struct{}{}
		result = append(result, clean)
	}
	if len(result) == 0 {
		return ""
	}
	return strings.Join(result, ",")
}

func normalizeRole(raw string) string {
	role := strings.ToLower(strings.TrimSpace(raw))
	if role == "administrator" {
		return "administrator"
	}
	return "user"
}

func hashPassword(password string) (string, error) {
	if password == "" {
		return "", fmt.Errorf("password kosong")
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

func comparePassword(hashed, password string) bool {
	if hashed == "" || password == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hashed), []byte(password)) == nil
}

func getCellValue(rows [][]interface{}, rowIndex, colIndex int) string {
	if rowIndex < 0 || rowIndex >= len(rows) {
		return ""
	}
	row := rows[rowIndex]
	if colIndex < 0 || colIndex >= len(row) {
		return ""
	}
	return strings.TrimSpace(fmt.Sprintf("%v", row[colIndex]))
}

func loadBukuBesarBySource(ctx context.Context, svc *sheets.Service, spreadsheetID, source string) (map[string][]BukuBesarRow, error) {
	var (
		transaksi []Transaksi
		err       error
	)

	switch source {
	case "", "full":
		transaksi, err = LoadAllTransaksiFull(ctx, svc, spreadsheetID)
	case "alias":
		transaksi, err = LoadAllTransaksi(ctx, svc, spreadsheetID)
	case "kasbesar":
		transaksi, err = LoadKasBesar(ctx, svc, spreadsheetID)
	case "jurnal":
		var ordered []orderedTransaksi
		ordered, err = LoadJurnalInvTransaksi(ctx, svc, spreadsheetID)
		if err == nil {
			transaksi = orderedToTransaksi(ordered)
		}
	case "backtest":
		var ordered []orderedTransaksi
		ordered, err = LoadBacktestTransaksi(ctx, svc, spreadsheetID)
		if err == nil {
			transaksi = orderedToTransaksi(ordered)
		}
	case "script":
		transaksi, err = LoadBukuSetelahJurnal(ctx, svc, spreadsheetID)
	default:
		return nil, &sourceError{Source: source}
	}
	if err != nil {
		return nil, err
	}

	masterCOA, err := LoadMasterCOA(ctx, svc, spreadsheetID)
	if err != nil {
		return nil, err
	}

	return GenerateBukuBesar(transaksi, masterCOA), nil
}

type sourceError struct {
	Source string
}

func (e *sourceError) Error() string {
	return "source tidak dikenal: " + e.Source + " (gunakan full, alias, kasbesar, jurnal, backtest, atau script)"
}

func orderedToTransaksi(rows []orderedTransaksi) []Transaksi {
	out := make([]Transaksi, 0, len(rows))
	for _, row := range rows {
		out = append(out, row.Item)
	}
	return out
}

func getSpreadsheetIDFromRequest(r *http.Request) string {
	id := strings.TrimSpace(r.URL.Query().Get("spreadsheetId"))
	if id == "" {
		return defaultSpreadsheetID
	}
	return id
}

func getRangeStartRow(rangePart string) int {
	s := strings.TrimSpace(rangePart)
	if s == "" {
		return 1
	}
	parts := strings.Split(s, ":")
	left := parts[0]
	start := ""
	for _, ch := range left {
		if ch >= '0' && ch <= '9' {
			start += string(ch)
		}
	}
	if start == "" {
		return 1
	}
	var row int
	_, err := fmt.Sscanf(start, "%d", &row)
	if err != nil || row <= 0 {
		return 1
	}
	return row
}
