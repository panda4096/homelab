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

# LLM (Copilot / agent NL planner). Keys live in the gitignored-trust-model
# finbrain.env; sourced here so `make run` injects them. DeepSeek is default.
LLM_SECRETS      ?= ../../infra/.secrets/finbrain.env
DEEPSEEK_API_KEY := $(shell set -a; . $(LLM_SECRETS) 2>/dev/null; set +a; printf '%s' "$$DEEPSEEK_API_KEY")
ANTHROPIC_API_KEY := $(shell set -a; . $(LLM_SECRETS) 2>/dev/null; set +a; printf '%s' "$$ANTHROPIC_API_KEY")
FINBRAIN_LLM_MODEL ?= $(shell set -a; . $(LLM_SECRETS) 2>/dev/null; set +a; printf '%s' "$$FINBRAIN_LLM_MODEL")
FINBRAIN_LLM_MODEL := $(if $(FINBRAIN_LLM_MODEL),$(FINBRAIN_LLM_MODEL),deepseek-v4-flash)
export DEEPSEEK_API_KEY
export ANTHROPIC_API_KEY
export FINBRAIN_LLM_MODEL

.PHONY: tidy build run migrate migrate-down migrate-status seed seed-test test fmt vet

tidy: ; go mod tidy
build: ; go build -o bin/finbrain ./cmd/finbrain && go build -o bin/finbrain-admin ./cmd/finbrain-admin
run: ; go run ./cmd/finbrain serve
migrate: ; go run ./cmd/finbrain migrate up
migrate-down: ; go run ./cmd/finbrain migrate down
migrate-status: ; go run ./cmd/finbrain migrate status
seed seed-test: ; go run ./cmd/finbrain seed
# Reset a user's password to a temporary one (they'll be forced to change it on next login).
# Usage: make set-password USER=owner PW='your-temp-password'
set-password: ; go run ./cmd/finbrain-admin set-password $(USER) $(PW)
test: ; go test ./...
fmt: ; gofmt -w .
vet: ; go vet ./...
