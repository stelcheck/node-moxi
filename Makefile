# target: help, Display callable targets.
help:
	egrep "^# target:" [Mm]akefile

# target: setup, Do a full setup (currently an alias for git-setup).
setup: git-setup

# target: clean, Cleans the NPM cache.
clean:
	npm cache clean

# target: install, Installs all NodeJS dependencies.
install:
	npm install

# target: test, Runs all tests.
test:
	npm test

# target: lint, Lints every JavaScript file in the project that are staged to be comitted.
lint:
	./scripts/lint-staged.sh

# target: lint-all, Lints every JavaScript file in the project.
lint-all:
	./scripts/lint-all.sh

# target: benchmark, runs a benchmark with different files from data/
benchmark:
	./scripts/benchmark.sh

# target: benchmark-string, runs a benchmark with different string data using files from data/
benchmark-string:
	./scripts/benchmark.sh -s

# target: benchmark-json, runs a benchmark with different json data using files from data/
benchmark-json:
	./scripts/benchmark.sh -j

# target: benchmark-binary, runs a benchmark with different binary data using files from data/ (same files as for string test)
benchmark-binary:
	./scripts/benchmark.sh -b

# target: git-setup, Sets up git hooks.
git-setup:
	./scripts/git-setup.sh

