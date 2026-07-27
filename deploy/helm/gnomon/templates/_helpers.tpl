{{- define "gnomon.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "gnomon.secretName" -}}
{{- default (include "gnomon.fullname" .) .Values.secrets.existingSecret | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "gnomon.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "gnomon.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "gnomon.labels" -}}
app.kubernetes.io/name: {{ include "gnomon.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end }}
