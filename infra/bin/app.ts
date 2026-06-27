#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ApiStack } from "../lib/api-stack";
import { JobsStack } from "../lib/jobs-stack";
import { WebStack } from "../lib/web-stack";
import { OidcStack } from "../lib/oidc-stack";

const app = new cdk.App();

const env: cdk.Environment = {
  account: "466850516129",
  region: "us-east-1",
};

const DOMAIN_NAME = "cooking.caseyhunter.net";
const HOSTED_ZONE = "caseyhunter.net";
const FROM_EMAIL = "cooking@caseyhunter.net";
// One-time OIDC setup for GitHub Actions → AWS
new OidcStack(app, "CookingOidc", { env, githubRepo: "cbgunter/cooking" });

const apiStack = new ApiStack(app, "CookingApi", {
  env,
  domainName: DOMAIN_NAME,
});

new JobsStack(app, "CookingJobs", {
  env,
  table: apiStack.table,
  fromEmail: FROM_EMAIL,
});

new WebStack(app, "CookingWeb", {
  env,
  domainName: DOMAIN_NAME,
  hostedZoneName: HOSTED_ZONE,
});
