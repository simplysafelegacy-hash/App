package handlers

import (
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// The backfill migration hardcodes the death-operative sections in SQL. If that
// list and deathOperativeSections() drift, a newly added after-death section is
// released for new approvals but silently missing for backfilled vaults — the
// same class of bug the backfill exists to repair.
func TestBackfillMigrationMatchesDeathOperativeSections(t *testing.T) {
	raw, err := os.ReadFile("../db/migrations/020_backfill_death_releases.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	// Pull the VALUES ('a'),('b') list out of the CROSS JOIN.
	block := regexp.MustCompile(`(?s)CROSS JOIN \(VALUES(.*?)\) AS s`).FindSubmatch(raw)
	if block == nil {
		t.Fatal("could not find the VALUES list in migration 020")
	}
	found := []string{}
	for _, m := range regexp.MustCompile(`'([a-z_]+)'`).FindAllStringSubmatch(string(block[1]), -1) {
		found = append(found, m[1])
	}
	want := append([]string{}, deathOperativeSections()...)
	sort.Strings(found)
	sort.Strings(want)
	if strings.Join(found, ",") != strings.Join(want, ",") {
		t.Fatalf("migration 020 releases %v, deathOperativeSections() is %v", found, want)
	}
}
