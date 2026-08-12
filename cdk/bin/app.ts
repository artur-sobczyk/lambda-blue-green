#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { LambdaStack } from "../lib/lambda-stack";
import { PipelineStack } from "../lib/pipeline-stack";

const app = new cdk.App();

const domainName = app.node.tryGetContext("domainName");
if (!domainName) {
  throw new Error(
    "Required CDK context parameter 'domainName' is missing"
  );
}

const certificateArn = app.node.tryGetContext("certificateArn");
if (!certificateArn) {
  throw new Error(
    "Required CDK context parameter 'certificateArn' is missing"
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
  domainName,
  certificateArn,
  color,
});

new PipelineStack(app, "PipelineStack", {
  deploymentGroup: lambdaStack.deploymentGroup,
  repositoryOwner: app.node.tryGetContext("repositoryOwner") ?? "owner",
  repositoryName: app.node.tryGetContext("repositoryName") ?? "lambda-blue-green",
  connectionArn: app.node.tryGetContext("connectionArn"),
});
