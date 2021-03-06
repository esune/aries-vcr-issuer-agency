import { Application } from '@feathersjs/express';
import Axios, { AxiosRequestConfig } from 'axios';
import logger from '../logger';
import { UndefinedAppError } from '../models/errors';
import { AriesSchema } from '../models/schema';
import { sleep } from './sleep';

export class AcaPyUtils {
  static instance: AcaPyUtils;
  app: Application;

  private constructor(app: Application) {
    this.app = app;
  }

  static getInstance(app?: Application): AcaPyUtils {
    if (!this.instance) {
      if (!app) {
        throw new UndefinedAppError(
          'Error creating a new instance of [AcaPyUtils]: no app was provided'
        );
      }
      this.instance = new AcaPyUtils(app);
      logger.debug('Created new instance of [AcaPyUtils]');
    }
    return this.instance;
  }

  getRequestConfig(token = ''): AxiosRequestConfig {
    let agencyHeaders = this.app.get('agent').headers;
    if (token) {
      agencyHeaders = {
        ...agencyHeaders,
        ...{
          Authorization: `Bearer ${token}`,
        },
      };
    }
    return {
      headers: agencyHeaders,
    } as AxiosRequestConfig;
  }

  getAdminUrl(): string {
    return this.app.get('agent').adminUrl;
  }

  getRegistryRequestConfig(): AxiosRequestConfig {
    return {
      headers: this.app.get('aries-vcr').headers,
    } as AxiosRequestConfig;
  }

  getRegistryAdminUrl(): string {
    return this.app.get('aries-vcr').adminUrl;
  }

  getEndorserRequestConfig(): AxiosRequestConfig {
    return {
      headers: this.app.get('endorser').headers,
    } as AxiosRequestConfig;
  }

  getEndorserAdminUrl(): string {
    return this.app.get('endorser').adminUrl;
  }

  async init(): Promise<any> {
    // wait for the agent to be ready
    while (!(await this.isAgentReady())) {
      logger.debug('Agent not ready, retrying in 3s...');
      await sleep(3000);
    }

    return Promise.resolve({
      schemas: new Map<string, AriesSchema>(),
      credDefs: new Map<string, string>(),
    });
  }

  async isAgentReady(): Promise<boolean> {
    const url = `${this.app.get('agent').adminUrl}/status/ready`;
    let result;
    try {
      const response = await Axios.get(url, this.getRequestConfig());
      result = response.status === 200 ? true : false;
    } catch (error) {
      result = false;
    }
    return Promise.resolve(result);
  }
}
