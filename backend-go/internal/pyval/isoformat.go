package pyval

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// FromISOFormat is CPython 3.13's datetime.fromisoformat: extended or basic
// dates (YYYY-MM-DD, YYYYMMDD, ISO weeks), any single character between date
// and time, HH[:MM[:SS[.f+]]] (or basic), a ',' or '.' fraction truncated to
// microseconds and an optional ±HH[:MM[:SS[.f]]] or Z offset. aware reports
// whether an offset was given; a naive value comes back in UTC.
func FromISOFormat(s string) (t time.Time, aware bool, ok bool) {
	t, aware, err := ParseISOFormat(s)
	return t, aware, err == nil
}

// ParseISOFormat is FromISOFormat with the ValueError fromisoformat raises:
// "Invalid isoformat string: '…'" for the shape, then the offset bound, then
// the date and time constructor's range checks, in CPython's order.
func ParseISOFormat(s string) (time.Time, bool, error) {
	p, ok := parseISO([]rune(s))
	if !ok {
		return time.Time{}, false, errors.New("Invalid isoformat string: " + Repr(s))
	}
	const day = int64(86400_000_000)
	if p.offset != nil && (*p.offset >= day || *p.offset <= -day) {
		return time.Time{}, false, errors.New("offset must be a timedelta strictly between -timedelta(hours=24) and timedelta(hours=24), not " + TimedeltaRepr(*p.offset) + ".")
	}
	switch {
	case p.year < 1 || p.year > 9999:
		return time.Time{}, false, fmt.Errorf("year %d is out of range", p.year)
	case p.month < 1 || p.month > 12:
		return time.Time{}, false, errors.New("month must be in 1..12")
	case p.day < 1 || p.day > daysIn(p.year, p.month):
		return time.Time{}, false, errors.New("day is out of range for month")
	case p.hour > 23:
		return time.Time{}, false, errors.New("hour must be in 0..23")
	case p.minute > 59:
		return time.Time{}, false, errors.New("minute must be in 0..59")
	case p.second > 59:
		return time.Time{}, false, errors.New("second must be in 0..59")
	}
	value := time.Date(p.year, time.Month(p.month), p.day, p.hour, p.minute, p.second, p.micro*1000, time.UTC)
	if p.offset != nil {
		value = value.Add(-time.Duration(*p.offset) * time.Microsecond)
	}
	return value, p.offset != nil, nil
}

// TimedeltaRepr is repr(timedelta(microseconds=us)).
func TimedeltaRepr(us int64) string {
	const day = int64(86400_000_000)
	days := us / day
	if us%day < 0 {
		days--
	}
	rest := us - days*day
	var parts []string
	if days != 0 {
		parts = append(parts, fmt.Sprintf("days=%d", days))
	}
	if sec := rest / 1_000_000; sec != 0 {
		parts = append(parts, fmt.Sprintf("seconds=%d", sec))
	}
	if micro := rest % 1_000_000; micro != 0 {
		parts = append(parts, fmt.Sprintf("microseconds=%d", micro))
	}
	if len(parts) == 0 {
		return "datetime.timedelta(0)"
	}
	return "datetime.timedelta(" + strings.Join(parts, ", ") + ")"
}

type isoParts struct {
	year, month, day, hour, minute, second, micro int
	// offset is the UTC offset in microseconds (nil when naive).
	offset *int64
}

// parseISO is the shape fromisoformat accepts, before any range check.
func parseISO(r []rune) (isoParts, bool) {
	var p isoParts
	if len(r) < 7 {
		return p, false
	}
	sep, ok := isoSeparator(r)
	if !ok {
		return p, false
	}
	if p.year, p.month, p.day, ok = isoDate(r[:sep]); !ok {
		return p, false
	}
	var tstr []rune
	if sep+1 <= len(r) {
		tstr = r[min(sep+1, len(r)):]
	}
	if sep < len(r) && len(tstr) == 0 {
		// A separator with nothing after it.
		return p, false
	}
	if len(tstr) > 0 {
		if p.hour, p.minute, p.second, p.micro, p.offset, ok = isoTime(tstr); !ok {
			return p, false
		}
	}
	return p, true
}

func digit(r rune) bool { return r >= '0' && r <= '9' }

// isoSeparator is _find_isoformat_datetime_separator.
func isoSeparator(r []rune) (int, bool) {
	n := len(r)
	if n == 7 {
		return 7, true
	}
	if r[4] == '-' {
		if r[5] == 'W' {
			if n > 8 && r[8] == '-' {
				if n == 9 {
					return 0, false
				}
				if n > 10 && digit(r[10]) {
					return 8, true
				}
				return 10, true
			}
			return 8, true
		}
		return 10, true
	}
	if r[4] == 'W' {
		idx := 7
		for idx < n && digit(r[idx]) {
			idx++
		}
		if idx < 9 {
			return idx, true
		}
		if idx%2 == 0 {
			return 7, true
		}
		return 8, true
	}
	return 8, true
}

func atoi(r []rune) (int, bool) {
	if len(r) == 0 {
		return 0, false
	}
	n := 0
	for _, c := range r {
		if !digit(c) {
			return 0, false
		}
		n = n*10 + int(c-'0')
	}
	return n, true
}

