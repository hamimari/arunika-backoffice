# Local and CI use the same commands. See README "Testing".
.PHONY: install lint typecheck test-fast test-all coverage-baseline

install:
	npm ci

lint:
	npm run lint

typecheck:
	npx tsc -b --noEmit

## test-fast: unit + component tests, no coverage. The inner-loop command.
test-fast:
	npm test

## test-all: everything CI runs on a pull request.
test-all: lint typecheck
	npm run test:ci
	npm run coverage:ratchet

## coverage-baseline: re-record the ratchet baseline after intentional changes.
coverage-baseline:
	npm run test:ci
	npm run coverage:ratchet -- --write
