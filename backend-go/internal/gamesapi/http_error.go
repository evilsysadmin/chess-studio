package gamesapi

// Active Chess Studio Admin endpoints share this HTTP error shape.
// It is not specific to the extracted Chronicles run handler.
type httpError struct {
	status int
	detail string
}

func (e *httpError) Error() string { return e.detail }

func fail(status int, detail string) error { return &httpError{status, detail} }
