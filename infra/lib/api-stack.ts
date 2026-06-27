import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";

interface ApiStackProps extends cdk.StackProps {
  domainName: string;
}

export class ApiStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly apiUrl: string;
  public readonly generateLambdaArn: string;
  public readonly anthropicSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // ── DynamoDB ──────────────────────────────────────────────────────────
    this.table = new dynamodb.Table(this, "Table", {
      tableName: "cooking-household",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Cognito ───────────────────────────────────────────────────────────
    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "cooking-users",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.userPoolClient = this.userPool.addClient("WebClient", {
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: [`https://${props.domainName}`, "http://localhost:5173"],
      },
    });

    // ── Secrets Manager ───────────────────────────────────────────────────
    this.anthropicSecret = new secretsmanager.Secret(this, "AnthropicKey", {
      secretName: "cooking/anthropic-api-key",
      description: "Anthropic API key — set manually after deploy",
    });

    // ── Shared esbuild bundling config ────────────────────────────────────
    const bundling = {
      format: OutputFormat.CJS,
      sourceMap: true,
      esbuildOptions: {
        alias: {
          "@cooking/core": path.join(__dirname, "../../packages/core/src/index.ts"),
          "@cooking/ai": path.join(__dirname, "../../packages/ai/src/index.ts"),
        },
      },
    };

    // ── Generate Lambda ───────────────────────────────────────────────────
    const generateFn = new NodejsFunction(this, "GenerateFn", {
      functionName: "cooking-generate",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: cdk.Duration.minutes(5),
      entry: path.join(__dirname, "../../services/jobs/src/generate.ts"),
      handler: "handler",
      bundling,
      environment: {
        TABLE_NAME: this.table.tableName,
        ANTHROPIC_SECRET_ARN: this.anthropicSecret.secretArn,
      },
    });

    this.table.grantReadWriteData(generateFn);
    this.anthropicSecret.grantRead(generateFn);
    this.generateLambdaArn = generateFn.functionArn;

    // ── API Lambda ────────────────────────────────────────────────────────
    const apiFn = new NodejsFunction(this, "ApiFn", {
      functionName: "cooking-api",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(29),
      entry: path.join(__dirname, "../../services/api/src/handler.ts"),
      handler: "handler",
      bundling,
      environment: {
        TABLE_NAME: this.table.tableName,
        GENERATE_LAMBDA_ARN: generateFn.functionArn,
      },
    });

    this.table.grantReadWriteData(apiFn);
    generateFn.grantInvoke(apiFn);

    // ── REST API (stable, no alpha deps) ─────────────────────────────────
    const api = new apigateway.RestApi(this, "RestApi", {
      restApiName: "cooking-api",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Authorization", "Content-Type"],
      },
    });

    const auth = new apigateway.CognitoUserPoolsAuthorizer(this, "CognitoAuth", {
      cognitoUserPools: [this.userPool],
    });

    const integration = new apigateway.LambdaIntegration(apiFn, { proxy: true });
    const methodOptions: apigateway.MethodOptions = {
      authorizer: auth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // Root + catch-all proxy resource
    api.root.addMethod("ANY", integration, methodOptions);
    const proxy = api.root.addProxy({ anyMethod: false });
    proxy.addMethod("ANY", integration, methodOptions);

    // CORS headers on gateway-level error responses (e.g. 401 from Cognito authorizer)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "'*'",
      "Access-Control-Allow-Headers": "'Authorization,Content-Type'",
    };
    new apigateway.GatewayResponse(this, "Unauthorized", {
      restApi: api,
      type: apigateway.ResponseType.UNAUTHORIZED,
      responseHeaders: corsHeaders,
    });
    new apigateway.GatewayResponse(this, "Default4xx", {
      restApi: api,
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: corsHeaders,
    });
    new apigateway.GatewayResponse(this, "Default5xx", {
      restApi: api,
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: corsHeaders,
    });

    this.apiUrl = api.url;

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: this.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "TableName", { value: this.table.tableName });
    new cdk.CfnOutput(this, "AnthropicSecretArn", { value: this.anthropicSecret.secretArn });
  }
}
