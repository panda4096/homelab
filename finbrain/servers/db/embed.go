// Package db holds embedded SQL migrations and dev seed data so the binary is
// self-contained (no external files needed at runtime).
package db

import "embed"

// Migrations are goose-format SQL migrations, applied in filename order.
//
//go:embed migrations/*.sql
var Migrations embed.FS

// Seeds are plain SQL files (one statement each) used for local/dev test data.
//
//go:embed seeds/*.sql
var Seeds embed.FS
