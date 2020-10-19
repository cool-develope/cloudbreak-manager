import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import { CfnOutput, Duration } from '@aws-cdk/core';
import { CloudFrontWebDistribution, OriginProtocolPolicy, CloudFrontAllowedMethods } from '@aws-cdk/aws-cloudfront';

export class AppStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const {
      MANAGE_WEB_BUCKET_NAME = '',
      SIGNIN_WEB_URL = '',
      APPSYNC_DOMAIN = '',
      MAIN_TABLE_NAME = '',
      DICTIONARY_TABLE_NAME = '',
    } = process.env;

    const bucketRefererHeader = 'cccy6qoNAILX9okX607t';
    const bucket = this.createS3Bucket(process.env.MANAGE_WEB_BUCKET_NAME || '', bucketRefererHeader);
    const distribution = this.createCloudFront(bucket.bucketWebsiteDomainName, bucketRefererHeader);
  }

  createS3Bucket(bucketName: string, bucketRefererHeader: string) {
    const bucket = new s3.Bucket(this, 'S3Bucket', {
      bucketName,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
    });

    const bucketPolicy = bucket.grantPublicAccess('*', 's3:GetObject');
    bucketPolicy.resourceStatement!.addResources(bucket.bucketArn);
    bucketPolicy.resourceStatement!.sid = 'AllowByRefererHeader';
    bucketPolicy.resourceStatement!.addCondition('StringEquals', {
      'aws:Referer': bucketRefererHeader,
    });

    return bucket;
  }

  createCloudFront(domainName: string, refererHeader: string) {
    const distribution = new CloudFrontWebDistribution(this, 'CloudFront', {
      originConfigs: [
        {
          customOriginSource: {
            domainName,
            originProtocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
          },
          behaviors: [
            {
              isDefaultBehavior: true,
              // defaultTtl: Duration.seconds(0),
              // maxTtl: Duration.seconds(0),
              // minTtl: Duration.seconds(0),
            },
          ],
          originHeaders: {
            Referer: refererHeader,
          },
        },
      ],
    });

    new CfnOutput(this, `CloudFrontDomain`, { value: distribution.distributionDomainName });

    return distribution;
  }
}
