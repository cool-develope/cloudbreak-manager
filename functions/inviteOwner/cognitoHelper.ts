// @ts-ignore
import * as AWS from 'aws-sdk';
// @ts-ignore
import { generate } from 'generate-password';

const cognito = new AWS.CognitoIdentityServiceProvider();

enum CognitoAttributes {
  trzChildren = 'custom:trzChildren',
  trzUserId = 'custom:trzUserId',
  trzScopes = 'custom:trzScopes',
  trzWalletsId = 'custom:trzWalletsId',
  trzCardsId = 'custom:trzCardsId',
  clubs = 'custom:clubs',
  teams = 'custom:teams',
  federations = 'custom:federations',
}

export enum CognitoGroup {
  ClubCoaches = 'club-coaches',
  ClubOwners = 'club-owners',
  FederationOwners = 'federation-owners',
}

enum TrzAttributesDefault {
  trzChildren = 'none',
  trzWalletsId = '0',
  trzCardsId = '0',
}

interface NameValue {
  Name: string;
  Value: string;
}

export interface CognitoUser {
  Enabled: boolean;
  MFAOptions: any[];
  UserAttributes: NameValue[];
  UserStatus:
    | 'UNCONFIRMED'
    | 'CONFIRMED'
    | 'ARCHIVED'
    | 'COMPROMISED'
    | 'UNKNOWN'
    | 'RESET_REQUIRED'
    | 'FORCE_CHANGE_PASSWORD';
}

export interface TrzChild {
  userId: number;
  cards: number[];
  wallets: number[];
}

class CognitoHelper {
  private readonly userPoolId;

  constructor(userPoolId: string) {
    this.userPoolId = userPoolId;
  }

  addUserToGroup(sub: string, group: CognitoGroup) {
    const params = {
      GroupName: group,
      UserPoolId: this.userPoolId,
      Username: sub,
    };
    return cognito.adminAddUserToGroup(params).promise();
  }

  removeUserFromGroup(sub: string, group: CognitoGroup) {
    const params = {
      GroupName: group,
      UserPoolId: this.userPoolId,
      Username: sub,
    };
    return cognito.adminRemoveUserFromGroup(params).promise();
  }

  async getUserAttributes(sub: string) {
    const params = {
      UserPoolId: this.userPoolId,
      Username: sub,
    };
    const { UserAttributes }: CognitoUser = await cognito.adminGetUser(params).promise();
    return UserAttributes;
  }

  async updateUserAttributes(sub: string, attributes: NameValue[]) {
    const params = {
      UserAttributes: attributes,
      UserPoolId: this.userPoolId,
      Username: sub,
    };

    console.log('Added new attributes:', params);
    return cognito.adminUpdateUserAttributes(params).promise();
  }

  async addChildrenData(sub: string, userId: number, cards?: number[], wallets?: number[]) {
    const attr = await this.getUserAttributes(sub);
    const trzChildrenAttr = attr.find((a) => a.Name === CognitoAttributes.trzChildren);
    let trzChildren: TrzChild[] = [];
    try {
      if (trzChildrenAttr && trzChildrenAttr.Value !== TrzAttributesDefault.trzChildren) {
        trzChildren = JSON.parse(trzChildrenAttr.Value);
      }
    } catch (err) {
      console.error('Error parsing trzChildrenAttr', err, trzChildrenAttr?.Value);
    }

    const newTrzChildrenObj = this.addPropsToObject(trzChildren, userId, cards, wallets);
    const newTrzChildrenObjStr = JSON.stringify(newTrzChildrenObj);
    const newTrzChildrenAttr: NameValue = {
      Name: CognitoAttributes.trzChildren,
      Value: newTrzChildrenObjStr,
    };
    await this.updateUserAttributes(sub, [newTrzChildrenAttr]);
  }

  stringToSet(str?: string) {
    const a = str ? String(str).split(', ') : [];
    return new Set(a);
  }

  setToString(set: Set<string>) {
    return [...set.values()].join(', ');
  }

  addClub(sub: string, clubId: string) {
    return this.addOrRemoveValue(sub, CognitoAttributes.clubs, clubId, false);
  }

  addTeam(sub: string, teamId: string) {
    return this.addOrRemoveValue(sub, CognitoAttributes.teams, teamId, false);
  }

  addFederation(sub: string, federationId: string) {
    return this.addOrRemoveValue(sub, CognitoAttributes.federations, federationId, false);
  }

  removeClub(sub: string, clubId: string) {
    return this.addOrRemoveValue(sub, CognitoAttributes.clubs, clubId, true);
  }

  removeTeam(sub: string, teamId: string) {
    return this.addOrRemoveValue(sub, CognitoAttributes.teams, teamId, true);
  }

  removeFederation(sub: string, federationId: string) {
    return this.addOrRemoveValue(sub, CognitoAttributes.federations, federationId, true);
  }

  private async addOrRemoveValue(sub: string, attributeName: CognitoAttributes, value: string, isRemove: boolean) {
    const attributes = await this.getUserAttributes(sub);
    const clubsAttr = attributes.find((a) => a.Name === attributeName);
    const values = this.stringToSet(clubsAttr?.Value);

    if (isRemove) {
      values.delete(value);
    } else {
      values.add(value);
    }

    const newValue = this.setToString(values);
    const newAttr: NameValue = {
      Name: attributeName,
      Value: newValue,
    };

    await this.updateUserAttributes(sub, [newAttr]);
  }

  private addPropsToObject(trzChildren: TrzChild[] = [], userId: number, cards: number[] = [], wallets: number[] = []) {
    const trzChildrenClone = [...trzChildren];
    const user = trzChildrenClone.find((item) => item.userId === userId);

    if (user) {
      user.cards = [...(user.cards || []), ...(cards || [])];
      user.wallets = [...(user.wallets || []), ...(wallets || [])];
    } else {
      trzChildrenClone.push({
        userId,
        cards: cards || [],
        wallets: wallets || [],
      });
    }

    return trzChildrenClone;
  }

  async createUser(email: string, group: CognitoGroup | null): Promise<{ sub?: string; error?: string }> {
    const password = generate({
      length: 30,
      numbers: true,
      symbols: true,
      lowercase: true,
      uppercase: true,
      strict: true,
    });

    try {
      const res = await cognito
        .adminCreateUser({
          UserPoolId: this.userPoolId,
          Username: email,
          TemporaryPassword: password,
          MessageAction: 'SUPPRESS',
        })
        .promise();

      const {
        User: { Username },
      } = res;

      await cognito
        .adminSetUserPassword({
          Password: password,
          UserPoolId: this.userPoolId,
          Username,
          Permanent: true,
        })
        .promise();

      if (group) {
        await this.addUserToGroup(Username, group);
      }

      return {
        sub: Username,
      };
    } catch (err) {
      return {
        error: err.message,
      };
    }
  }
}

export default CognitoHelper;
