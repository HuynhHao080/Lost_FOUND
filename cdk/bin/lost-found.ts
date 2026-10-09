#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { LostFoundStack } from "../lib/lost-found-stack";

const app = new cdk.App();

// Deploy to us-east-1 where existing resources (S3 bucket, DynamoDB table) already exist
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || "629380420098",
  region: "us-east-1",
};

new LostFoundStack(app, "LostFoundStack", {
  env,
  description: "Lost & Found - Production AWS Infrastructure",
});

app.synth();