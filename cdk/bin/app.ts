#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { LambdaStack } from "../lib/lambda-stack";
import { PipelineStack } from "../lib/pipeline-stack";

const app = new cdk.App();

// Resolve account/region from CLI credentials for HostedZone.fromLookup
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const domainName = app.node.tryGetContext("domainName");
if (!domainName) {
  throw new Error(
    "Required CDK context parameter 'domainName' is missing"
  );
}

const hostedZoneName = app.node.tryGetContext("hostedZoneName");
if (!hostedZoneName) {
  throw new Error(
    "Required CDK context parameter 'hostedZoneName' is missing"
  );
}

const colorRaw = app.node.tryGetContext("color");
const color: string = colorRaw ?? "blue";

if (color !== "blue" && color !== "green") {
  throw new Error(
    `Color parameter must be 'blue' or 'green', got: '${color}'`
  );
}

const lambdaStack = new LambdaStack(app, "LambdaStack", {
  env,
  domainName,
  hostedZoneName,
  color,
});

new PipelineStack(app, "PipelineStack", {
  env,
  deploymentGroup: lambdaStack.deploymentGroup,
  repositoryOwner: app.node.tryGetContext("repositoryOwner") ?? "owner",
  repositoryName: app.node.tryGetContext("repositoryName") ?? "lambda-blue-green",
  connectionArn: app.node.tryGetContext("connectionArn"),
});
