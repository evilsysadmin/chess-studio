package gamesapi

import (
	"errors"
	"strconv"
	"strings"
	"sync"
)

// ErrEngineBusy mirrors engine_runtime.EngineBackpressureError: optional
// analysis is shed instead of queueing behind gameplay.
var ErrEngineBusy = errors.New("optional engine capacity is busy")

// EnginePool mirrors engine_runtime: one bounded pool of engine workers
// (CHESS_ENGINE_WORKERS, 1-4) for every engine route of this process.
// Critical work (the CPU reply, hints) waits its turn; optional work (the
// analysis endpoints) is admitted only while fewer than OptionalLimit
// optional jobs are in flight (CHESS_ENGINE_OPTIONAL_INFLIGHT_LIMIT, 1-8,
// default the worker count), so it can never build a backlog.
type EnginePool struct {
	workers       chan struct{}
	mu            sync.Mutex
	optional      int
	optionalLimit int
	rejections    int
}

func NewEnginePool(workers, optionalLimit int) *EnginePool {
	workers = max(1, min(workers, 4))
	if optionalLimit <= 0 {
		optionalLimit = workers
	}
	return &EnginePool{workers: make(chan struct{}, workers), optionalLimit: max(1, min(optionalLimit, 8))}
}

// EnginePoolFromEnv reads CHESS_ENGINE_WORKERS and
// CHESS_ENGINE_OPTIONAL_INFLIGHT_LIMIT like engine_runtime.
func EnginePoolFromEnv(workersRaw, optionalRaw string) *EnginePool {
	workers := EngineWorkersFromEnv(workersRaw)
	optional := workers
	if value, err := strconv.Atoi(strings.TrimSpace(optionalRaw)); err == nil {
		optional = value
	}
	return NewEnginePool(workers, optional)
}

// Run executes critical engine work, waiting for a worker.
func (p *EnginePool) Run(work func()) {
	p.workers <- struct{}{}
	defer func() { <-p.workers }()
	work()
}

// RunOptional executes optional work or refuses it with ErrEngineBusy.
func (p *EnginePool) RunOptional(work func()) error {
	p.mu.Lock()
	if p.optional >= p.optionalLimit {
		p.rejections++
		p.mu.Unlock()
		return ErrEngineBusy
	}
	p.optional++
	p.mu.Unlock()
	defer func() {
		p.mu.Lock()
		p.optional--
		p.mu.Unlock()
	}()
	p.Run(work)
	return nil
}
