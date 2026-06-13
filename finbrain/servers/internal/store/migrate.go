package store

import (
	"database/sql"
	"fmt"

	"github.com/panda4096/homelab/finbrain/servers/db"

	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver "pgx" for goose
	"github.com/pressly/goose/v3"
)

func openSQL(databaseURL string) (*sql.DB, error) {
	return sql.Open("pgx", databaseURL)
}

// Migrate runs goose migrations from the embedded FS. direction: up | down | status.
func Migrate(databaseURL, direction string) error {
	sqlDB, err := openSQL(databaseURL)
	if err != nil {
		return err
	}
	defer sqlDB.Close()

	goose.SetBaseFS(db.Migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	switch direction {
	case "", "up":
		return goose.Up(sqlDB, "migrations")
	case "down":
		return goose.Down(sqlDB, "migrations")
	case "status":
		return goose.Status(sqlDB, "migrations")
	default:
		return fmt.Errorf("unknown migrate direction %q (want up|down|status)", direction)
	}
}

// Seed executes each embedded seed file (one statement per file).
func Seed(databaseURL string) error {
	sqlDB, err := openSQL(databaseURL)
	if err != nil {
		return err
	}
	defer sqlDB.Close()

	entries, err := db.Seeds.ReadDir("seeds")
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		content, err := db.Seeds.ReadFile("seeds/" + e.Name())
		if err != nil {
			return err
		}
		if _, err := sqlDB.Exec(string(content)); err != nil {
			return fmt.Errorf("seed %s: %w", e.Name(), err)
		}
	}
	return nil
}
