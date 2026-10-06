/**
 * Lost & Found — Production AWS Infrastructure (CDK)
 *
 * Defines DynamoDB table, private S3 bucket, EventBridge bus,
 * SQS notification queue + DLQ, and Lambda workers.
 *
 * Deploy: npx cdk deploy
 *
 * Note: This is infrastructure-as-code for deployment. It does NOT
 * create resources automatically from application code.
 */

import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as events from "aws-cdk-lib/aws-events";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export interface LostFoundStackProps extends cdk.StackProps {
  env?: { account?: string; region?: string };
}

export class LostFoundStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: LostFoundStackProps) {
    super(scope, id, props);

    const region = props?.env?.region ?? process.env.AWS_REGION ?? "us-east-1";

    // DynamoDB — existing report table with GSI1
    const reportsTable = new dynamodb.Table(this, "LostFoundReports", {
      tableName: "LostFound-Reports",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    reportsTable.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // S3 — private bucket with CORS for localhost upload
    const reportsBucket = new s3.Bucket(this, "LostFoundReportsBucket", {
      bucketName: `lostfound-reports-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,
    });

    reportsBucket.addCorsRule({
      allowedHeaders: ["Content-Type"],
      allowedMethods: [s3.HttpMethods.PUT],
      allowedOrigins: ["http://localhost:3000"],
      maxAge: 3000,
    });

    // EventBridge bus
    const eventBus = new events.EventBus(this, "LostFoundEventBus", {
      eventBusName: "lost-found-bus",
    });

    // SQS Queue + DLQ
    const dlq = new sqs.Queue(this, "LostFoundNotificationsDLQ", {
      queueName: "LostFound-Notifications-DLQ",
      retentionPeriod: cdk.Duration.days(14),
    });

    const notificationQueue = new sqs.Queue(this, "LostFoundNotificationsQueue", {
      queueName: "LostFound-Notifications",
      visibilityTimeout: cdk.Duration.seconds(30),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: dlq,
      },
    });

    // CloudWatch Log Group for notification worker (retention 14 days).
    // Attached to the Lambda via `logGroup` so the name is actually used.
    const notificationLogGroup = new logs.LogGroup(this, "NotificationWorkerLogs", {
      logGroupName: "/aws/lambda/LostFound-NotificationWorker",
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Lambda — notification worker
    const notificationWorker = new lambda.Function(this, "NotificationWorker", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "dist/lib/notifications/worker.handler",
      logGroup: notificationLogGroup,
      code: lambda.Code.fromAsset(".", {
        exclude: [".git", ".next", "node_modules", "docs", "scripts", "cdk"],
      }),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        AWS_REGION: region,
        DYNAMODB_REPORTS_TABLE: reportsTable.tableName,
        EVENTBRIDGE_BUS_NAME: eventBus.eventBusName,
      },
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
            "dynamodb:GetItem",
            "dynamodb:Query",
          ],
          resources: [reportsTable.tableArn],
        }),
      ],
    });

    notificationWorker.addEventSource(
      new lambdaEventSources.SqsEventSource(notificationQueue, {
        batchSize: 1,
        maxBatchingWindow: cdk.Duration.seconds(5),
        reportBatchItemFailures: true,
      }),
    );

    // Lambda — Rekognition worker. Reads IMAGE_UPLOADED outbox events from
    // DynamoDB (via the reports table stream / scheduled poll), runs
    // Rekognition, and writes imageLabels back. The handler lives in
    // src/lib/notifications/worker.ts (IMAGE_UPLOADED branch) — kept in the
    // same bundle so `logGroup` wiring and IAM stay in one place.
    const rekognitionLogGroup = new logs.LogGroup(this, "RekognitionWorkerLogs", {
      logGroupName: "/aws/lambda/LostFound-RekognitionWorker",
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const rekognitionWorker = new lambda.Function(this, "RekognitionWorker", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "dist/lib/notifications/worker.handler",
      code: lambda.Code.fromAsset(".", {
        exclude: [".git", ".next", "node_modules", "docs", "scripts", "cdk"],
      }),
      logGroup: rekognitionLogGroup,
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: {
        AWS_REGION: region,
        DYNAMODB_REPORTS_TABLE: reportsTable.tableName,
        S3_REPORTS_BUCKET: reportsBucket.bucketName,
      },
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            "rekognition:DetectLabels",
            "rekognition:DetectModerationLabels",
            "dynamodb:UpdateItem",
            "dynamodb:GetItem",
            "dynamodb:Query",
            "s3:GetObject",
          ],
          // DetectLabels/DetectModerationLabels do not support resource-level
          // permissions — they require "*". Data-plane actions stay scoped to
          // the table and bucket.
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          actions: ["dynamodb:UpdateItem", "dynamodb:GetItem", "dynamodb:Query"],
          resources: [reportsTable.tableArn, `${reportsTable.tableArn}/index/*`],
        }),
        new iam.PolicyStatement({
          actions: ["s3:GetObject"],
          resources: [`${reportsBucket.bucketArn}/*`],
        }),
      ],
    });

    // Keep a reference so the construct is not tree-shaken as "unused":
    // both workers are part of the deployed pipeline.
    void rekognitionWorker;

    new cdk.CfnOutput(this, "DynamoDBTableName", { value: reportsTable.tableName });
    new cdk.CfnOutput(this, "S3BucketName", { value: reportsBucket.bucketName });
    new cdk.CfnOutput(this, "EventBridgeBusName", { value: eventBus.eventBusName });
    new cdk.CfnOutput(this, "NotificationQueueName", { value: notificationQueue.queueName });
    new cdk.CfnOutput(this, "NotificationDLQName", { value: dlq.queueName });
  }
}
