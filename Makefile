.PHONY: api web test

api:
	cd api && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload

web:
	cd web && npm run dev

test:
	cd api && .venv/bin/python -m compileall app
