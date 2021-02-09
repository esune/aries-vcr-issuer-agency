import { NotImplemented } from '@feathersjs/errors';
import { Params } from '@feathersjs/feathers';
import Axios from 'axios';
import { Application } from '../../declarations';
import logger from '../../logger';
import { ConnectionServiceResponse } from '../../models/connection';
import {
  AriesCredentialDefinition,
  CredDefServiceResponse,
} from '../../models/credential-definition';
import {
  AriesCredentialAttribute,
  AriesCredentialExchange,
  CredExServiceResponse,
} from '../../models/credential-exchange';
import {
  ConnectionServiceAction,
  CredDefServiceAction,
  CredExServiceAction,
  LedgerServiceAction,
  MultitenancyServiceAction,
  SchemasServiceAction,
  ServiceType,
  WalletServiceAction,
} from '../../models/enums';
import {
  MultitenancyServiceRequest,
  MultitenancyServiceResponse,
} from '../../models/multitenancy';
import { AriesSchema, SchemaServiceRequest } from '../../models/schema';
import { WalletServiceResponse } from '../../models/wallet';
import { AcaPyUtils } from '../../utils/aca-py';
import { formatCredentialPreview } from '../../utils/credential-exchange';

export interface AriesAgentData {
  service: ServiceType;
  action:
    | ConnectionServiceAction
    | CredDefServiceAction
    | CredExServiceAction
    | LedgerServiceAction
    | MultitenancyServiceAction
    | SchemasServiceAction
    | WalletServiceAction;
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
      case ServiceType.Multitenancy:
        if (data.action === MultitenancyServiceAction.Create) {
          return this.newSubWallet(data.data as MultitenancyServiceRequest);
        }
      case ServiceType.Wallet:
        if (data.action === WalletServiceAction.Create) {
          return this.newDID(data.token);
        } else if (data.action === WalletServiceAction.Fetch) {
          return this.getPublicDID(data.token);
        } else if (data.action === WalletServiceAction.Publish) {
          this.publishDID(data.data.did, data.token);
        }
      case ServiceType.Connection:
        if (data.action === ConnectionServiceAction.Create) {
          return this.newRegistryConnection(data.data.alias, data.token);
        }
      case ServiceType.Ledger:
        if (data.action === LedgerServiceAction.TAA_Fetch) {
          return this.fetchTAA(data.token);
        } else if (data.action === LedgerServiceAction.TAA_Accept) {
          return this.acceptTAA(
            data.token,
            data.data.mechanism,
            data.data.text,
            data.data.version
          );
        }
      case ServiceType.CredEx:
        if (data.action === CredExServiceAction.Create) {
          return this.issueCredential(
            data.data.credential_exchange_id,
            data.data.attributes
          );
        }
      case ServiceType.CredDef:
        if (data.action === CredDefServiceAction.Details) {
          return this.getCredDefDetailsForSchema(
            data.token,
            data.data.schema_id
          );
        } else if (data.action === CredDefServiceAction.Create) {
          this.publishCredentialDefinition(data.data, data.token);
        }
      case ServiceType.Schemas:
        if (data.action === SchemasServiceAction.Details) {
          return this.getSchemaDetails(data.token, data.data.schema_id);
        } else if (data.action === SchemasServiceAction.List) {
          return this.getCreatedSchemas(data.token);
        } else if (data.action === SchemasServiceAction.Create) {
          this.publishSchema(data.data, data.token);
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
    logger.debug(`Creating new sub-wallet with name ${data.wallet_name}`);
    const url = `${this.acaPyUtils.getAdminUrl()}/multitenancy/wallet`;
    const response = await Axios.post(
      url,
      data,
      this.acaPyUtils.getRequestConfig()
    );
    return response.data as MultitenancyServiceResponse;
  }

  private async newDID(
    token: string | undefined
  ): Promise<WalletServiceResponse> {
    logger.debug(`Creating new ${token ? 'sub-' : 'main '}wallet DID`);
    const url = `${this.acaPyUtils.getAdminUrl()}/wallet/did/create`;
    const response = await Axios.post(
      url,
      {},
      this.acaPyUtils.getRequestConfig(token)
    );
    return response.data as WalletServiceResponse;
  }

  private async getPublicDID(
    token: string | undefined
  ): Promise<WalletServiceResponse> {
    logger.debug('Retrieving wallet DID');
    const url = `${this.acaPyUtils.getAdminUrl()}/wallet/did/public`;
    const response = await Axios.get(
      url,
      this.acaPyUtils.getRequestConfig(token)
    );
    return response.data as WalletServiceResponse;
  }

  private async publishDID(
    did: string,
    token: string | undefined
  ): Promise<WalletServiceResponse> {
    logger.debug(`Setting DID ${did} as public`);
    const url = `${this.acaPyUtils.getAdminUrl()}/wallet/did/public?did=${did}`;
    const response = await Axios.post(
      url,
      {},
      this.acaPyUtils.getRequestConfig(token)
    );
    return response.data as WalletServiceResponse;
  }

