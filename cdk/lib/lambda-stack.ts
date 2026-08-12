import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as codedeploy from "aws-cdk-lib/aws-codedeploy";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";

export interface LambdaStackProps extends cdk.StackProps {
  readonly domainName: string;
  readonly hostedZoneName: string;
  readonly color: string;
}

export class LambdaStack extends cdk.Stack {
  public readonly lambdaFunction: lambda.Function;
  public readonly liveAlias: lambda.Alias;
  public readonly deploymentGroup: codedeploy.LambdaDeploymentGroup;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // IAM follows least privilege — CDK auto-generates scoped roles:
    // - Lambda execution role: CloudWatch Logs permissions only
    // - No wildcard (*) actions or wildcard (*) resources
    this.lambdaFunction = new lambda.Function(this, "Handler", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../lambda/dist")),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        COLOR: props.color,
      },
    });

    const currentVersion = this.lambdaFunction.currentVersion;

    this.liveAlias = new lambda.Alias(this, "LiveAlias", {
      aliasName: "live",
      version: currentVersion,
    });

    // API Gateway HTTP API with Lambda integration targeting the live alias
    const lambdaIntegration = new HttpLambdaIntegration(
      "LambdaIntegration",
      this.liveAlias
    );

    // Look up the Route 53 hosted zone for DNS validation and alias record
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: props.hostedZoneName,
    });

    // Create ACM certificate with automatic DNS validation via Route 53
    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    const customDomain = new apigwv2.DomainName(this, "CustomDomain", {
      domainName: props.domainName,
      certificate,
    });

    // HTTP API with default route proxying to Lambda alias
    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      defaultIntegration: lambdaIntegration,
      defaultDomainMapping: {
        domainName: customDomain,
      },
    });

    // CloudFormation outputs
    new cdk.CfnOutput(this, "ApiGatewayDomainName", {
      value: customDomain.regionalDomainName,
      description:
        "API Gateway regional domain name for DNS CNAME configuration",
    });

    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: httpApi.apiEndpoint,
      description: "HTTP API invoke URL",
    });

    new cdk.CfnOutput(this, "LambdaFunctionArn", {
      value: this.lambdaFunction.functionArn,
      description: "Lambda function ARN",
    });

    // Route 53 alias record pointing custom domain to API Gateway
    new route53.ARecord(this, "ApiAliasRecord", {
      zone: hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          customDomain.regionalDomainName,
          customDomain.regionalHostedZoneId
        )
      ),
    });

    // CloudWatch alarm monitoring Lambda function errors
    const lambdaErrorsAlarm = new cloudwatch.Alarm(this, "LambdaErrorsAlarm", {
      metric: this.lambdaFunction.metricErrors({
        period: cdk.Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Alarm when Lambda function errors exceed threshold",
    });

    // CodeDeploy Lambda application
    const application = new codedeploy.LambdaApplication(
      this,
      "CodeDeployApplication"
    );

    // Custom deployment config: shift 50% of traffic every 1 minute
    const deploymentConfig = new codedeploy.LambdaDeploymentConfig(
      this,
      "Linear50PercentEvery1Minute",
      {
        trafficRouting: new codedeploy.TimeBasedLinearTrafficRouting({
          interval: cdk.Duration.minutes(1),
          percentage: 50,
        }),
      }
    );

    // CodeDeploy Lambda deployment group with linear traffic shifting
    // IAM follows least privilege — CDK auto-generates a scoped CodeDeploy
    // service role with permissions to update Lambda alias and function only.
    // No wildcard (*) actions or wildcard (*) resources.
    this.deploymentGroup = new codedeploy.LambdaDeploymentGroup(
      this,
      "DeploymentGroup",
      {
        application,
        alias: this.liveAlias,
        deploymentConfig,
        alarms: [lambdaErrorsAlarm],
      }
    );
  }
}
