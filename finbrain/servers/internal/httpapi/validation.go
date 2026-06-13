package httpapi

import "unicode/utf8"

const (
	maxSymbolLen = 64
	maxNameLen   = 128
	maxKindLen   = 32
	maxNoteLen   = 1000
)

func validateTextLen(label, value string, max int) string {
	if utf8.RuneCountInString(value) > max {
		return label + " must be <= " + itoa(max) + " characters"
	}
	return ""
}

func validateOptionalTextLen(label string, value *string, max int) string {
	if value == nil {
		return ""
	}
	return validateTextLen(label, *value, max)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
