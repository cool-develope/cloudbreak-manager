// @ts-ignore
import * as AWS from 'aws-sdk';
import { Handler } from 'aws-lambda';
import { Client } from '@elastic/elasticsearch';
import { FunctionEvent, FieldName, UsersConnection } from './types';

const { MAIN_TABLE_NAME, ES_DOMAIN } = process.env;
const db = new AWS.DynamoDB.DocumentClient();
const es = new Client({ node: `https://${ES_DOMAIN}` });

export const handler: Handler = async (event: FunctionEvent): Promise<UsersConnection> => {
  const {
    arguments: { filter = {}, limit = 10, from = 0 },
    identity: { sub, claims },
    info: { fieldName },
  } = event;

  if (fieldName === FieldName.users) {
    /**
     * TODO: Implement search in Elasticsearch
     */

    return {
      items: [
        {
          id: '1',
          email: 'test@gmail.com',
          firstName: 'Sergey',
          lastName: 'Onufrienko',
          parentUserId: null,
          country: 'UA',
          city: '',
          phone: '+3867890987',
          phoneCountry: '+38',
          birthDate: new Date(1985, 1, 1).toISOString(),
          createDate: new Date().toISOString(),
          treezor: {
            userId: 456789,
            walletId: 456789,
            kycReview: 'Pending',
          },
          recentActivity: [
            {
              ip: '127.0.0.1',
              country: 'UA',
              city: '',
              device: 'Android',
              loginDate: new Date().toISOString(),
            },
          ],
        },
      ],
      totalCount: 1,
    };
  }

  throw Error('Query not supported');
};
