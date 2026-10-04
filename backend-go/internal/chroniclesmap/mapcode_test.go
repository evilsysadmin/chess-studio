package chroniclesmap

import "testing"

func TestMapCodeCanonicalizesPythonContract(t *testing.T) {
	raw := "cm1| THEME=Water | SIZE=13X10 | VERBS=Sluice,Guardian | ENEMIES=3 | TREASURES=2 | SECRETS=1 | DIFFICULTY=4 | SEED=417"
	recipe, err := Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	got, err := Encode(recipe)
	if err != nil {
		t.Fatal(err)
	}
	want := "CM1|theme=water|size=13x10|verbs=sluice,guardian|enemies=3|treasures=2|secrets=1|difficulty=4|seed=417"
	if got != want {
		t.Fatalf("canonical MapCode\ngot  %s\nwant %s", got, want)
	}
}

func TestMapCodeRejectsInvalidRecipes(t *testing.T) {
	valid := "CM1|theme=crypt|size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0"
	cases := []string{
		"",
		"CM2|theme=crypt|size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
		"CM1|theme=bog|size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
		"CM1|theme=crypt|size=6x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
		"CM1|theme=crypt|size=7x7|verbs=hunt,hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
		"CM1|theme=crypt|size=7x7|verbs=explode|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
		"CM1|theme=crypt|size=7x7|verbs=hunt|enemies=9|treasures=0|secrets=0|difficulty=1|seed=0",
		"CM1|theme=crypt|size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=6|seed=0",
		"CM1|theme=crypt|size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=2147483648",
		"CM1|theme=crypt|theme=water|size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
		"CM1|theme=crypt|size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1",
		valid + "|mystery=1",
	}
	for _, raw := range cases {
		if _, err := Parse(raw); err == nil {
			t.Errorf("expected invalid MapCode: %q", raw)
		}
	}
}
