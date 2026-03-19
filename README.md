# Spreadsheet-Based Accounting System

Desktop accounting application built with `Golang`, `React`, `Wails`, and `Google Sheets` as the operational data layer.

This project was designed to turn spreadsheet-based financial operations into a structured accounting workflow: starting from bank transaction data, mapping transactions into `Chart of Accounts (COA)`, then producing accounting outputs such as `General Ledger`, `comparison validation`, and `financial reports`.

## Project Summary

This application demonstrates how a lightweight accounting system can be built without a conventional database-heavy ERP setup. Instead, it uses Google Sheets as the source of truth for operational data, while Golang handles backend processing and React provides the user interface.

The result is a practical accounting tool suitable for internal operations, prototyping, or low-infrastructure environments.

## Business Flow

1. Import or prepare bank transaction data in spreadsheet tables
2. Map transactions into the correct COA
3. Process transaction sources into ledger-ready accounting data
4. Compare multiple sources to validate consistency
5. Generate outputs for:
   - General Ledger
   - Buku Besar per akun
   - Laba Rugi
   - Neraca

## Core Features

- Google Sheets integration as the main data layer
- General Ledger viewer with filtering and export
- Source comparison between multiple accounting pipelines
- Bank table management for transaction review and editing
- Master COA management
- Company profile and spreadsheet configuration management
- Financial report generation:
  - Buku Besar
  - Laba Rugi
  - Neraca
- Multi-profile spreadsheet support
- Simple authentication and access control per spreadsheet/user
- Desktop packaging with Wails

## What This Project Demonstrates

This project is suitable for portfolio review because it shows capability in:

- translating accounting/business processes into software
- building a full-stack desktop application with modern tooling
- integrating cloud spreadsheet services into business software
- handling financial data transformation and validation logic
- designing internal tools with practical business value

## Screenshots

### Selected UI Screens

<p align="center">
  <img width="900" alt="Dashboard / accounting workspace" src="https://github.com/user-attachments/assets/419cc01a-5c00-4db0-8e93-d99372f1ad3e" />
</p>

<p align="center">
  <img width="900" alt="Company settings page" src="https://github.com/user-attachments/assets/a0b7202d-ab23-4b6b-ad2b-36722d77ccf8" />
</p>

<p align="center">
  <img width="900" alt="Bank tables and transaction sheet management" src="https://github.com/user-attachments/assets/7fe35fa5-d328-4ecc-b421-28dd43c46d17" />
</p>

<p align="center">
  <img width="900" alt="General ledger and accounting table view" src="https://github.com/user-attachments/assets/23ffad9d-a9d2-4ef7-9f41-8b24a3c3f3fb" />
</p>

<p align="center">
  <img width="900" alt="Report and financial statement view" src="https://github.com/user-attachments/assets/3b5600e1-c614-4b3a-9341-53cd9913ffc7" />
</p>

<details>
  <summary>More screenshots</summary>

  <p align="center">
    <img width="900" alt="Additional screen 1" src="https://github.com/user-attachments/assets/3ccbfccf-65b1-439b-8de6-f13480fa455c" />
  </p>

  <p align="center">
    <img width="900" alt="Additional screen 2" src="https://github.com/user-attachments/assets/3b6fded9-5460-49b3-ac6a-2ed22514e085" />
  </p>

  <p align="center">
    <img width="900" alt="Additional screen 3" src="https://github.com/user-attachments/assets/0fb8fb1d-d6f6-4f86-b33d-ca7d6234a0b4" />
  </p>

  <p align="center">
    <img width="900" alt="Additional screen 4" src="https://github.com/user-attachments/assets/d03c12cd-0db4-4347-9bd1-b8f92f056640" />
  </p>

  <p align="center">
    <img width="900" alt="Additional screen 5" src="https://github.com/user-attachments/assets/5d6f80ef-3ce7-493f-8aaa-6e90fee260c6" />
  </p>

  <p align="center">
    <img width="900" alt="Additional screen 6" src="https://github.com/user-attachments/assets/609a3844-2f24-44b8-9105-4a5dadf2b3a9" />
  </p>

  <p align="center">
    <img width="900" alt="Additional screen 7" src="https://github.com/user-attachments/assets/9c75ab68-f5d1-4047-9bb7-84d76382c3ed" />
  </p>
</details>

## Tech Stack

### Backend

- `Go 1.24`
- `Google Sheets API`
- `bcrypt` for password hashing
- custom accounting processing logic in Go

### Frontend

- `React 19`
- `Vite`
- `SWR`
- `Lucide React`
- `Tailwind CSS`

### Desktop Layer

- `Wails v2`

## Architecture Notes

- `Google Sheets` is used as the main operational datastore
- `Go` handles:
  - sheet loading
  - transaction normalization
  - ledger generation
  - comparison logic
  - simple auth/user management
- `React` handles:
  - dashboard and navigation
  - table-based data exploration
  - company settings management
  - reports and print views
- `Wails` wraps the app into a desktop executable

## Project Structure

```text
project25-go/
├── frontend/          # Main React application
├── launcher-ui/       # Wails launcher UI
├── main.go            # Main backend HTTP handlers and app wiring
├── loaders.go         # Spreadsheet loaders
├── full_sources.go    # Source loading and normalization
├── buku_besar.go      # Ledger generation logic
├── compare.go         # Source comparison logic
├── app.go             # Wails app lifecycle / launcher control
├── wails.json         # Wails configuration
└── go.mod             # Go dependencies
```

## Local Development

### Prerequisites

- `Go`
- `Node.js` and `npm`
- `Wails CLI`
- Google Sheets API credentials available in the expected configuration

### Install frontend dependencies

```bash
cd frontend
npm install
```

### Run frontend only

```bash
cd frontend
npm run dev
```

### Run desktop app in development mode

From project root:

```bash
wails dev
```

## Build

To build the desktop executable:

```bash
wails build
```

## Portfolio Positioning

This project is a good representation of:

- accounting software development
- internal business tools engineering
- spreadsheet-driven data systems
- desktop application delivery using Go and React

It is especially relevant for roles such as:

- Software Engineer
- Full-Stack Developer
- Golang Developer
- React Developer
- ERP / Accounting System Developer

## Notes

- This repository contains source code and project assets.
- Some runtime configuration files or credentials may need to be adjusted before running in another environment.
- The project focuses on practical accounting workflows rather than generic CRUD-only functionality.
