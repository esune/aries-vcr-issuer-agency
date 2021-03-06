import { NotImplemented } from '@feathersjs/errors';
import { Params } from '@feathersjs/feathers';
import Axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { Application } from '../../declarations';
import logger from '../../logger';
import { ConnectionServiceResponse } from '../../models/connection';
import { AriesCredServiceRequest } from '../../models/credential';
import {
  AriesCredDefServiceRequest,
  CredDefServiceResponse,
} from '../../models/credential-definition';
import { EndorserMetadataServiceRequest } from '../../models/endorser';
import {
  ConnectionServiceAction,
  CredDefServiceAction,
  CredServiceAction,
  EndorserServiceAction,
  IssuerRegistrationServiceAction,
  LedgerServiceAction,
  MultitenancyServiceAction,
  SchemaServiceAction,
  ServiceType,
  WalletServiceAction,
} from '../../models/enums';
import { AriesAgentError } from '../../models/errors';
import { IssuerRegistrationPayload } from '../../models/issuer-registration';
import {
  MultitenancyServiceRequest,
  MultitenancyServiceResponse,
} from '../../models/multitenancy';
import { AriesSchema, AriesSchemaServiceRequest } from '../../models/schema';
import { WalletServiceResponse } from '../../models/wallet';
import { AcaPyUtils } from '../../utils/aca-py';

export interface AriesAgentData {
  service: ServiceType;
  action:
    | ConnectionServiceAction
    | CredDefServiceAction
    | CredServiceAction
    | EndorserServiceAction
    | LedgerServiceAction
    | MultitenancyServiceAction
    | SchemaServiceAction
    | WalletServiceAction
    | IssuerRegistrationServiceAction;
  token?: string;
  data: any;
}

interface ServiceOptions {}

export class AriesAgent {
  app: Application;
  options: ServiceOptions;
  acaPyUtils: AcaPyUtils;

  constructor(options: ServiceOptions = {}, app: Application) {
    this.options = options;
    this.app = app;
    this.acaPyUtils = AcaPyUtils.getInstance(app);
    this.init();
  }

  private async init() {
    const result = await this.acaPyUtils.init();

    this.app.set('schemas', result.schemas);
    this.app.set('credDefs', result.credDefs);

    logger.info('Aries Agent service initialized');
  }

