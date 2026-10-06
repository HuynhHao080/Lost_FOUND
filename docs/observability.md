# Observability

Structured logging with correlation IDs (eventId, reportId, eventType, messageId). No secrets/embeddings/keys logged. Custom metrics: ImageAnalysisSuccess/Failure/Retry/Duration, NotificationCreated/Failure, OutboxEventCreated/Published/Failure. Alarms: Lambda errors/throttles, SQS backlog/age, DLQ messages. Dashboard: LostFound-Operations. Audit trail: REPORT_CREATED, MATCH_CONFIRMED, MATCH_RESET, REPORT_RESOLVED, IMAGE_ANALYSIS_COMPLETED/FAILED. Audit API: /api/reports/[id]/audit (auth/authz, safe fields).
