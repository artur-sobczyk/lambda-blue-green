# Lambda Blue/Green Deployment

AWS Lambda blue/green deployment demo using CodePipeline, CodeDeploy, and API Gateway with a custom domain.

Push to `main` triggers the pipeline: source → build → deploy with linear 50% traffic shifting per minute.

## Architecture

```
GitHub push → CodePipeline → CodeBuild (compile TS) → CodeDeploy (50%/min traffic shift)
                                                            ↓
                                              Lambda (blue or green HTML)
                                                            ↓
                                              API Gateway HTTP API
                                                            ↓
                                              Custom Domain (HTTPS)
```

**Components:**

- **Lambda Function** — Returns an HTML page with background color (blue or green) based on `COLOR` environment variable. Logs source IP and user-agent on every invocation.
- **API Gateway HTTP API** — Proxies requests to the Lambda alias with a custom domain and ACM certificate.
- **CodeDeploy** — Manages blue/green traffic shifting (50% per minute) with automatic rollback on errors.
- **CodePipeline** — Three-stage pipeline (Source → Build → Deploy) triggered by GitHub pushes.
- **CloudWatch Alarm** — Monitors Lambda errors; triggers CodeDeploy rollback during deployment.

## Project Structure

```
lambda-blue-green/
├── cdk/              # CDK infrastructure (Pipeline, Lambda, API GW, CodeDeploy)
│   ├── bin/app.ts    # Entry point — reads context params, instantiates stacks
│   └── lib/
│       ├── lambda-stack.ts    # Lambda, API Gateway, custom domain, CodeDeploy
│       └── pipeline-stack.ts  # CodePipeline with Source/Build/Deploy stages
├── lambda/           # Lambda function (TypeScript)
│   └── src/handler.ts
└── README.md
```

## Prerequisites

- Node.js 20+
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS CLI configured with credentials
- ACM certificate covering your domain (in the deployment region)
- GitHub connection set up in AWS CodeStar Connections (for the pipeline)

## CDK Context Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `domainName` | Yes | — | Custom domain (e.g. `blue-green-lambda.sircloud.com`) |
| `certificateArn` | Yes | — | ACM certificate ARN for the domain |
| `color` | No | `blue` | Lambda response color (`blue` or `green`) |
| `repositoryOwner` | No | `owner` | GitHub org/user |
| `repositoryName` | No | `lambda-blue-green` | GitHub repo name |
| `connectionArn` | No | auto-created | Existing CodeStar Connection ARN |

## Deploy from Local

### 1. Build the Lambda subproject

```powershell
Set-Location lambda
npm ci
npm run build
Set-Location ..
```

### 2. Install CDK dependencies

```powershell
Set-Location cdk
npm ci
Set-Location ..
```

### 3. Bootstrap CDK (first time only)

```powershell
Set-Location cdk
npx cdk bootstrap
Set-Location ..
```

### 4. Deploy both stacks

```powershell
Set-Location cdk
npx cdk deploy --all `
  --context domainName=blue-green-lambda.sircloud.com `
  --context certificateArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID `
  --context color=blue `
  --context repositoryOwner=YOUR_GITHUB_USER `
  --context repositoryName=lambda-blue-green
Set-Location ..
```

### 5. Configure DNS

After deploy, grab the `ApiGatewayDomainName` output and create a CNAME record:

```
blue-green-lambda.sircloud.com → <ApiGatewayDomainName output value>
```

## Switch Color (trigger blue/green deployment)

Change the `color` context and redeploy:

```powershell
Set-Location cdk
npx cdk deploy LambdaStack `
  --context domainName=blue-green-lambda.sircloud.com `
  --context certificateArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID `
  --context color=green
Set-Location ..
```

CodeDeploy shifts 50% of traffic to the new version after 1 minute, then completes at 2 minutes. If the Lambda errors alarm fires during shifting, traffic automatically rolls back.

## Useful Commands

```powershell
# Synthesize CloudFormation templates
Set-Location cdk; npx cdk synth --context domainName=... --context certificateArn=...

# Diff changes before deploying
Set-Location cdk; npx cdk diff --all --context domainName=... --context certificateArn=...

# Destroy all stacks
Set-Location cdk; npx cdk destroy --all --context domainName=... --context certificateArn=...
```

## Deployment Strategy

CodeDeploy uses **Linear 50% every 1 minute** — the new Lambda version receives 50% of traffic after 1 minute, then 100% after 2 minutes. A CloudWatch alarm on Lambda errors triggers automatic rollback if issues are detected during the shift.
