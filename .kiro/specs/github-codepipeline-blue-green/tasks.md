# Implementation Plan: GitHub CodePipeline Blue/Green Deployment

## Overview

This plan implements a two-subproject repository demonstrating GitHub-triggered AWS CodePipeline with blue/green deployment of a Lambda function. The CDK subproject defines all infrastructure (pipeline, Lambda, API Gateway, CodeDeploy, custom domain). The Lambda subproject is a self-contained TypeScript application returning colored HTML based on an environment variable. Tasks are ordered to build foundational pieces first (Lambda handler, then CDK stacks), wire them together, and validate incrementally.

## Tasks

- [x] 1. Set up Lambda subproject structure and implement handler
  - [x] 1.1 Create Lambda subproject scaffolding
    - Create `lambda/` directory with `package.json`, `tsconfig.json`
    - `package.json` should include `build` and `test` scripts, TypeScript and Jest dev dependencies, and `@types/aws-lambda` for type definitions
    - `tsconfig.json` should target ES2022, use NodeNext module resolution, and output to `dist/`
    - _Requirements: 1.2, 1.4, 1.5_

  - [x] 1.2 Implement Lambda handler
    - Create `lambda/src/handler.ts`
    - Read `COLOR` environment variable
    - Validate value is "blue" or "green"
    - Return HTTP 200 with HTML body containing inline CSS `background-color` and visible text displaying the color
    - Return HTTP 500 with error HTML if COLOR is missing or invalid, including the invalid value in the error message
    - Use `APIGatewayProxyEventV2` and `APIGatewayProxyResultV2` types
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 1.3 Write unit tests for Lambda handler
    - Create `lambda/tests/handler.test.ts`
    - Test: returns 200 with blue HTML when COLOR="blue"
    - Test: returns 200 with green HTML when COLOR="green"
    - Test: returns 500 when COLOR is missing
    - Test: returns 500 when COLOR is invalid (e.g., "red", "", "BLUE")
    - Test: Content-Type is always "text/html"
    - Test: HTML body contains visible color text
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7_

  - [ ]* 1.4 Write property test: valid color produces correct HTML response
    - **Property 1: Valid color produces correct HTML response**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.7**
    - Use fast-check to generate valid colors from {"blue", "green"}
    - Assert response has statusCode 200, Content-Type "text/html", background-color in body, visible color text

  - [ ]* 1.5 Write property test: invalid or missing color produces error response
    - **Property 2: Invalid or missing color produces error response**
    - **Validates: Requirements 5.5, 5.6**
    - Use fast-check to generate arbitrary strings filtered to exclude "blue" and "green", plus undefined
    - Assert response has statusCode 500 and body contains error message

- [x] 2. Checkpoint - Validate Lambda subproject
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Set up CDK subproject structure and entry point
  - [x] 3.1 Create CDK subproject scaffolding
    - Create `cdk/` directory with `package.json`, `tsconfig.json`, `cdk.json`
    - `package.json` should include CDK v2 dependencies (`aws-cdk-lib`, `constructs`), Jest with `ts-jest`, and build/test/synth scripts
    - `cdk.json` should reference `bin/app.ts` as the app entry point
    - _Requirements: 1.1, 1.3, 1.5_

  - [x] 3.2 Implement CDK app entry point with parameter validation
    - Create `cdk/bin/app.ts`
    - Read `domainName`, `certificateArn`, `color` from CDK context (`app.node.tryGetContext`)
    - Fail synthesis with descriptive error if `domainName` is missing
    - Fail synthesis with descriptive error if `certificateArn` is missing
    - Validate `color` is "blue" or "green"; fail with error if invalid
    - Default `color` to "blue" if not provided
    - Instantiate LambdaStack and PipelineStack (stubs initially)
    - _Requirements: 6.3, 6.7, 8.1, 8.4, 8.5_

- [x] 4. Implement Lambda infrastructure stack
  - [x] 4.1 Implement Lambda function and alias in CDK
    - Create `cdk/lib/lambda-stack.ts`
    - Define Lambda function with Node.js 20.x runtime, handler from `lambda/` subproject build output
    - Set COLOR environment variable from the `color` context parameter
    - Define a Lambda alias named "live" for CodeDeploy traffic shifting
    - Configure appropriate memory size and timeout
    - _Requirements: 4.5, 5.4, 7.2, 8.2_

  - [x] 4.2 Implement API Gateway HTTP API with custom domain
    - Add HTTP API (API Gateway v2) with a default route proxying to the Lambda function alias
    - Configure custom domain using `domainName` parameter with ACM certificate from `certificateArn`
    - Create API mapping from custom domain to API stage at root path
    - Add CloudFormation outputs: API Gateway regional domain name, API endpoint URL, Lambda function ARN
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6_

  - [x] 4.3 Implement CodeDeploy blue/green deployment resources
    - Define CodeDeploy Lambda application
    - Define Lambda deployment group with LambdaLinear10PercentEvery1Minute traffic shifting
    - Configure the "live" alias as the deployment target
    - Define CloudWatch alarm monitoring Lambda function errors metric
    - Configure the alarm as the rollback trigger for the deployment group
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.3_

