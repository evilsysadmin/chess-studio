package gamesapi

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestLegacySwordhavenReturnOnlyFromPersistedArrival(t *testing.T) {
	tests := []struct {
		name     string
		run      bson.D
		from, to string
		allowed  bool
	}{
		{"arrived", bson.D{{Key: "worldFlags", Value: bson.D{{Key: "swordhavenArrived", Value: true}}}}, "crypt-eight-squares", "swordhaven-square", true},
		{"legacy crypt", bson.D{}, "crypt-eight-squares", "swordhaven-square", false},
		{"unpersisted", bson.D{{Key: "worldFlags", Value: bson.D{}}}, "crypt-eight-squares", "swordhaven-square", false},
		{"forged string", bson.D{{Key: "worldFlags", Value: bson.D{{Key: "swordhavenArrived", Value: "true"}}}}, "crypt-eight-squares", "swordhaven-square", false},
		{"wrong origin", bson.D{{Key: "worldFlags", Value: bson.D{{Key: "swordhavenArrived", Value: true}}}}, "gallery-of-forks", "swordhaven-square", false},
		{"wrong target", bson.D{{Key: "worldFlags", Value: bson.D{{Key: "swordhavenArrived", Value: true}}}}, "crypt-eight-squares", "ash-vault", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := legacySwordhavenReturnAllowed(tc.run, tc.from, tc.to); got != tc.allowed {
				t.Fatalf("got %v, want %v", got, tc.allowed)
			}
		})
	}
}
