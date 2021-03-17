// @ts-ignore
import * as AWS from "aws-sdk";
import { Client } from "@elastic/elasticsearch";
import { UsersFilter, TeamInvitationStatus } from "./types";

class UserInformations {
  private readonly db: AWS.DynamoDB.DocumentClient = new AWS.DynamoDB.DocumentClient();
  private readonly tableName: string;
  private readonly es: Client;
  private readonly regExpClearNewLines = new RegExp(/[\r\n]+/gm);
  private readonly regExpClearSpaces = new RegExp(" +");
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
  getEsQueryTeamsArray(
    boolCondition: string,
    propertyName: string,
    values?: string[]
  ) {
    if (values && values.length) {
      const result = {
        nested: {
          path: "teams",
          query: {
            bool: {
              [boolCondition]: values.map((value) => ({
                term: { [`teams.${propertyName}.keyword`]: value },
              })),
            },
          },
        },
      };

      return result;
    }

    return null;
  }

  getEsQueryTeamsMultiParams(boolCondition: string, filter: Object) {
    const entries = Object.entries(filter || {}).filter(
      ([k, v]) => v !== null && v !== undefined
    );

    if (entries.length) {
      return {
        nested: {
          path: "teams",
          query: {
            bool: {
              [boolCondition]: entries.map(([key, value]) => ({
                term: { [`teams.${key}.keyword`]: value },
              })),
            },
          },
        },
      };
    }

    return null;
  }

  getSearchArrByString(search: string): string[] {
    return search
      .replace(this.regExpClearNewLines, "")
      .trim()
      .split(this.regExpClearSpaces);
  }
  getSearchQueryByArr(arr: string[]): string {
    return arr.reduce((prev: string, curSearch: string, index: number) => {
      return index === 0 ? prev + `*${curSearch}*` : prev + ` *${curSearch}*`;
    }, "");
  }

  getEsQueryBySearch(search?: string) {
    if (!search) return null;

    const searchArr: string[] = this.getSearchArrByString(search);

    return searchArr.length === 0
      ? null
      : {
          query_string: {
            fields: [
              "firstName",
              "lastName",
              // "email" ? should find by email?
            ],
            query: this.getSearchQueryByArr(searchArr),
            //should use length to discard wrong options (ex:
            //input: fab capello mr <- invalid, just fab capello
            minimum_should_match: searchArr.length,
          },
        };
  }

  getEsQueryExists(field: string) {
    return {
      exists: {
        field,
      },
    };
  }

  getEsQueryFriends(userId?: string) {
    if (!userId) return null;

    return {
      term: {
        "friends.keyword": userId,
      },
    };
  }

  getEsQueryByDate(field: string, gte?: string, lte?: string) {
    return !gte && !lte
      ? null
      : {
          range: {
            [field]: {
              gte,
              lte,
            },
          },
        };
  }

  getEsQueryList(filter: UsersFilter = {}) {
    const {
      search,
      clubIds,
      teamIds,
      userIds,
      friendId,
      hasWallet,
      role,
      status,
      createDateAfter,
      createDateBefore,
      birthDateAfter,
      birthDateBefore,
    } = filter;
    const roles = role ? [role] : [];
    const statuses = status
      ? [status]
      : [
          TeamInvitationStatus.Pending,
          TeamInvitationStatus.Accepted,
          TeamInvitationStatus.Declined,
        ];

    let filterByTeamsArray: any[] = [];
    const teamsCount = teamIds?.length ?? 0;
    const clubsCount = clubIds?.length ?? 0;
    const rolesCount = roles?.length ?? 0;

    // TODO: improve it in future
    if (
      statuses.length === 1 &&
      teamsCount <= 1 &&
      clubsCount <= 1 &&
      rolesCount <= 1
    ) {
      /**
       * Search with all of params
       */
      filterByTeamsArray = [
        this.getEsQueryTeamsMultiParams("must", {
          clubId: clubIds?.[0],
          teamId: teamIds?.[0],
          role: roles?.[0],
          status: statuses?.[0],
        }),
      ];
      /**
       * Let the "filterByTeamsArray" be empty while we just search for friends
       * Otherwise we don't get what we want
       */
    } else if (friendId) {
    } else {
      /**
       * Search with any of this params
       */
      filterByTeamsArray = [
        this.getEsQueryTeamsArray("should", "teamId", teamIds),
        this.getEsQueryTeamsArray("should", "clubId", clubIds),
        this.getEsQueryTeamsArray("must", "role", roles),
        this.getEsQueryTeamsArray("should", "status", statuses),
      ];
    }

    const filterBySearch = this.getEsQueryBySearch(search);
    const filterByUserFriends = this.getEsQueryFriends(friendId);
    const filterByUsers = this.getEsQueryTeamsArray("should", "_id", userIds);
    const filterByHasWallet =
      hasWallet === true ? this.getEsQueryExists("treezorWalletId") : null;
    const filterByCreateDate = this.getEsQueryByDate(
      "createdAt",
      createDateAfter,
      createDateBefore
    );
    const filterByBirthDate = this.getEsQueryByDate(
      "birthDate",
      birthDateAfter,
      birthDateBefore
    );

    const must = [
      filterBySearch,
      filterByUserFriends,
      filterByUsers,
      filterByCreateDate,
      filterByBirthDate,
      filterByHasWallet,
      ...filterByTeamsArray,
    ].filter((f) => !!f);

    const query = must.length
      ? {
          bool: {
            must,
          },
        }
      : null;

    return query;
  }

  
  esSearch = async (query: any, limit: number, from: number) => {
    const queryFilter = query ? { query } : null;
    try {
      const result = await this.es.search({
        index: "users",
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
    loginDate: sk.replace("login#", ""),
  });

  private async prepareEsItems(items: any[] = [], totalCount: number) {
    const activityPromises = items.map(({ _id }) =>
      this.queryItems(`user#${_id}`)
    );
    const activities = await Promise.all(activityPromises);

    console.log("Recent Activities: ", activities);

    const recentActivities = new Map();

    for (const userItems of activities) {
      if (userItems?.length > 0) {
        const id = userItems[0].pk.replace("user#", "");
        recentActivities.set(
          id,
          userItems.map((item: any) => this.getTypeUser(item))
        );
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
            kycReview,
          },
          recentActivity: recentActivities.get(_id) || [],
        };
      }),
      totalCount,
    };
  }

  getUsers = async (filter: UsersFilter = {}, limit: number, from: number) => {
    const query = this.getEsQueryList(filter);
    const esResult = await this.esSearch(filter, limit, from);

    console.log("User list:  ", esResult);

    const totalCount = esResult.body?.hits.total.value || 0;

    console.log("User list:  ", esResult.body?.hits.hits, totalCount);

    return this.prepareEsItems(esResult.body?.hits.hits, totalCount);
  };
}

export default UserInformations;
