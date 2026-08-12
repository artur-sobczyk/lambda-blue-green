# Requirements Document

## Introduction

This feature demonstrates the integration between GitHub and AWS CodePipeline with blue/green deployment of a Lambda function. The project consists of two subprojects: a CDK project that defines the CodePipeline infrastructure, and a Lambda project that serves an HTML page via API Gateway with a custom domain. The Lambda response body color (blue or green) is controlled by a project parameter, showcasing blue/green deployment in action.

## Glossary

- **CDK_Project**: The AWS CDK application that defines the CodePipeline, deployment infrastructure, and all supporting AWS resources.
- **Lambda_Project**: The AWS Lambda function subproject that serves HTML content through API Gateway.
- **Pipeline**: The AWS CodePipeline instance that orchestrates the build and deployment workflow triggered by GitHub pushes.
- **Lambda_Function**: The AWS Lambda function that returns an HTML page with a colored body.
- **API_Gateway**: The Amazon API Gateway that exposes the Lambda_Function via HTTPS with a custom domain.
- **Custom_Domain**: A user-provided domain name passed as a CDK parameter, used to configure API Gateway with a custom domain endpoint.
- **Color_Parameter**: A project parameter that determines whether the Lambda_Function returns a blue or green HTML page body.
- **Blue_Green_Deployment**: A deployment strategy where a new version of the Lambda_Function is deployed alongside the existing version, and traffic is shifted from the old version to the new version.
- **Source_Stage**: The first stage of the Pipeline that monitors the GitHub repository for code changes.
- **Build_Stage**: The Pipeline stage that compiles and packages the Lambda_Project artifacts.
- **Deploy_Stage**: The Pipeline stage that performs the blue/green deployment of the Lambda_Function.

## Requirements

### Requirement 1: Repository Structure

**User Story:** As a developer, I want the repository to contain two clearly separated subprojects, so that the infrastructure code and application code are independently maintainable.

#### Acceptance Criteria

1. THE CDK_Project SHALL reside in a dedicated subdirectory at the repository root.
2. THE Lambda_Project SHALL reside in a dedicated subdirectory at the repository root, separate from the CDK_Project.
3. THE CDK_Project SHALL be a valid AWS CDK application containing a CDK entry point configuration file, a dependency manifest file, and TypeScript source files that define at least one CDK stack.
4. THE Lambda_Project SHALL be a self-contained project containing its own dependency manifest file, a build script that produces a deployable artifact, and TypeScript source files, without referencing or importing modules from the CDK_Project.
5. WHEN a developer installs dependencies and runs the build command within either subproject directory, THE build SHALL complete successfully without requiring files or installed dependencies from the other subproject.

### Requirement 2: GitHub Source Integration

**User Story:** As a developer, I want pushes to the GitHub repository to trigger the CodePipeline, so that deployments are automated on every code change.

#### Acceptance Criteria

1. WHEN code is pushed to the "main" branch of the GitHub repository, THE Pipeline SHALL start a new execution.
2. WHEN the Source_Stage executes, THE Source_Stage SHALL produce an output artifact containing the repository source code at the commit that triggered the pipeline execution.
3. THE Pipeline SHALL use a GitHub connection (AWS CodeStar Connections) for repository access.
4. IF the GitHub connection is unavailable, THEN THE Pipeline SHALL fail the Source_Stage with an error indicating the connection failure reason.
5. IF the Source_Stage fails to retrieve the source code, THEN THE Pipeline SHALL not proceed to subsequent stages.

### Requirement 3: Build Stage

**User Story:** As a developer, I want the pipeline to build and package the Lambda project automatically, so that deployment artifacts are produced without manual intervention.

#### Acceptance Criteria

1. WHEN the Source_Stage completes successfully, THE Build_Stage SHALL receive the source artifact as input, compile the TypeScript Lambda_Project, and package it into a zip deployment artifact.
2. THE Build_Stage SHALL use AWS CodeBuild with a buildspec that installs dependencies, compiles TypeScript source code, and produces a zip package suitable for Lambda deployment.
3. IF the build fails, THEN THE Pipeline SHALL stop execution and transition to a failed state visible in the AWS CodePipeline console.
4. THE Build_Stage SHALL produce an output artifact containing the compiled Lambda_Function code and its runtime dependencies packaged as a zip file.
5. IF the Build_Stage does not complete within 10 minutes, THEN THE Pipeline SHALL treat the build as failed and stop execution.

### Requirement 4: Blue/Green Deployment

**User Story:** As a developer, I want the pipeline to perform blue/green deployment of the Lambda function, so that I can demonstrate zero-downtime deployments with traffic shifting.

#### Acceptance Criteria

1. WHEN the Build_Stage completes successfully, THE Deploy_Stage SHALL perform a blue/green deployment of the Lambda_Function using a CodeDeploy Lambda deployment group.
2. THE Deploy_Stage SHALL use AWS CodeDeploy with a Lambda deployment group configured for linear traffic shifting that shifts 10 percent of traffic every 1 minute (LambdaLinear10PercentEvery1Minute).
3. THE Deploy_Stage SHALL shift traffic from the current Lambda_Function version to the newly deployed version through the configured Lambda alias.
4. IF a CodeDeploy-monitored CloudWatch alarm enters ALARM state during traffic shifting, THEN THE Deploy_Stage SHALL automatically roll back traffic to the previous Lambda_Function version within 5 minutes and report the deployment as failed.
5. THE CDK_Project SHALL configure a Lambda alias that CodeDeploy uses to manage traffic shifting between versions.
6. THE CDK_Project SHALL configure a CloudWatch alarm monitoring Lambda_Function errors that CodeDeploy uses as the rollback trigger during deployment.