- [x] 5. Implement Pipeline stack
  - [x] 5.1 Implement CodePipeline with source and build stages
    - Create `cdk/lib/pipeline-stack.ts`
    - Define CodePipeline with three stages
    - Configure Source stage with CodeStar Connections source action watching `main` branch
    - Configure Build stage with CodeBuild project using a buildspec that runs `cd lambda && npm ci && npm run build` and produces a zip artifact
    - Set CodeBuild timeout to 10 minutes
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.4, 3.5, 7.1_

  - [x] 5.2 Implement Deploy stage with CodeDeploy action
    - Add Deploy stage with CodeDeploy deploy action referencing the deployment group from the Lambda stack
    - Wire the build output artifact as input to the deploy action
    - _Requirements: 4.1, 7.1_

  - [x] 5.3 Configure IAM roles with least privilege
    - Define IAM roles for Pipeline, CodeBuild, CodeDeploy, and Lambda
    - Ensure no role uses wildcard (*) actions or wildcard (*) resources
    - Grant CodeBuild permissions to access source artifact and produce build artifact
    - Grant CodeDeploy permissions to update Lambda alias and function
    - Grant Lambda execution role permissions for CloudWatch Logs
    - _Requirements: 7.4_

- [x] 6. Checkpoint - Validate CDK synthesis
  - Ensure `cdk synth` produces a valid CloudFormation template without errors. Ask the user if questions arise.

- [ ] 7. CDK infrastructure tests
  - [ ]* 7.1 Write CDK snapshot and assertion tests
    - Create `cdk/test/lambda-stack.test.ts` and `cdk/test/pipeline-stack.test.ts`
    - Verify Lambda function uses Node.js 20.x runtime
    - Verify Lambda has COLOR environment variable
    - Verify API Gateway HTTP API exists with route to Lambda
    - Verify custom domain configured with ACM certificate
    - Verify CodeDeploy deployment group uses LambdaLinear10PercentEvery1Minute
    - Verify CloudWatch alarm monitors Lambda errors
    - Verify pipeline has three stages: Source, Build, Deploy
    - Verify IAM policies contain no wildcard actions or resources
    - Verify CloudFormation outputs include API Gateway domain name
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 7.2 Write CDK validation tests for context parameters
    - Test synthesis fails when `domainName` context is missing
    - Test synthesis fails when `certificateArn` context is missing
    - Test synthesis fails when `color` is invalid (e.g., "red")
    - Test default color is "blue" when not specified
    - _Requirements: 6.7, 8.4, 8.5_

- [x] 8. Lambda build configuration and wiring
  - [x] 8.1 Configure Lambda build script to produce zip artifact
    - Update `lambda/package.json` build script to compile TypeScript to `dist/` and produce a zip package
    - Ensure the zip contains compiled JS and runtime dependencies suitable for Lambda deployment
    - Verify build completes successfully independently from the CDK subproject
    - _Requirements: 1.4, 1.5, 3.4_

  - [x] 8.2 Wire CDK Lambda function to use Lambda subproject build output
    - Ensure the CDK Lambda function definition references the Lambda subproject's compiled output correctly (using CDK bundling or asset path)
    - Verify end-to-end: `cdk synth` succeeds with a Lambda asset pointing to the correct code
    - _Requirements: 3.1, 7.2, 7.5, 7.6_

- [x] 9. Final checkpoint - Full validation
  - Ensure all tests pass (Lambda unit/property tests, CDK assertion tests), `cdk synth` succeeds, and both subprojects build independently. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The CDK infrastructure tests use `aws-cdk-lib/assertions` for template verification
- Both subprojects must build independently without cross-dependencies (Requirement 1.5)
- IAM roles must follow least privilege with no wildcard actions or resources (Requirement 7.4)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "3.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3"] },
    { "id": 6, "tasks": ["7.1", "7.2", "8.1"] },
    { "id": 7, "tasks": ["8.2"] }
  ]
}
```
