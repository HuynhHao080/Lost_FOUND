import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * DynamoDB configuration and client for Lost & Found application.
 *
 * This module provides a singleton DynamoDB client configured with:
 * - AWS SDK v3 credential provider chain (reads from environment or EC2/ECS roles)
 * - DynamoDBDocumentClient for application-level object operations
 *
 * Required environment variables:
 * - AWS_REGION: AWS region (e.g., us-east-1)
 * - DYNAMODB_REPORTS_TABLE: Name of the reports table
 *
 * Credentials are read from the standard AWS SDK credential provider chain:
 * 1. AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY environment variables
 * 2. AWS credentials file (~/.aws/credentials)
 * 3. EC2/ECS instance metadata
 */

const REGION = process.env.AWS_REGION || "us-east-1";
export const REPORTS_TABLE = process.env.DYNAMODB_REPORTS_TABLE || "LostFound-Reports";

// Create a singleton DynamoDB client
const client = new DynamoDBClient({
  region: REGION,
});

// Wrap with DocumentClient for easier object operations
export const dynamoDb = DynamoDBDocumentClient.from(client);

/**
 * Validates that required DynamoDB configuration is present.
 * Throws an error if the reports table name is not configured.
 */
export function validateDynamoConfig(): void {
  if (!process.env.DYNAMODB_REPORTS_TABLE) {
    throw new Error("DYNAMODB_REPORTS_TABLE environment variable is not set");
  }
}
