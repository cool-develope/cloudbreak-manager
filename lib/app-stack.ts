import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as appsync from '@aws-cdk/aws-appsync';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as cognito from '@aws-cdk/aws-cognito';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as route53 from '@aws-cdk/aws-route53';
import * as route53tg from '@aws-cdk/aws-route53-targets';
import { CfnOutput } from '@aws-cdk/core';
import { Certificate, ICertificate } from '@aws-cdk/aws-certificatemanager';
import { CloudFrontWebDistribution, OriginProtocolPolicy } from '@aws-cdk/aws-cloudfront';
import { UserPoolDefaultAction } from '@aws-cdk/aws-appsync';
import * as helper from './helper';

const SCHEMA_FILE = '../schema.graphql';

export class AppStack extends cdk.Stack {
  private readonly api: appsync.GraphqlApi;
  private readonly mainTableName: string;
  private readonly imagesDomain: string;
  private readonly signinWebUrl: string;
  private readonly cognitoUserpoolId: string;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const {
      MANAGE_WEB_BUCKET_NAME = '',
      SIGNIN_WEB_URL = '',
      MAIN_TABLE_NAME = '',
      COGNITO_USERPOOL_ID = '',
      ZONE_NAME = '',
      ZONE_ID = '',
      US_CERTIFICATE_ARN = '',
    } = process.env;

    this.mainTableName = MAIN_TABLE_NAME;
    this.imagesDomain = `images.${ZONE_NAME}`;
    this.signinWebUrl = SIGNIN_WEB_URL;
    this.cognitoUserpoolId = COGNITO_USERPOOL_ID;
    const domain = `manager.${ZONE_NAME}`;
    const bucketRefererHeader = 'cccy6qoNAILX9okX607t';

    const bucket = this.createS3Bucket(MANAGE_WEB_BUCKET_NAME, bucketRefererHeader);
    /**
     * Create CloudFront
     */
    const certificate = Certificate.fromCertificateArn(this, 'us-certificate', US_CERTIFICATE_ARN);

    const distribution = this.createCloudFrontDistribution(
      bucket.bucketWebsiteDomainName,
      domain,
      certificate,
      bucketRefererHeader
    );

    /**
     * Add record to Route53
     */
    this.createDomainRecord(ZONE_ID, ZONE_NAME, domain, distribution);

    const userPool = cognito.UserPool.fromUserPoolId(this, 'apiUserPool', COGNITO_USERPOOL_ID);
    this.api = this.createAppSync(userPool);
    this.inviteMutation();
  }

  createAppSync(userPool: cognito.IUserPool) {
    const api = new appsync.GraphqlApi(this, 'api-appsync', {
      name: 'manager-api',
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
      },
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool,
            defaultAction: UserPoolDefaultAction.ALLOW,
          },
        },
      },
      schema: appsync.Schema.fromAsset(path.join(__dirname, SCHEMA_FILE)),
      xrayEnabled: true,
    });

    new CfnOutput(this, `AppSyncURL`, { value: api.graphqlUrl });
    return api;
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

  createCloudFrontDistribution(
    bucketWebsiteDomain: string,
    domain: string,
    certificate: ICertificate,
    bucketRefererHeader: string
  ) {
    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'cloudfront-website', {
      originConfigs: [
        {
          customOriginSource: {
            domainName: bucketWebsiteDomain,
            originProtocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          },
          behaviors: [{ isDefaultBehavior: true, compress: true }],
          originHeaders: {
            Referer: bucketRefererHeader,
          },
        },
      ],
      viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(certificate, {
        aliases: [domain],
      }),
    });

    return distribution;
  }

  createDomainRecord(zoneId: string, zoneName: string, domain: string, distribution: CloudFrontWebDistribution) {
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'zone-tifo-sport', {
      hostedZoneId: zoneId,
      zoneName,
    });

    new route53.ARecord(this, `record-${domain}`, {
      zone: hostedZone,
      recordName: domain,
      // @ts-ignore
      target: route53.RecordTarget.fromAlias(new route53tg.CloudFrontTarget(distribution)),
    });
  }

  inviteMutation() {
    const fn = helper.getFunction(this, 'inviteOwner', {
      MAIN_TABLE_NAME: this.mainTableName,
      IMAGES_DOMAIN: this.imagesDomain,
      SES_FROM_ADDRESS: 'Tifo <no-reply@tifo-sport.com>',
      SES_REGION: 'eu-west-1',
      SIGNIN_WEB_URL: this.signinWebUrl,
      COGNITO_USERPOOL_ID: this.cognitoUserpoolId,
    });

    helper.allowDynamoDB(fn);
    helper.allowSES(fn);
    helper.allowCognito(fn);

    const dataSource = this.api.addLambdaDataSource('companyFn', fn);

    dataSource.createResolver({
      typeName: 'Mutation',
      fieldName: 'inviteClubOwner',
    });

    dataSource.createResolver({
      typeName: 'Mutation',
      fieldName: 'inviteFederationOwner',
    });
  }
}
