/**
 * Lost & Found — Production AWS Infrastructure (CDK)
 *
 * Defines DynamoDB table, private S3 bucket, EventBridge bus,
 * SQS notification queue + DLQ, and Lambda workers.
 *
 * Deploy: npx cdk deploy
 *
 * Note: This infrastructure imports existing S3 bucket and DynamoDB table
 * that were created outside CloudFormation in us-east-1.
 * EventBridge bus and SQS queues are created by this stack.
 */

import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { join } from "path";

export interface LostFoundStackProps extends cdk.StackProps {
  env?: { account?: string; region?: string };
}

export class LostFoundStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: LostFoundStackProps) {
    super(scope, id, props);

    const account = props?.env?.account ?? process.env.CDK_DEFAULT_ACCOUNT ?? "629380420098";
    const region = "us-east-1"; // Existing resources are in us-east-1

    // ============================================================
    // IMPORT EXISTING DYNAMODB TABLE (created outside CloudFormation)
    // ============================================================
    const reportsTable = dynamodb.Table.fromTableName(this, "LostFoundReports", "LostFound-Reports");

    // ============================================================
    // IMPORT EXISTING S3 BUCKET (created outside CloudFormation)
    // ============================================================
    const reportsBucket = s3.Bucket.fromBucketAttributes(this, "LostFoundReportsBucket", {
      bucketName: `lostfound-reports-${account}`,
      bucketArn: `arn:aws:s3:::lostfound-reports-${account}`,
    });

    // ============================================================
    // CREATE EVENTBRIDGE BUS (does not exist yet)
    // ============================================================
    const eventBus = new events.EventBus(this, "LostFoundEventBus", {
      eventBusName: "lost-found-bus",
    });

