import * as cdk from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";
import type { Table } from "aws-cdk-lib/aws-dynamodb";

interface JobsStackProps extends cdk.StackProps {
  table: Table;
  fromEmail: string;
}

export class JobsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: JobsStackProps) {
    super(scope, id, props);

    const sharedBundling = {
      format: OutputFormat.CJS,
      sourceMap: true,
      esbuildOptions: {
        alias: {
          "@cooking/core": path.join(__dirname, "../../packages/core/src/index.ts"),
          "@cooking/ai": path.join(__dirname, "../../packages/ai/src/index.ts"),
        },
      },
    };

    // ── Reminders Lambda ──────────────────────────────────────────────────
    const remindersFn = new NodejsFunction(this, "RemindersFn", {
      functionName: "cooking-reminders",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      entry: path.join(__dirname, "../../services/jobs/src/reminders.ts"),
      handler: "handler",
      bundling: sharedBundling,
      environment: {
        TABLE_NAME: props.table.tableName,
        FROM_EMAIL: props.fromEmail,
      },
    });

    props.table.grantReadData(remindersFn);
    remindersFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail"],
        resources: ["*"],
      })
    );

    // ── EventBridge rule: Thu–Sun at 15:00 UTC (≈09:00 CST) ──────────────
    // EventBridge cron day-of-week: SUN=1, MON=2, TUE=3, WED=4, THU=5, FRI=6, SAT=7
    new events.Rule(this, "ReminderSchedule", {
      ruleName: "cooking-reminders",
      schedule: events.Schedule.cron({ minute: "0", hour: "15", weekDay: "5,6,7,1" }),
      targets: [new targets.LambdaFunction(remindersFn)],
    });
  }
}
