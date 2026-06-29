{{- define "traefik-public-gateway.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "traefik-public-gateway.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "traefik-public-gateway.labels" -}}
helm.sh/chart: {{ include "traefik-public-gateway.chart" . }}
app.kubernetes.io/name: {{ include "traefik-public-gateway.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: homelab-traefik
{{- end -}}
