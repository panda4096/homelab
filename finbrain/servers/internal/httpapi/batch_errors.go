package httpapi

type batchRowError struct {
	LineIndex  int    `json:"line_index"`
	EntityType string `json:"entity_type"`
	Field      string `json:"field,omitempty"`
	ErrorCode  string `json:"error_code"`
	Message    string `json:"message"`
}

func newBatchRowError(entityType string, lineIndex int, field, errorCode, message string) batchRowError {
	if errorCode == "" {
		errorCode = "business_rule_violated"
	}
	return batchRowError{
		LineIndex:  lineIndex,
		EntityType: entityType,
		Field:      field,
		ErrorCode:  errorCode,
		Message:    message,
	}
}