### Requirement 5: Lambda Function Behavior

**User Story:** As a developer, I want the Lambda function to return an HTML page with a body colored blue or green based on a parameter, so that I can visually verify which deployment version is serving traffic.

#### Acceptance Criteria

1. WHEN the Lambda_Function receives a request, THE Lambda_Function SHALL return an API Gateway proxy integration response with a status code of 200, a Content-Type header set to text/html, and an HTML body.
2. IF the Color_Parameter is set to "blue", THEN THE Lambda_Function SHALL return an HTML page with the body background color set to blue using an inline CSS style.
3. IF the Color_Parameter is set to "green", THEN THE Lambda_Function SHALL return an HTML page with the body background color set to green using an inline CSS style.
4. THE Lambda_Function SHALL read the Color_Parameter from the Lambda environment variable at invocation time.
5. THE Color_Parameter SHALL accept only the values "blue" or "green".
6. IF the Color_Parameter is not set or contains a value other than "blue" or "green", THEN THE Lambda_Function SHALL return a response with a status code of 500 and a body containing an error message indicating the invalid or missing color configuration.
7. WHEN the Lambda_Function returns a successful response, THE Lambda_Function SHALL include visible text in the HTML body that displays the current value of the Color_Parameter.

### Requirement 6: API Gateway with Custom Domain

**User Story:** As a developer, I want the Lambda function exposed via API Gateway with a custom domain, so that the deployment is accessible through a user-friendly URL.

#### Acceptance Criteria

1. THE API_Gateway SHALL expose the Lambda_Function as an HTTPS endpoint.
2. THE API_Gateway SHALL be configured with the Custom_Domain provided as a CDK parameter, mapping the domain to the root path ("/") of the API stage.
3. THE CDK_Project SHALL accept the Custom_Domain as a required CDK context parameter and the ACM_Certificate_ARN as a required CDK context parameter.
4. WHEN a request is made to the Custom_Domain, THE API_Gateway SHALL route the request to the Lambda_Function using a proxy integration.
5. THE CDK_Project SHALL output the API Gateway domain name as a CloudFormation output so that the developer can configure a DNS CNAME or alias record pointing the Custom_Domain to the API Gateway endpoint.
6. THE API_Gateway SHALL use the ACM certificate identified by the ACM_Certificate_ARN parameter as the TLS certificate for the Custom_Domain.
7. IF the Custom_Domain or ACM_Certificate_ARN context parameter is not provided, THEN THE CDK_Project SHALL fail synthesis with an error message indicating which required parameter is missing.

### Requirement 7: CDK Pipeline Definition

**User Story:** As a developer, I want the entire pipeline and deployment infrastructure defined in CDK, so that the infrastructure is version-controlled and reproducible.

#### Acceptance Criteria

1. THE CDK_Project SHALL define the Pipeline with Source_Stage connected to a code repository, Build_Stage containing a CodeBuild action, and Deploy_Stage containing a CodeDeploy deployment action.
2. THE CDK_Project SHALL define the Lambda_Function with a specified runtime, handler, memory size, and timeout, the API_Gateway with at least one route pointing to the Lambda_Function, and the Custom_Domain with a domain name and certificate.
3. THE CDK_Project SHALL define the CodeDeploy application and deployment group configured for blue/green deployment with traffic shifting between the previous and new Lambda_Function versions.
4. THE CDK_Project SHALL define IAM roles for the Pipeline, CodeBuild, CodeDeploy, and Lambda_Function where no role uses wildcard (*) actions or wildcard (*) resources in its policy statements.
5. WHEN a developer runs `cdk synth`, THE CDK_Project SHALL produce a valid CloudFormation template without errors.
6. THE CDK_Project SHALL be deployable by running `cdk deploy` without requiring manual creation of prerequisite resources outside the CDK stack.

### Requirement 8: Color Parameter Configuration

**User Story:** As a developer, I want the deployment color controlled by a project parameter, so that I can deploy either the blue or green version by changing a single configuration value.

#### Acceptance Criteria

1. THE Color_Parameter SHALL accept only the values "blue" or "green" and be configurable as a CDK context value that is set as a Lambda environment variable during deployment.
2. THE CDK_Project SHALL pass the Color_Parameter value to the Lambda_Function as an environment variable during stack deployment.
3. WHEN a developer changes the Color_Parameter value and pushes to GitHub, THE Pipeline SHALL deploy the Lambda_Function with the updated color environment variable.
4. IF no explicit Color_Parameter value is provided, THEN THE CDK_Project SHALL use "blue" as the default value.
5. IF the Color_Parameter value is not "blue" or "green", THEN THE CDK_Project SHALL fail deployment with an error message indicating the invalid color value.
