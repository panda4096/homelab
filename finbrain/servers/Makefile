SHELL := /bin/bash
export GOTOOLCHAIN := local

# DB = infra NUC dev postgres (192.168.100.29:30432, see
# ../../infra/data/postgresql/nuc-dev/README.md). The finbrain DB/role are
# provisioned once (see README "首次准备"). DATABASE_URL is assembled from the
# gitignored shared secret so `make migrate|seed|run` work with no extra setup.
SECRETS     ?= ../../infra/.secrets/postgresql.env
NUC_HOST    ?= 192.168.100.29
NUC_PORT    ?= 30432
DB_PASSWORD := $(shell set -a; . $(SECRETS) 2>/dev/null; set +a; printf '%s' "$$FINBRAIN_DB_PASSWORD")
DATABASE_URL ?= postgres://finbrain:$(DB_PASSWORD)@$(NUC_HOST):$(NUC_PORT)/finbrain?sslmode=disable
export DATABASE_URL

.PHONY: tidy build run migrate migrate-down migrate-status seed seed-test test fmt vet

tidy: ; go mod tidy
build: ; go build -o bin/finbrain ./cmd/finbrain
run: ; go run ./cmd/finbrain serve
migrate: ; go run ./cmd/finbrain migrate up
migrate-down: ; go run ./cmd/finbrain migrate down
migrate-status: ; go run ./cmd/finbrain migrate status
seed seed-test: ; go run ./cmd/finbrain seed
test: ; go test ./...
fmt: ; gofmt -w .
vet: ; go vet ./...