  //eslint-disable-next-line @typescript-eslint/no-unused-vars
  async create(data: AriesAgentData, params?: Params): Promise<any> {
    switch (data.service) {
      case ServiceType.Connection:
        if (data.action === ConnectionServiceAction.CreateVCR) {
          return this.newRegistryConnection(data.data.alias, data.token);
        } else if (data.action === ConnectionServiceAction.CreateEndorser) {
          return this.newEndorserConnection(data.data.alias, data.token);
        }
      case ServiceType.CredDef:
        if (data.action === CredDefServiceAction.Details) {
          return this.getCredDefDetailsForSchema(
            data.token,
            data.data.schema_id
          );
        } else if (data.action === CredDefServiceAction.Create) {
          return this.authorCredentialDefinition(data.data, data.token);
        } else if (data.action === CredDefServiceAction.Find) {
          return this.findCredentialDefinition(
            data.token,
            data.data.schema_name,
            data.data.schema_version
          );
        }
      case ServiceType.Cred:
        if (data.action === CredServiceAction.Send) {
          return this.sendCredential(data.data, data.token);
        } else if (data.action === CredDefServiceAction.Create) {
          return this.createCredential(data.data, data.token);
        }
      case ServiceType.IssuerRegistration:
        if (data.action === IssuerRegistrationServiceAction.Submit) {
          return this.handleIssuerRegistration(data.data, data.token);
        }
      case ServiceType.Endorser:
        if (data.action === EndorserServiceAction.Create_Request) {
          return this.createEndorserRequest(data.data, data.token);
        } else if (data.action === EndorserServiceAction.Set_Metadata) {
          return this.setEndorserMetadata(data.data, data.token);
        } else if (data.action === EndorserServiceAction.Write_Transaction) {
          return this.writeTransaction(data.data.transaction_id, data.token);
        } else if (data.action === EndorserServiceAction.Register_DID) {
          return this.registerDID(
            data.data.did,
            data.data.verkey,
            data.data.alias
          );
        }
      case ServiceType.Ledger:
        if (data.action === LedgerServiceAction.TAA_Accept) {
          return this.acceptTAA(data.token);
        }
      case ServiceType.Multitenancy:
        if (data.action === MultitenancyServiceAction.Create) {
          return this.newSubWallet(data.data as MultitenancyServiceRequest);
        }
      case ServiceType.Schema:
        if (data.action === SchemaServiceAction.Details) {
          return this.getSchemaDetails(data.token, data.data.schema_id);
        } else if (data.action === SchemaServiceAction.List) {
          return this.getCreatedSchemas(data.token);
        } else if (data.action === SchemaServiceAction.Create) {
          return this.authorSchema(data.data, data.token);
        } else if (data.action === SchemaServiceAction.Find) {
          return this.findSchema(
            data.token,
            data.data.schema_name,
            data.data.schema_version
          );
        }
      case ServiceType.Wallet:
        if (data.action === WalletServiceAction.Create) {
          return this.newDID(data.token);
        } else if (data.action === WalletServiceAction.Fetch) {
          return this.getPublicDID(data.token);
        } else if (data.action === WalletServiceAction.Publish) {
          return this.publishDID(data.data.did, data.token);
        }
      default:
        return new NotImplemented(
          `The operation ${data.service}/${data.action} is not supported`
        );
    }
  }