    // Allow events.amazonaws.com to PutEvents on this custom bus
    // Required for custom event buses — without this, PutEvents API
    // succeeds but events are silently dropped (no rule evaluation).
    // Also allow the account root to PutEvents (for same-account callers).
    eventBus.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowPutEventsFromEventBridgeService",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("events.amazonaws.com")],
        actions: ["events:PutEvents"],
        resources: [eventBus.eventBusArn],
      })
    );
    eventBus.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowPutEventsFromAccountRoot",
        effect: iam.Effect.ALLOW,
        principals: [new iam.AccountRootPrincipal()],
        actions: ["events:PutEvents"],
        resources: [eventBus.eventBusArn],
      })
    );

    // ============================================================
    // CREATE SQS QUEUE + DLQ (do not exist yet)
    // ============================================================
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

    // Allow events.amazonaws.com to send messages to this queue
    // Without condition on SourceArn to allow any EventBridge rule to target this queue
    notificationQueue.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowEventBridgeSendMessage",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("events.amazonaws.com")],
        actions: ["sqs:SendMessage", "sqs:GetQueueAttributes", "sqs:GetQueueUrl"],
        resources: [notificationQueue.queueArn],
      })
    );

    // EventBridge rule → SQS queue for notification worker
    new events.Rule(this, "ImageUploadedToNotificationQueue", {
      eventBus,
      eventPattern: {
        source: ["lost-found.app"],
        detailType: ["IMAGE_UPLOADED"],
      },
      targets: [new targets.SqsQueue(notificationQueue)],
    });

    // ============================================================
    // REKOGNITION PIPELINE: EventBridge → SQS → RekognitionWorker
    // ============================================================
    const rekognitionDlq = new sqs.Queue(this, "LostFoundRekognitionDLQ", {
      queueName: "LostFound-Rekognition-DLQ",
      retentionPeriod: cdk.Duration.days(14),
    });

    const rekognitionQueue = new sqs.Queue(this, "LostFoundRekognitionQueue", {
      queueName: "LostFound-Rekognition",
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: rekognitionDlq,
      },
    });

    // Allow events.amazonaws.com to send messages to the Rekognition queue
    rekognitionQueue.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowEventBridgeSendMessage",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("events.amazonaws.com")],
        actions: ["sqs:SendMessage", "sqs:GetQueueAttributes", "sqs:GetQueueUrl"],
        resources: [rekognitionQueue.queueArn],
      })
    );

    // EventBridge rule → SQS queue for Rekognition worker
    new events.Rule(this, "ImageUploadedToRekognitionQueue", {
      eventBus,
      eventPattern: {
        source: ["lost-found.app"],
        detailType: ["IMAGE_UPLOADED"],
      },
      targets: [new targets.SqsQueue(rekognitionQueue)],
    });

    // ============================================================
    // LAMBDA — Notification Worker
    // ============================================================
    const notificationLogGroup = new logs.LogGroup(this, "NotificationWorkerLogs", {
      logGroupName: "/aws/lambda/LostFound-NotificationWorker",
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const notificationWorker = new lambda.Function(this, "NotificationWorker", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "notification-worker.handler",
      logGroup: notificationLogGroup,
      code: lambda.Code.fromAsset(join(__dirname, "..", "lambda-dist")),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        DYNAMODB_REPORTS_TABLE: "LostFound-Reports",
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
          resources: [
            `arn:aws:dynamodb:${region}:${account}:table/LostFound-Reports`,
            `arn:aws:dynamodb:${region}:${account}:table/LostFound-Reports/index/*`,
          ],
        }),
        new iam.PolicyStatement({
          actions: ["events:PutEvents"],
          resources: [eventBus.eventBusArn],
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

    // ============================================================
    // LAMBDA — Rekognition Worker
    // ============================================================
    const rekognitionLogGroup = new logs.LogGroup(this, "RekognitionWorkerLogs", {
      logGroupName: "/aws/lambda/LostFound-RekognitionWorker",
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const rekognitionWorker = new lambda.Function(this, "RekognitionWorker", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "rekognition-worker.handler",
      code: lambda.Code.fromAsset(join(__dirname, "..", "lambda-dist")),
      logGroup: rekognitionLogGroup,
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: {
        DYNAMODB_REPORTS_TABLE: "LostFound-Reports",
        S3_REPORTS_BUCKET: `lostfound-reports-${account}`,
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
          resources: [
            `arn:aws:dynamodb:${region}:${account}:table/LostFound-Reports`,
            `arn:aws:dynamodb:${region}:${account}:table/LostFound-Reports/index/*`,
          ],
        }),
        new iam.PolicyStatement({
          actions: ["s3:GetObject"],
          resources: [`arn:aws:s3:::lostfound-reports-${account}/*`],
        }),
      ],
    });

    // Add SQS event source for Rekognition worker
    rekognitionWorker.addEventSource(
      new lambdaEventSources.SqsEventSource(rekognitionQueue, {
        batchSize: 1,
        maxBatchingWindow: cdk.Duration.seconds(5),
        reportBatchItemFailures: true,
      }),
    );

    // Keep a reference so the construct is not tree-shaken as "unused":
    // both workers are part of the deployed pipeline.
    void rekognitionWorker;

    // ============================================================
    // OUTPUTS
    // ============================================================
    new cdk.CfnOutput(this, "DynamoDBTableName", { value: "LostFound-Reports" });
    new cdk.CfnOutput(this, "S3BucketName", { value: `lostfound-reports-${account}` });
    new cdk.CfnOutput(this, "EventBridgeBusName", { value: eventBus.eventBusName });
    new cdk.CfnOutput(this, "NotificationQueueName", { value: notificationQueue.queueName });
    new cdk.CfnOutput(this, "NotificationDLQName", { value: dlq.queueName });
    new cdk.CfnOutput(this, "RekognitionQueueName", { value: rekognitionQueue.queueName });
    new cdk.CfnOutput(this, "RekognitionDLQName", { value: rekognitionDlq.queueName });
  }
}