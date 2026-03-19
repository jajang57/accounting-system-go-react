package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

// App struct
type App struct {
	ctx           context.Context
	server        *http.Server
	mu            sync.Mutex
	isRunning     bool
	spreadsheetID string
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		spreadsheetID: defaultSpreadsheetID,
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// StartServer starts the backend HTTP server
func (a *App) StartServer() string {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.isRunning {
		return "OK"
	}

	log.Println("Memuat layanan Google Sheets dari data tersemat (embedded)...")

	ctx := context.Background()
	// Use the embedded credentialData from main.go
	svc, err := sheets.NewService(ctx, option.WithCredentialsJSON(credentialData))
	if err != nil {
		log.Printf("Gagal inisialisasi: %v\n", err)
		return fmt.Sprintf("Error initializing Sheets: %v", err)
	}

	mux := http.NewServeMux()
	RegisterHandlers(mux, ctx, svc)

	a.server = &http.Server{
		Addr:    ":8080",
		Handler: mux,
	}

	errChan := make(chan error, 1)
	go func() {
		log.Println("Server starting on http://localhost:8080")
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("Server error: %v\n", err)
			errChan <- err
		}
	}()

	// Wait briefly to see if it fails immediately (e.g. port in use)
	select {
	case err := <-errChan:
		return fmt.Sprintf("Server failed to start: %v", err)
	case <-time.After(1 * time.Second):
		// Assume it started fine
		a.isRunning = true
		return "OK"
	}
}

// StopServer stops the backend HTTP server
func (a *App) StopServer() string {
	a.mu.Lock()
	defer a.mu.Unlock()

	if !a.isRunning || a.server == nil {
		return "Server tidak sedang berjalan"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := a.server.Shutdown(ctx); err != nil {
		return fmt.Sprintf("Gagal mematikan server: %v", err)
	}

	a.isRunning = false
	a.server = nil
	return "OK"
}

// GetStatus returns the current server status
func (a *App) GetStatus() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.isRunning
}
