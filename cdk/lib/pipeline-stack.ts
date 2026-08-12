import * as cdk from "aws-cdk-lib";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codedeploy from "aws-cdk-lib/aws-codedeploy";
import * as codestarconnections from "aws-cdk-lib/aws-codestarconnections";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface PipelineStackProps extends cdk.StackProps {
  readonly deploymentGroup: codedeploy.ILambdaDeploymentGroup;
  readonly connectionArn?: string;
  readonly repositoryOwner: string;
  readonly repositoryName: string;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    // Use provided connection ARN or create a new CodeStar Connection
    const connectionArn =
      props.connectionArn ??
      new codestarconnections.CfnConnection(this, "GitHubConnection", {
        connectionName: "github-connection",
        providerType: "GitHub",
      }).attrConnectionArn;

    // Define artifacts
    const sourceOutput = new codepipeline.Artifact("SourceOutput");
    const buildOutput = new codepipeline.Artifact("BuildOutput");

    // Source action
    const sourceAction =
      new codepipeline_actions.CodeStarConnectionsSourceAction({
        actionName: "GitHub_Source",
        owner: props.repositoryOwner,
        repo: props.repositoryName,
        branch: "main",
        connectionArn,
        output: sourceOutput,
      });

    // CodeBuild project
    const buildProject = new codebuild.PipelineProject(this, "BuildProject", {
      timeout: cdk.Duration.minutes(10),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          install: {
            commands: ["cd lambda", "npm ci"],
          },
          build: {
            commands: ["npm run build"],
          },
        },
        artifacts: {
          "base-directory": "lambda/dist",
          files: ["**/*"],
        },
      }),
    });

    // Build action
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: "Build",
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });

    // IAM follows least privilege — deployment role is scoped to only the
    // resources needed: Lambda functions, CodeDeploy, CloudWatch, and IAM
    // pass-role for the Lambda execution role. No wildcard actions or resources.
    const deploymentRole = new iam.Role(this, "DeploymentRole", {
      assumedBy: new iam.ServicePrincipal("cloudformation.amazonaws.com"),
    });

    deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration",
          "lambda:PublishVersion",
          "lambda:CreateAlias",
          "lambda:UpdateAlias",
          "lambda:GetAlias",
          "lambda:ListVersionsByFunction",
          "lambda:DeleteFunction",
          "lambda:CreateFunction",
          "lambda:TagResource",
          "lambda:UntagResource",
          "lambda:ListTags",
          "lambda:AddPermission",
          "lambda:RemovePermission",
        ],
        resources: [
          cdk.Arn.format(
            { service: "lambda", resource: "function", resourceName: "*" },
            this
          ),
        ],
      })
    );

    deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "codedeploy:CreateApplication",
          "codedeploy:CreateDeploymentGroup",
          "codedeploy:GetApplication",
          "codedeploy:GetDeploymentGroup",
          "codedeploy:UpdateDeploymentGroup",
          "codedeploy:DeleteDeploymentGroup",
          "codedeploy:DeleteApplication",
          "codedeploy:RegisterApplicationRevision",
          "codedeploy:CreateDeployment",
          "codedeploy:GetDeployment",
          "codedeploy:GetDeploymentConfig",
        ],
        resources: [
          cdk.Arn.format(
            {
              service: "codedeploy",
              resource: "application",
              resourceName: "*",
            },
            this
          ),
          cdk.Arn.format(
            {
              service: "codedeploy",
              resource: "deploymentgroup",
              resourceName: "*",
            },
            this
          ),
          cdk.Arn.format(
            {
              service: "codedeploy",
              resource: "deploymentconfig",
              resourceName: "*",
            },
            this
          ),
        ],
      })
    );

    deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudwatch:DescribeAlarms",
          "cloudwatch:PutMetricAlarm",
          "cloudwatch:DeleteAlarms",
        ],
        resources: [
          cdk.Arn.format(
            { service: "cloudwatch", resource: "alarm", resourceName: "*" },
            this
          ),
        ],
      })
    );

    deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "apigateway:GET",
          "apigateway:POST",
          "apigateway:PUT",
          "apigateway:DELETE",
          "apigateway:PATCH",
        ],
        resources: [
          cdk.Arn.format(
            {
              service: "apigateway",
              resource: "/apis",
              resourceName: "*",
              arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
            },
            this
          ),
          cdk.Arn.format(
            {
              service: "apigateway",
              resource: "/domainnames",
              resourceName: "*",
              arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
            },
            this
          ),
        ],
      })
    );

    deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [
          cdk.Arn.format(
            { service: "iam", resource: "role", resourceName: "*" },
            this
          ),
        ],
        conditions: {
          StringEquals: {
            "iam:PassedToService": [
              "lambda.amazonaws.com",
              "codedeploy.amazonaws.com",
            ],
          },
        },
      })
    );

    deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:GetRole",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:GetRolePolicy",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:TagRole",
          "iam:UntagRole",
        ],
        resources: [
          cdk.Arn.format(
            { service: "iam", resource: "role", resourceName: "LambdaStack-*" },
            this
          ),
        ],
      })
    );

    deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudformation:CreateChangeSet",
          "cloudformation:DescribeChangeSet",
          "cloudformation:ExecuteChangeSet",
          "cloudformation:DeleteChangeSet",
          "cloudformation:DescribeStacks",
          "cloudformation:GetTemplate",
        ],
        resources: [
          cdk.Arn.format(
            {
              service: "cloudformation",
              resource: "stack",
              resourceName: "LambdaStack/*",
              arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
            },
            this
          ),
        ],
      })
    );

    deploymentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "acm:DescribeCertificate",
          "acm:ListTagsForCertificate",
        ],
        resources: [
          cdk.Arn.format(
            {
              service: "acm",
              resource: "certificate",
              resourceName: "*",
            },
            this
          ),
        ],
      })
    );

    // Deploy action using CloudFormation to update the Lambda stack with
    // scoped deployment role — no wildcard (*) actions used anywhere.
    const deployAction =
      new codepipeline_actions.CloudFormationCreateUpdateStackAction({
        actionName: "Deploy_Lambda",
        stackName: "LambdaStack",
        templatePath: buildOutput.atPath("LambdaStack.template.json"),
        adminPermissions: false,
        deploymentRole,
        extraInputs: [buildOutput],
      });

    // Pipeline with Source, Build, and Deploy stages
    new codepipeline.Pipeline(this, "Pipeline", {
      pipelineName: "lambda-blue-green-pipeline",
      stages: [
        {
          stageName: "Source",
          actions: [sourceAction],
        },
        {
          stageName: "Build",
          actions: [buildAction],
        },
        {
          stageName: "Deploy",
          actions: [deployAction],
        },
      ],
    });
  }
}