  private async newRegistryConnection(
    alias: string,
    token: string | undefined
  ): Promise<ConnectionServiceResponse> {
    const registryAlias = this.app.get('aries-vcr').alias;

    logger.debug(
      `Creating new connection to Credential Registry with alias ${alias}`
    );
    const registryResponse = await Axios.post(
      `${this.acaPyUtils.getRegistryAdminUrl()}/connections/create-invitation?alias=${alias}`,
      {},
      this.acaPyUtils.getRegistryRequestConfig()
    );

    logger.debug(
      `Accepting connection invitation from Credential Registry ${registryAlias}`
    );
    const response = await Axios.post(
      `${this.acaPyUtils.getAdminUrl()}/connections/receive-invitation?alias=${registryAlias}`,
      registryResponse.data.invitation,
      this.acaPyUtils.getRequestConfig(token)
    );
    return response.data as ConnectionServiceResponse;
  }

  private async fetchTAA(token: string | undefined): Promise<any> {
    logger.debug('Fetching TAA');
    const url = `${this.acaPyUtils.getAdminUrl()}/ledger/taa`;
    const response = await Axios.get(
      url,
      this.acaPyUtils.getRequestConfig(token)
    );
    return response.data.result;
  }

  private async acceptTAA(
    token: string | undefined,
    mechanism: string,
    text: string,
    version: string
  ): Promise<any> {
    logger.debug('Accepting TAA');
    const url = `${this.acaPyUtils.getAdminUrl()}/ledger/taa/accept`;
    const response = await Axios.post(
      url,
      {
        mechanism: mechanism,
        text: text,
        version: version,
      },
      this.acaPyUtils.getRequestConfig(token)
    );
    return response.data;
  }

  private async getCreatedSchemas(
    token: string | undefined
  ): Promise<string[]> {
    logger.debug('Fetching all created schemas');
    const url = `${this.acaPyUtils.getAdminUrl()}/schemas/created`;
    const response = await Axios.get(
      url,
      this.acaPyUtils.getRequestConfig(token)
    );
    return response.data.schema_ids;
  }

  private async getSchemaDetails(
    token: string | undefined,
    schema_id: string
  ): Promise<AriesSchema> {
    logger.debug(`Fetching details for schema with id: ${schema_id}`);
    const url = `${this.acaPyUtils.getAdminUrl()}/schemas/${schema_id}`;
    const response = await Axios.get(
      url,
      this.acaPyUtils.getRequestConfig(token)
    );
    return response.data.schema;
  }

  private async getCredDefDetailsForSchema(
    token: string | undefined,
    schema_id: string
  ): Promise<string> {
    logger.debug(`Fetching credential definition for schema ${schema_id}`);
    const url = `${this.acaPyUtils.getAdminUrl()}/credential-definitions/created?schema_id=${schema_id}`;
    const response = await Axios.get(
      url,
      this.acaPyUtils.getRequestConfig(token)
    );
    return response.data.credential_definition_ids[0];
  }

  async publishSchema(
    schema: SchemaServiceRequest,
    token: string | undefined
  ): Promise<AriesSchema> {
    const url = `${this.acaPyUtils.getAdminUrl()}/schemas`;
    logger.debug(`Publishing schema to ledger: ${JSON.stringify(schema)}`);
    const response = await Axios.post(
      url,
      schema,
      this.acaPyUtils.getRequestConfig(token)
    );
    const schemaResponse = response.data as AriesSchema;
    return schemaResponse;
  }

  async publishCredentialDefinition(
    credDef: AriesCredentialDefinition,
    token: string | undefined
  ): Promise<CredDefServiceResponse> {
    logger.debug(
      `Publishing credential definition to ledger: ${JSON.stringify(credDef)}`
    );
    const url = `${this.acaPyUtils.getAdminUrl()}/credential-definitions`;
    const response = await Axios.post(
      url,
      credDef,
      this.acaPyUtils.getRequestConfig(token)
    );
    return response.data as CredDefServiceResponse;
  }

  private async issueCredential(
    id: string,
    attributes: AriesCredentialAttribute[]
  ): Promise<CredExServiceResponse> {
    logger.debug(`Issuing credential on credential exchange [${id}]`);
    const url = `${this.acaPyUtils.getAdminUrl()}/issue-credential/records/${id}/issue`;
    const response = await Axios.post(
      url,
      { credential_preview: formatCredentialPreview(attributes) },
      this.acaPyUtils.getRequestConfig()
    );
    const credExData = response.data as AriesCredentialExchange;
    return {
      credential_exchange_id: credExData.credential_exchange_id,
      state: credExData.state,
    } as CredExServiceResponse;
  }
}