// isoDate is _parse_isoformat_date: the calendar date's ranges are left to
// ParseISOFormat; an ISO week date is resolved (and rejected) here.
func isoDate(r []rune) (year, month, day int, ok bool) {
	if n := len(r); n != 7 && n != 8 && n != 10 {
		return 0, 0, 0, false
	}
	year, ok = atoi(r[0:4])
	if !ok {
		return 0, 0, 0, false
	}
	hasSep := r[4] == '-'
	pos := 4
	if hasSep {
		pos++
	}
	at := func(i int) rune {
		if i < len(r) {
			return r[i]
		}
		return 0
	}
	if at(pos) == 'W' {
		if year < 1 {
			return 0, 0, 0, false
		}
		pos++
		if pos+2 > len(r) {
			return 0, 0, 0, false
		}
		week, wok := atoi(r[pos : pos+2])
		if !wok {
			return 0, 0, 0, false
		}
		pos += 2
		weekday := 1
		if len(r) > pos {
			if (at(pos) == '-') != hasSep {
				return 0, 0, 0, false
			}
			if hasSep {
				pos++
			}
			if pos+1 != len(r) {
				return 0, 0, 0, false
			}
			d, dok := atoi(r[pos : pos+1])
			if !dok {
				return 0, 0, 0, false
			}
			weekday = d
		}
		return isoWeek(year, week, weekday)
	}
	if pos+2 > len(r) {
		return 0, 0, 0, false
	}
	month, ok = atoi(r[pos : pos+2])
	if !ok {
		return 0, 0, 0, false
	}
	pos += 2
	if (at(pos) == '-') != hasSep {
		return 0, 0, 0, false
	}
	if hasSep {
		pos++
	}
	if pos+2 != len(r) {
		return 0, 0, 0, false
	}
	day, ok = atoi(r[pos : pos+2])
	return year, month, day, ok
}

func daysIn(year, month int) int {
	return time.Date(year, time.Month(month)+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

func leap(year int) bool { return year%4 == 0 && (year%100 != 0 || year%400 == 0) }

// isoWeek is _isoweek_to_gregorian.
func isoWeek(year, week, weekday int) (int, int, int, bool) {
	if year > 9999 {
		return 0, 0, 0, false
	}
	if week < 1 || week > 52 {
		jan1 := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC).Weekday()
		if week != 53 || !(jan1 == time.Thursday || (jan1 == time.Wednesday && leap(year))) {
			return 0, 0, 0, false
		}
	}
	if weekday < 1 || weekday > 7 {
		return 0, 0, 0, false
	}
	jan4 := time.Date(year, 1, 4, 0, 0, 0, 0, time.UTC)
	monday := jan4.AddDate(0, 0, -((int(jan4.Weekday()) + 6) % 7))
	d := monday.AddDate(0, 0, (week-1)*7+weekday-1)
	return d.Year(), int(d.Month()), d.Day(), true
}

// hhmmssff is _parse_hh_mm_ss_ff.
func hhmmssff(r []rune) (comps [4]int, ok bool) {
	n := len(r)
	pos := 0
	hasSep := false
	for comp := 0; comp < 3; comp++ {
		if n-pos < 2 {
			return comps, false
		}
		v, vok := atoi(r[pos : pos+2])
		if !vok {
			return comps, false
		}
		comps[comp] = v
		pos += 2
		if pos >= n || comp >= 2 {
			break
		}
		next := r[pos]
		if comp == 0 {
			hasSep = next == ':'
		}
		if hasSep && next != ':' {
			return comps, false
		}
		if hasSep {
			pos++
		}
	}
	if pos < n {
		if r[pos] != '.' && r[pos] != ',' {
			return comps, false
		}
		pos++
		remainder := n - pos
		parse := min(remainder, 6)
		frac, fok := atoi(r[pos : pos+parse])
		if !fok {
			return comps, false
		}
		for i := parse; i < 6; i++ {
			frac *= 10
		}
		comps[3] = frac
		for _, c := range r[pos+parse:] {
			if !digit(c) {
				return comps, false
			}
		}
	}
	return comps, true
}

// isoTime is _parse_isoformat_time.
func isoTime(r []rune) (hour, minute, second, micro int, offset *int64, ok bool) {
	if len(r) < 2 {
		return 0, 0, 0, 0, nil, false
	}
	tzPos := -1
	for _, mark := range []rune{'-', '+', 'Z'} {
		for i, c := range r {
			if c == mark {
				tzPos = i + 1
				break
			}
		}
		if tzPos > 0 {
			break
		}
	}
	timePart := r
	if tzPos > 0 {
		timePart = r[:tzPos-1]
	}
	comps, ok := hhmmssff(timePart)
	if !ok {
		return 0, 0, 0, 0, nil, false
	}
	if tzPos > 0 {
		if tzPos == len(r) && r[len(r)-1] == 'Z' {
			zero := int64(0)
			offset = &zero
		} else {
			tz := r[tzPos:]
			if l := len(tz); l == 0 || l == 1 || l == 3 || r[tzPos-1] == 'Z' {
				return 0, 0, 0, 0, nil, false
			}
			tc, tok := hhmmssff(tz)
			if !tok {
				return 0, 0, 0, 0, nil, false
			}
			us := (int64(tc[0])*3600+int64(tc[1])*60+int64(tc[2]))*1_000_000 + int64(tc[3])
			if r[tzPos-1] == '-' {
				us = -us
			}
			offset = &us
		}
	}
	return comps[0], comps[1], comps[2], comps[3], offset, true
}
