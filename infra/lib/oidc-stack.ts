import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface OidcStackProps extends cdk.StackProps {
  /** GitHub org/repo e.g. "cbgunter/cooking" */
  githubRepo: string;
  /** ARNs that the deploy role must be able to access */
  managedPolicyArns?: string[];
}

export class OidcStack extends cdk.Stack {
  public readonly deployRoleArn: string;

  constructor(scope: Construct, id: string, props: OidcStackProps) {
    super(scope, id, props);

    // Import the existing OIDC provider (only one per URL is allowed per account)
    const oidcProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GithubProvider",
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`
    );

    const deployRole = new iam.Role(this, "DeployRole", {
      roleName: "cooking-github-deploy",
      assumedBy: new iam.WebIdentityPrincipal(oidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `repo:${props.githubRepo}:*`,
        },
      }),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
      maxSessionDuration: cdk.Duration.hours(1),
    });

    this.deployRoleArn = deployRole.roleArn;

    new cdk.CfnOutput(this, "DeployRoleArn", { value: deployRole.roleArn });
  }
}
