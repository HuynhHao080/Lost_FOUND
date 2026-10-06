# Demo Guide — AWS Lost & Found

5–10 minute flow for AWS mentor.

1. Login (Cognito) → Dashboard
2. Create report (DynamoDB + S3 image upload)
3. Image event → EventBridge → SQS → Lambda (Rekognition)
4. Image analysis → DynamoDB update
5. Find matches → Bedrock embeddings + deterministic rules
6. Confirm match → lifecycle event → notification
7. Audit timeline → CloudWatch logs/metrics

AWS services shown: Cognito, DynamoDB, S3, Bedrock, Rekognition, EventBridge, SQS, DLQ, Lambda, CloudWatch, CDK.

Deployment status: BLOCKED (missing AWS credentials/OIDC/account access).
