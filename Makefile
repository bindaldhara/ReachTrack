.PHONY: api web test

api:
	cd api && go run ./cmd/server

web:
	cd web && npm run dev

test:
	cd api && go test ./...
