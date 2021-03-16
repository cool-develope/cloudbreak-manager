// @ts-ignore
import * as AWS from 'aws-sdk';
import { Client } from '@elastic/elasticsearch';

class UserInformations {
  private readonly db: AWS.DynamoDB.DocumentClient = new AWS.DynamoDB.DocumentClient();
  private readonly tableName: string;
  private readonly es: Client;

  constructor(tableName: string, esDomain: string) {
    this.tableName = tableName;
    this.es = new Client({ node: esDomain });
  };

  queryItems = (pk: string, keyConditionExpression?: string) => {
    const params = {
      TableName: this.tableName,
      KeyConditionExpression: keyConditionExpression || 'pk = :pk and begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': pk,
      },
      Limit: 20,
      ScanIndexForward: false
    };
  
    return this.db.query(params).promise();
  };


  esSearch = async (queryFilter: {}, limit: number, from: number) => {
    try {
      const result = await this.es.search({
        index: 'users',
        body: {
          from,
          size: limit,
          ...queryFilter,
        },
      });
      
      return result;
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
      return { body: null };
    }
  };

  getTypeUser = ({ sk, ip, deviceOS, country, city }: any): any => ({
    ip,
    country,
    city,
    device: deviceOS,
    loginDate: sk.replace('login#', ''),
  });

  private async prepareEsItems(items: any[] = [], totalCount: number) {
    const activityPromises = items.map(({_id }) => this.queryItems(`user#${_id}`));
    const acitvities = await Promise.all(activityPromises);
    
    console.log("Recent Activities: ", acitvities);

    const recentActivities = new Map();

    
    for (const items of acitvities) {
      if (items) {
        const id = items[0].pk.replace('user#', '');
        recentActivities.set(id, items.map((item: any) => this.getTypeUser(item)));
      }
    }

    return {
      items: items.map(({ _id, _source }) => {
        const {
          email,
          firstName,
          lastName,
          parentUserId,
          country,
          city,
          phone,
          phoneCountry,
          birthDate,
          createdAt,
          treezorUserId,
          treezorWalletId,
          kycReview,
        } = _source;

        return {
          id: _id,
          email,
          firstName,
          lastName,
          parentUserId,
          country,
          city,
          phone,
          phoneCountry,
          birthDate,
          createDate: createdAt,
          treezor: {
            userId: treezorUserId,
            walletId: treezorWalletId,
            kycReview
          },
          recentActivity: (recentActivities.get(_id) || [])
        };
      }),
      totalCount
    };
  };

  getUsers = async (filter: {}, limit: number, from: number) =>  {
    const esResult = await this.esSearch(filter, limit, from);

    console.log("User list: ", esResult);

    const totalCount = esResult.body?.hits.total.value || 0;
    return this.prepareEsItems(esResult.body?.hits.hits, totalCount);
  };
}

export default UserInformations;
