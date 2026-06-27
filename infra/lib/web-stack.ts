import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import * as path from "path";
import * as fs from "fs";

interface WebStackProps extends cdk.StackProps {
  domainName: string;
  hostedZoneName: string;
}

export class WebStack extends cdk.Stack {
  public readonly distributionId: string;
  public readonly bucketName: string;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    // ── Route53 hosted zone ───────────────────────────────────────────────
    const zone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: props.hostedZoneName,
    });

    // ── ACM certificate (us-east-1 for CloudFront) ────────────────────────
    const cert = new acm.Certificate(this, "Cert", {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // ── S3 bucket for web assets ──────────────────────────────────────────
    const bucket = new s3.Bucket(this, "WebBucket", {
      bucketName: `cooking-web-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ── CloudFront OAI ────────────────────────────────────────────────────
    const oai = new cloudfront.OriginAccessIdentity(this, "OAI");
    bucket.grantRead(oai);

    // ── CloudFront distribution ───────────────────────────────────────────
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      domainNames: [props.domainName],
      certificate: cert,
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: new cloudfrontOrigins.S3Origin(bucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    this.distributionId = distribution.distributionId;
    this.bucketName = bucket.bucketName;

    // ── Route53 alias record ──────────────────────────────────────────────
    new route53.ARecord(this, "AliasRecord", {
      zone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution)
      ),
    });

    // ── Deploy web assets (skipped if dist/ doesn't exist yet) ───────────
    const distPath = path.join(__dirname, "../../apps/web/dist");
    if (fs.existsSync(distPath)) {
      new s3deploy.BucketDeployment(this, "DeployWeb", {
        sources: [s3deploy.Source.asset(distPath)],
        destinationBucket: bucket,
        distribution,
        distributionPaths: ["/*"],
      });
    }

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "DistributionId", { value: distribution.distributionId });
    new cdk.CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new cdk.CfnOutput(this, "Url", { value: `https://${props.domainName}` });
  }
}
