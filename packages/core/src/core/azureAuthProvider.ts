/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PublicClientApplication, DeviceCodeRequest, AuthenticationResult, Configuration } from '@azure/msal-node';

export interface AzureAuthConfig {
  clientId: string;
  tenantId?: string;
  authority?: string;
}

export interface AzureTokenResult {
  accessToken: string;
  expiresOn: Date;
  account: {
    username: string;
    name?: string;
    tenantId: string;
  };
}

/**
 * Azure authentication provider using MSAL (Microsoft Authentication Library)
 * Handles OAuth2 device code flow for Azure authentication
 */
export class AzureAuthProvider {
  private pca: PublicClientApplication;
  private clientId: string;

  constructor(config: AzureAuthConfig) {
    this.clientId = config.clientId;
    
    const msalConfig: Configuration = {
      auth: {
        clientId: config.clientId,
        authority: config.authority || `https://login.microsoftonline.com/${config.tenantId || 'common'}`,
      },
      // Note: MSAL cache configuration would go here if needed
    };

    this.pca = new PublicClientApplication(msalConfig);
  }

  /**
   * Authenticate using device code flow
   * Returns authentication result with access token
   */
  async authenticateDeviceCode(scopes: string[] = ['https://cognitiveservices.azure.com/.default']): Promise<AzureTokenResult> {
    try {
      const deviceCodeRequest: DeviceCodeRequest = {
        scopes,
        deviceCodeCallback: (response) => {
          // This callback will be called with the device code info
          console.log('\n📱 Azure Device Code Authentication');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(`🔗 Please visit: ${response.verificationUri}`);
          console.log(`📋 Enter code: ${response.userCode}`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('⏳ Waiting for authentication...\n');
        },
      };

      const response = await this.pca.acquireTokenByDeviceCode(deviceCodeRequest);
      if (!response) {
        throw new Error('Azure authentication failed: No response received');
      }
      return this.convertToTokenResult(response);
    } catch (error) {
      throw new Error(`Azure authentication failed: ${error}`);
    }
  }

  /**
   * Try to get a cached token silently
   * Returns null if no valid cached token exists
   */
  async getTokenSilently(scopes: string[] = ['https://cognitiveservices.azure.com/.default']): Promise<AzureTokenResult | null> {
    try {
      const accounts = await this.pca.getTokenCache().getAllAccounts();
      if (accounts.length === 0) {
        return null;
      }

      const silentRequest = {
        scopes,
        account: accounts[0],
      };

      const response = await this.pca.acquireTokenSilent(silentRequest);
      if (response) {
        return this.convertToTokenResult(response);
      }
      return null;
    } catch (error) {
      // Silent acquisition failed, will need interactive auth
      return null;
    }
  }

  /**
   * Clear all cached tokens and accounts
   */
  async signOut(): Promise<void> {
    try {
      const accounts = await this.pca.getTokenCache().getAllAccounts();
      for (const account of accounts) {
        await this.pca.getTokenCache().removeAccount(account);
      }
    } catch (error) {
      console.warn('Warning: Failed to clear Azure token cache:', error);
    }
  }

  /**
   * Get all cached accounts
   */
  async getAccounts() {
    return await this.pca.getTokenCache().getAllAccounts();
  }

  private convertToTokenResult(response: AuthenticationResult): AzureTokenResult {
    if (!response.accessToken || !response.account || !response.expiresOn) {
      throw new Error('Invalid authentication response from Azure');
    }

    return {
      accessToken: response.accessToken,
      expiresOn: response.expiresOn,
      account: {
        username: response.account.username,
        name: response.account.name,
        tenantId: response.account.tenantId,
      },
    };
  }
}

/**
 * Default Azure configuration for OpenAI access
 */
export const defaultAzureConfig: AzureAuthConfig = {
  clientId: '04b07795-8ddb-461a-bbee-02f9e1bf7b46', // Azure CLI client ID (public client)
  authority: 'https://login.microsoftonline.com/common',
};