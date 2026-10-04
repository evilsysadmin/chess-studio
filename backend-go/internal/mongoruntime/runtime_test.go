package mongoruntime

import (
	"context"
	"testing"
)

func TestNewValidatesConnectionIdentityBeforeDial(t *testing.T) {
	if _, err := New(context.Background(), Config{}); err == nil {
		t.Fatal("expected missing URL")
	}
	if _, err := New(context.Background(), Config{URL: "mongodb://localhost:27017"}); err == nil {
		t.Fatal("expected missing database")
	}
}

func TestNilRuntimeAccessorsAreSafe(t *testing.T) {
	var runtime *Runtime
	if runtime.Database() != nil {
		t.Fatal("nil runtime returned a database")
	}
	if runtime.QueryTimeout() != DefaultQueryTimeout {
		t.Fatalf("timeout=%s", runtime.QueryTimeout())
	}
	if runtime.Close(context.Background()) != nil {
		t.Fatal("nil runtime close failed")
	}
	if runtime.Ping(context.Background()) == nil {
		t.Fatal("nil runtime ping should fail")
	}
}
