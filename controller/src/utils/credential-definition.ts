import { Application } from '@feathersjs/express';
import Axios from 'axios';
import logger from '../logger';
import {
  AriesCredDefServiceRequest,
  CredDefServiceResponse,
} from '../models/credential-definition';
import { UndefinedAppError } from '../models/errors';
import { AcaPyUtils } from './aca-py';

export class CredDefUtils {
  private static instance: CredDefUtils;
  app: Application;
  utils: AcaPyUtils;

  private constructor(app: Application) {
    this.app = app;
    this.app.set('credDefs', new Map<string, string>());
    this.utils = AcaPyUtils.getInstance(app);
  }

  static getInstance(app?: Application): CredDefUtils {
    if (!CredDefUtils.instance) {
      if (!app) {
        throw new UndefinedAppError(
          'Error creating a new instance of [CredDefUtils]: no app was provided'
        );
      }
      CredDefUtils.instance = new CredDefUtils(app);
      logger.debug('Created new instance of [CredDefUtils]');
    }
    return CredDefUtils.instance;
  }

  formatCredentialDefinition(
    schema_id: string,
    support_revocation = false,
    tag = 'default'
  ): AriesCredDefServiceRequest {
    return {
      schema_id: schema_id,
      support_revocation: support_revocation,
      tag: tag,
    };
  }

  async getOrCreateCredDef(
    credDef: AriesCredDefServiceRequest
  ): Promise<CredDefServiceResponse> {
    let credDefResponse: CredDefServiceResponse;
    if (this.app.get('credDefs').get(credDef.schema_id)) {
      logger.debug(
        `Credential definition already in cache: ${JSON.stringify(credDef)}`
      );
      credDefResponse = {
        credential_definition_id:
          this.app.get('credDefs').get(credDef.schema_id) || '',
      };
    } else {
      logger.debug(
        `Publishing credential definition to ledger: ${JSON.stringify(credDef)}`
      );
      const url = `${this.utils.getAdminUrl()}/credential-definitions`;
      const response = await Axios.post(
        url,
        credDef,
        this.utils.getRequestConfig()
      );
      credDefResponse = response.data as CredDefServiceResponse;
      logger.debug(
        `Published credential definition: ${JSON.stringify(credDefResponse)}`
      );
    }
    return credDefResponse;
  }
}
