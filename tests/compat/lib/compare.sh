#!/usr/bin/env bash
# lib/compare.sh — JSON key comparison utilities

# compare_json_keys <node_output> <rust_output>
# Returns diff of sorted top-level key sets.
# Exit 0 = identical, non-zero = diverged.
compare_json_keys() {
    local node_out="$1"
    local rust_out="$2"

    node_keys=$(echo "$node_out" | python3 -c \
        "import sys,json; d=json.load(sys.stdin); print('\n'.join(sorted(d.keys())))" 2>/dev/null)
    rust_keys=$(echo "$rust_out" | python3 -c \
        "import sys,json; d=json.load(sys.stdin); print('\n'.join(sorted(d.keys())))" 2>/dev/null)

    diff <(echo "$node_keys") <(echo "$rust_keys")
}

# keys_match_expected <json_output> <expected_schema_json_file>
# Returns 0 if all keys in expected file appear in json_output.
keys_match_expected() {
    local json_out="$1"
    local schema_file="$2"

    actual_keys=$(echo "$json_out" | python3 -c \
        "import sys,json; d=json.load(sys.stdin); print('\n'.join(sorted(d.keys())))" 2>/dev/null)
    expected_keys=$(python3 -c \
        "import json; d=json.load(open('$schema_file')); print('\n'.join(sorted(d['keys'])))" 2>/dev/null)

    diff <(echo "$expected_keys") <(echo "$actual_keys")
}
