// @ts-ignore
import { Handler } from 'aws-lambda';
import { FunctionEvent, FieldName, UsersConnection } from './types';
import UserInformations from './userInformations';

const { MAIN_TABLE_NAME = '', ES_DOMAIN = '' } = process.env;

export const handler: Handler = async (event: FunctionEvent): Promise<UsersConnection> => {
  const {
    arguments: { filter = {}, limit = 10, from = 0 },
    // identity: { sub, claims },
    info: { fieldName },
  } = event;

  if (fieldName === FieldName.users) {
    /**
     * TODO: Implement search in Elasticsearch
     */
     
    const userInformations: UserInformations = new UserInformations(MAIN_TABLE_NAME, ES_DOMAIN);
    
    return userInformations.getUsers(filter, limit, from);
  }

  throw Error('Query not supported');
};
