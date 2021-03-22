import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import { Duration } from '@aws-cdk/core';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { PolicyStatement, Effect } from '@aws-cdk/aws-iam';

export enum ResolverType {
  Mutation = 'Mutation',
  Query = 'Query',
}

export const allowES = (lambdaFunction: lambda.Function) => {
  const esPolicy = new PolicyStatement({ effect: Effect.ALLOW });
  esPolicy.addActions('es:ESHttpGet', 'es:ESHttpHead');
  esPolicy.addResources('*');
  lambdaFunction.addToRolePolicy(esPolicy);
};

export const allowEventBridge = (lambdaFunction: lambda.Function) => {
  const eventsPolicy = new PolicyStatement({ effect: Effect.ALLOW });
  eventsPolicy.addActions('events:PutEvents');
  eventsPolicy.addResources('*');
  lambdaFunction.addToRolePolicy(eventsPolicy);
};

export const allowDynamoDB = (lambdaFunction: lambda.Function) => {
  const dbPolicy = new PolicyStatement({
    effect: Effect.ALLOW,
  });
  dbPolicy.addActions(
    'dynamodb:BatchGetItem',
    'dynamodb:GetRecords',
    'dynamodb:GetShardIterator',
    'dynamodb:Query',
    'dynamodb:GetItem',
    'dynamodb:Scan',
    'dynamodb:BatchWriteItem',
    'dynamodb:PutItem',
    'dynamodb:UpdateItem',
    'dynamodb:DeleteItem'
  );
  dbPolicy.addResources('arn:aws:dynamodb:eu-central-1:596882852595:table/*');

  lambdaFunction.addToRolePolicy(dbPolicy);
};

export const allowSES = (lambdaFunction: lambda.Function) => {
  const sesPolicy = new PolicyStatement({ effect: Effect.ALLOW });
  sesPolicy.addActions('ses:SendEmail');
  sesPolicy.addResources('*');
  lambdaFunction.addToRolePolicy(sesPolicy);
};

export const allowCognito = (lambdaFunction: lambda.Function) => {
  const cognitoPolicy = new PolicyStatement({ effect: Effect.ALLOW });
  cognitoPolicy.addActions(
    'cognito-idp:AdminUpdateUserAttributes',
    'cognito-idp:AdminAddUserToGroup',
    'cognito-idp:AdminRemoveUserFromGroup',
    'cognito-idp:AdminGetUser',
    'cognito-idp:AdminCreateUser',
    'cognito-idp:AdminSetUserPassword'
  );
  cognitoPolicy.addResources('*');
  lambdaFunction.addToRolePolicy(cognitoPolicy);
};

export const getFunction = (
  scope: cdk.Construct,
  functionName: string,
  environment?: any,
  timeoutSeconds = 30,
  memorySize = 128
) => {
  const id = `${functionName}Lambda`;
  const functionPath = path.join(__dirname, '../', 'functions', functionName);

  return new lambda.Function(scope, id, {
    functionName: `manager-${functionName}`,
    code: lambda.Code.fromAsset(functionPath, { exclude: ['*.ts'] }),
    runtime: lambda.Runtime.NODEJS_12_X,
    handler: 'index.handler',
    environment,
    logRetention: RetentionDays.TWO_WEEKS,
    tracing: lambda.Tracing.ACTIVE,
    timeout: Duration.seconds(timeoutSeconds),
    memorySize,
  });
};
