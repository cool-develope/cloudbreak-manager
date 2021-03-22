// @ts-ignore
import * as AWS from "aws-sdk";
import { Client } from "@elastic/elasticsearch";
import { UserFilterInput } from "./types";

class UserInformations {
  private readonly db: AWS.DynamoDB.DocumentClient = new AWS.DynamoDB.DocumentClient();
  private readonly tableName: string;
  private readonly es: Client;

  constructor(tableName: string, esDomain: string) {
    this.tableName = tableName;
    this.es = new Client({ node: esDomain });
  }

  queryItems = (pk: string, keyConditionExpression?: string) => {
    const params = {
      TableName: this.tableName,
      KeyConditionExpression:
        keyConditionExpression || "pk = :pk and begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":sk": "login#",
      },
      Limit: 20,
      ScanIndexForward: false,
    };

    return this.db.query(params).promise();
  };

  esSearch = async (query: string, limit: number, from: number) => {
    const queryFilter = query
      ? {
          query: {
            query_string: {
              query: `*${query}*`,
              fields: ["firstName", "lastName", "email", "phone"],
            },
          },
        }
      : null;

    try {
      const result = await this.es.search({
        index: "users",
        body: {
          from,
          size: limit,
          ...queryFilter,
          sort: [{ 'createdAt': 'desc' }],
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
    loginDate: new Date(parseInt(sk.replace("login#", ""))).toISOString(),
  });

  private async prepareEsItems(items: any[] = [], totalCount: number) {
    const activityPromises = items.map(({ _id }) =>
      this.queryItems(`user#${_id}`)
    );
    const activities = await Promise.all(activityPromises);

    console.log("Recent Activities: ", activities);

    const recentActivities = new Map();

    for (const userItems of activities) {
      if (userItems.Items?.length > 0) {
        const id = userItems.Items[0].pk.replace("user#", "");
        recentActivities.set(
          id,
          userItems.Items.map((item: any) => this.getTypeUser(item))
        );
      }
    }

    let userItems = items.filter( ({_source : { isDeleted }}) => {
      return !(isDeleted == true || isDeleted == 'true');
    }).map(({ _id, _source }) => {
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
          kycReview,
        },
        recentActivity: recentActivities.get(_id) || [],
      };
    });

    return {
      items: userItems,
      totalCount,
    };
  }

  getUsers = async (
    filter: UserFilterInput = {},
    limit: number,
    from: number
  ) => {
    const { search = "" } = filter;
    const esResult = await this.esSearch(search, limit, from);

    console.log("User list:  ", esResult);

    const totalCount = esResult.body?.hits.total.value || 0;

    return this.prepareEsItems(esResult.body?.hits.hits, totalCount);
  };
}

export default UserInformations;
