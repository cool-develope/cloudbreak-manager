// @ts-ignore
import * as AWS from 'aws-sdk';
import * as fs from 'fs';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import { Handler } from 'aws-lambda';
import DynamoHelper from './dynamoHelper';
import CognitoHelper, { CognitoGroup } from './cognitoHelper';

enum FieldName {
  inviteClubOwner = 'inviteClubOwner',
  inviteFederationOwner = 'inviteFederationOwner',
}

enum FederationType {
  International = 'International',
  National = 'National',
  Regional = 'Regional',
  Local = 'Local',
}

const {
  MAIN_TABLE_NAME = '',
  IMAGES_DOMAIN = '',
  SES_FROM_ADDRESS = '',
  SES_REGION = '',
  SIGNIN_WEB_URL = '',
  COGNITO_USERPOOL_ID = '',
} = process.env;

const db = new AWS.DynamoDB.DocumentClient();
const ses = new AWS.SES({ region: SES_REGION });
const dynamoHelper = new DynamoHelper(db, MAIN_TABLE_NAME);
const cognitoHelper = new CognitoHelper(COGNITO_USERPOOL_ID);

const CLUB_EMAIL_TEMPLATE = './invitation.html';

const getEmailHtml = (templateFileName: string, data: any) => {
  const html = fs.readFileSync(templateFileName, 'utf8');
  const htmlWithData = Object.keys(data).reduce(
    (acc, key) => acc.replace(new RegExp(`{{ ${key} }}`, 'g'), data[key]),
    html
  );
  return htmlWithData;
};

const sendEmail = async (templateFileName: string, emailAddress: string, subject: string) => {
  const html = getEmailHtml(templateFileName, {
    domain: `https://${IMAGES_DOMAIN}`,
    signin_url: SIGNIN_WEB_URL,
  });

  const params: AWS.SES.SendEmailRequest = {
    Destination: { ToAddresses: [emailAddress] },
    Message: {
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: html,
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: subject,
      },
    },
    Source: SES_FROM_ADDRESS,
  };

  await ses.sendEmail(params).promise();
};

interface Event {
  arguments: {
    input: {
      name: string;
      email: string;
      type: FederationType;
    };
  };
  identity: { sub: string };
  info: { fieldName: FieldName };
}

export const handler: Handler = async (event: Event): Promise<{ errors: string[] }> => {
  const {
    arguments: {
      input: { email, name, type },
    },
    identity: { sub },
    info: { fieldName },
  } = event;

  const errors: string[] = [];

  let group = null;
  if (fieldName === FieldName.inviteClubOwner) {
    group = CognitoGroup.ClubOwners;
  } else if (fieldName === FieldName.inviteFederationOwner) {
    group = CognitoGroup.FederationOwners;
  }

  /**
   * Create user with group
   */
  const { sub: ownerUserId, error } = await cognitoHelper.createUser(email, group);
  if (error) {
    errors.push(error);
    return { errors };
  }

  if (fieldName === FieldName.inviteClubOwner) {
    await sendEmail(CLUB_EMAIL_TEMPLATE, email, 'Club owner invitation');
  } else if (fieldName === FieldName.inviteFederationOwner) {
    const pk = `federation#${uuidv4()}`;
    const sk = 'metadata';
    const data = {
      type,
      name,
      email,
      ownerUserId,
      createdAt: new Date().toISOString(),
    };

    await dynamoHelper.updateItem(pk, sk, data);
    await sendEmail(CLUB_EMAIL_TEMPLATE, email, 'Federation owner invitation');
  }

  return { errors };
};