  private async newSubWallet(
    data: MultitenancyServiceRequest
  ): Promise<MultitenancyServiceResponse> {
    try {
      logger.debug(`Creating new sub-wallet with name ${data.wallet_name}`);
      const url = `${this.acaPyUtils.getAdminUrl()}/multitenancy/wallet`;
      const response = await Axios.post(
        url,
        data,
        this.acaPyUtils.getRequestConfig()
      );
      return response.data as MultitenancyServiceResponse;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async newDID(
    token: string | undefined
  ): Promise<WalletServiceResponse> {
    try {
      logger.debug(`Creating new ${token ? 'sub-' : 'main '}wallet DID`);
      const url = `${this.acaPyUtils.getAdminUrl()}/wallet/did/create`;
      const response = await Axios.post(
        url,
        {},
        this.acaPyUtils.getRequestConfig(token)
      );
      return response.data as WalletServiceResponse;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async getPublicDID(
    token: string | undefined
  ): Promise<WalletServiceResponse> {
    try {
      logger.debug('Retrieving wallet DID');
      const url = `${this.acaPyUtils.getAdminUrl()}/wallet/did/public`;
      const response = await Axios.get(
        url,
        this.acaPyUtils.getRequestConfig(token)
      );
      return response.data as WalletServiceResponse;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async publishDID(
    did: string,
    token: string | undefined
  ): Promise<WalletServiceResponse> {
    try {
      logger.debug(`Setting DID ${did} as public`);
      const url = `${this.acaPyUtils.getAdminUrl()}/wallet/did/public?did=${did}`;
      const response = await Axios.post(
        url,
        {},
        this.acaPyUtils.getRequestConfig(token)
      );
      return response.data as WalletServiceResponse;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async newRegistryConnection(
    alias: string,
    token: string | undefined
  ): Promise<ConnectionServiceResponse> {
    try {
      const registryAlias = this.app.get('aries-vcr').alias;
      const registryUrl = this.acaPyUtils.getRegistryAdminUrl();
      const registryConfig = this.acaPyUtils.getRegistryRequestConfig();

      logger.debug(
        `Creating new connection to Credential Registry using alias ${alias}`
      );
      return this.newConnection(
        registryUrl,
        registryAlias,
        registryConfig,
        alias,
        token
      );
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async newEndorserConnection(
    alias: string,
    token: string | undefined
  ): Promise<ConnectionServiceResponse> {
    try {
      const endorserAlias = this.app.get('endorser').alias;
      const endorserUrl = this.acaPyUtils.getEndorserAdminUrl();
      const endorserConfig = this.acaPyUtils.getEndorserRequestConfig();

      logger.debug(`Creating new connection to Endorser using alias ${alias}`);
      return this.newConnection(
        endorserUrl,
        endorserAlias,
        endorserConfig,
        alias,
        token,
        true
      );
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async newConnection(
    targetAgentUrl: string,
    targetAgentAlias: string,
    targetAgentRequestConfig: AxiosRequestConfig,
    myAlias: string,
    token: string | undefined,
    usePublicDid = false
  ): Promise<ConnectionServiceResponse> {
    try {
      const reqBody = {
        alias: myAlias,
        handshake_protocols: [
          'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/didexchange/1.0',
        ],
        my_label: targetAgentAlias,
        use_public_did: usePublicDid,
      };
      const remoteResponse = await Axios.post(
        `${targetAgentUrl}/out-of-band/create-invitation`,
        reqBody,
        targetAgentRequestConfig
      );

      logger.debug(`Accepting connection invitation from ${targetAgentAlias}`);
      const response = await Axios.post(
        `${this.acaPyUtils.getAdminUrl()}/out-of-band/receive-invitation`,
        remoteResponse.data.invitation,
        {
          ...this.acaPyUtils.getRequestConfig(token),
          ...{ params: { alias: targetAgentAlias } },
        }
      );
      return response.data as ConnectionServiceResponse;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async fetchTAA(token: string | undefined): Promise<any> {
    try {
      logger.debug('Fetching TAA');
      if (this.app.get('taa')) {
        // Return cached version
        return this.app.get('taa');
      }
      const url = `${this.acaPyUtils.getAdminUrl()}/ledger/taa`;
      const response = await Axios.get(
        url,
        this.acaPyUtils.getRequestConfig(token)
      );
      this.app.set('taa', response.data.result);
      return response.data.result;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async registerDID(
    did: string,
    verkey: string,
    alias: string
  ): Promise<any> {
    try {
      logger.debug(`Registering did ${did} as AUTHOR (no role) on ledger`);
      const url = `${this.acaPyUtils.getEndorserAdminUrl()}/ledger/register-nym`;
      const response = await Axios.post(
        url,
        {},
        {
          ...this.acaPyUtils.getEndorserRequestConfig(),
          ...{ params: { did: did, verkey: verkey, alias: alias } },
        }
      );
      return response.data.result;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async acceptTAA(token: string | undefined): Promise<any> {
    try {
      const taa = await this.fetchTAA(token);
      if (!taa.taa_required) {
        // Just return success without doing anything as it is not required
        return {};
      }

      logger.debug('Accepting TAA');
      const url = `${this.acaPyUtils.getAdminUrl()}/ledger/taa/accept`;
      const response = await Axios.post(
        url,
        {
          mechanism: this.app.get('issuer').taa_method,
          text: taa.taa_record.text,
          version: taa.taa_record.version,
        },
        this.acaPyUtils.getRequestConfig(token)
      );
      return response.data;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async getCreatedSchemas(
    token: string | undefined
  ): Promise<string[]> {
    try {
      logger.debug('Fetching all created schemas');
      const url = `${this.acaPyUtils.getAdminUrl()}/schemas/created`;
      const response = await Axios.get(
        url,
        this.acaPyUtils.getRequestConfig(token)
      );
      return response.data.schema_ids;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async getSchemaDetails(
    token: string | undefined,
    schema_id: string
  ): Promise<AriesSchema> {
    try {
      logger.debug(`Fetching details for schema with id: ${schema_id}`);
      const url = `${this.acaPyUtils.getAdminUrl()}/schemas/${schema_id}`;
      const response = await Axios.get(
        url,
        this.acaPyUtils.getRequestConfig(token)
      );
      return response.data.schema;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async findSchema(
    token: string | undefined = '',
    schema_name: string | undefined = '',
    schema_version: string | undefined = ''
  ): Promise<AriesSchema> {
    try {
      logger.debug(
        `Fetching details for schema with name: ${schema_name} and version: ${schema_version}`
      );
      const url = `${this.acaPyUtils.getAdminUrl()}/schemas/created`;
      const response = await Axios.get(url, {
        ...this.acaPyUtils.getRequestConfig(token),
        ...{
          params: {
            schema_name,
            schema_version,
          },
        },
      });
      return response.data.schema_ids[0];
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async getCredDefDetailsForSchema(
    token: string | undefined,
    schema_id: string
  ): Promise<string> {
    try {
      logger.debug(`Fetching credential definition for schema ${schema_id}`);
      const url = `${this.acaPyUtils.getAdminUrl()}/credential-definitions/created`;
      const response = await Axios.get(url, {
        ...this.acaPyUtils.getRequestConfig(token),
        ...{ params: { schema_id: schema_id } },
      });
      return response.data.credential_definition_ids[0];
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async findCredentialDefinition(
    token: string | undefined = '',
    schema_name: string | undefined = '',
    schema_version: string | undefined = ''
  ): Promise<AriesSchema> {
    try {
      logger.debug(
        `Fetching details for credential definition with name: ${schema_name} and version: ${schema_version}`
      );
      const url = `${this.acaPyUtils.getAdminUrl()}/credential-definitions/created`;
      const response = await Axios.get(url, {
        ...this.acaPyUtils.getRequestConfig(token),
        ...{
          params: {
            schema_name,
            schema_version,
          },
        },
      });
      return response.data.credential_definition_ids[0];
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async authorSchema(
    schema: AriesSchemaServiceRequest,
    token: string | undefined
  ): Promise<AriesSchema> {
    try {
      const url = `${this.acaPyUtils.getAdminUrl()}/schemas`;
      logger.debug(`Publishing schema to ledger: ${JSON.stringify(schema)}`);
      const response = await Axios.post(
        url,
        {
          schema_name: schema.schema_name,
          schema_version: schema.schema_version,
          attributes: schema.attributes,
        },
        {
          ...this.acaPyUtils.getRequestConfig(token),
          ...{
            params: {
              conn_id: schema.conn_id,
              create_transaction_for_endorser: true,
            },
          },
        }
      );
      return response.data;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  async authorCredentialDefinition(
    credDef: AriesCredDefServiceRequest,
    token: string | undefined
  ): Promise<CredDefServiceResponse> {
    try {
      logger.debug(
        `Publishing credential definition to ledger: ${JSON.stringify(credDef)}`
      );
      const url = `${this.acaPyUtils.getAdminUrl()}/credential-definitions`;
      const response = await Axios.post(url, credDef, {
        ...this.acaPyUtils.getRequestConfig(token),
        ...{
          params: {
            conn_id: credDef.conn_id,
            create_transaction_for_endorser: true,
          },
        },
      });
      return response.data as CredDefServiceResponse;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  // TODO: Need to type response
  private async handleIssuerRegistration(
    payload: IssuerRegistrationPayload,
    token: string | undefined
  ): Promise<any> {
    try {
      const issuerName = payload.issuer_registration.issuer.name;
      const schemaName = payload.issuer_registration.credential_types[0].schema;
      const schemaVersion =
        payload.issuer_registration.credential_types[0].version;
      logger.debug(
        `Processing issuer registration request for ${issuerName}, ${schemaName}:${schemaVersion}`
      );
      const url = `${this.acaPyUtils.getAdminUrl()}/issuer_registration/send`;
      const response = await Axios.post(
        url,
        payload,
        this.acaPyUtils.getRequestConfig(token)
      );
      return response.data;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  // TODO: Need to type response
  private async sendCredential(
    credential: AriesCredServiceRequest,
    token: string | undefined
  ): Promise<any> {
    try {
      logger.debug(`Sending new credential: ${JSON.stringify(credential)}`);
      const url = `${this.acaPyUtils.getAdminUrl()}/issue-credential-2.0/send`;
      const response = await Axios.post(
        url,
        credential,
        this.acaPyUtils.getRequestConfig(token)
      );
      return response.data;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  // TODO: Need to type response
  private async createCredential(
    credential: AriesCredServiceRequest,
    token: string | undefined
  ): Promise<any> {
    try {
      logger.debug(`Creating new credential: ${JSON.stringify(credential)}`);
      const url = `${this.acaPyUtils.getAdminUrl()}/issue-credential-2.0/send-offer`;
      const response = await Axios.post(
        url,
        credential,
        this.acaPyUtils.getRequestConfig(token)
      );
      return response.data;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async setEndorserMetadata(
    data: EndorserMetadataServiceRequest,
    token: string | undefined
  ): Promise<boolean> {
    try {
      const roleResult = await this.setEndorserRole(data.connection_id, token);
      const infoResult = await this.setEndorserInfo(
        data.connection_id,
        data.did,
        data.alias,
        token
      );
      return roleResult && infoResult;
    } catch (e) {
      throw e;
    }
  }

  private async setEndorserInfo(
    connection_id: string,
    did: string,
    alias: string,
    token: string | undefined
  ): Promise<boolean> {
    try {
      const url = `${this.acaPyUtils.getAdminUrl()}/transactions/${connection_id}/set-endorser-info`;
      logger.debug(
        `Setting endorser metadata for connection with id ${connection_id}`
      );
      const response = await Axios.post(
        url,
        {},
        {
          ...this.acaPyUtils.getRequestConfig(token),
          ...{ params: { endorser_did: did, endorser_name: alias } },
        }
      );
      return response.status === 200 ? true : false;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async setEndorserRole(
    connection_id: string,
    token: string | undefined
  ): Promise<boolean> {
    try {
      const authorRole = 'TRANSACTION_AUTHOR';
      const url = `${this.acaPyUtils.getAdminUrl()}/transactions/${connection_id}/set-endorser-role`;
      logger.debug(
        `Setting role metadata for connection with id ${connection_id}`
      );
      const response = await Axios.post(
        url,
        {},
        {
          ...this.acaPyUtils.getRequestConfig(token),
          ...{ params: { transaction_my_job: authorRole } },
        }
      );
      return response.status === 200 ? true : false;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  // TODO: Need to type response
  private async createEndorserRequest(
    request: any,
    token: string | undefined
  ): Promise<any> {
    try {
      logger.debug(`Creating new endorser request: ${JSON.stringify(request)}`);
      const url = `${this.acaPyUtils.getAdminUrl()}/transactions/create-request`;
      const response = await Axios.post(
        url,
        { expires_time: request.expires_time },
        {
          ...this.acaPyUtils.getRequestConfig(token),
          ...{ params: { tran_id: request.tran_id } },
        }
      );
      return response.data;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }

  private async writeTransaction(
    transaction_id: string,
    token: string | undefined
  ): Promise<boolean> {
    try {
      logger.debug(`Write transaction with id ${transaction_id} to ledger`);

      const url = `${this.acaPyUtils.getAdminUrl()}/transactions/${transaction_id}/write`;

      const response = await Axios.post(
        url,
        {},
        this.acaPyUtils.getRequestConfig(token)
      );
      return response.status === 200 ? true : false;
    } catch (e) {
      const error = e as AxiosError;
      throw new AriesAgentError(
        error.response?.statusText || error.message,
        error.response?.status,
        error.response?.data
      );
    }
  }
}
