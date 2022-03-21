//import * as chalk from 'chalk';

export const envVars = {
  COMPANY_NAME: 'skcnc',
  PROJECT_NAME: 'network',
  SOURCE_PROVIDER: 'GITHUB',
  GITHUB_TOKEN: 'atcl/jingood2/github-token',
  REPO_OWNER: process.env.REPO_OWNER || 'jingood2',
  REPO: process.env.REPO_NAME || 'cdk-vpc-pipeline',
  ENABLE_TGW_USE: 'true',
  ENABLE_VPN_USE: 'false',
  ENABLE_ZCP_USE: 'true',
  DMZ_VPC_CIDR_BLOCK: '10.0.0.0/18',
  DEV_VPC_CIDR_BLOCK: '10.1.0.0/18',
  PROD_VPC_CIDR_BLOCK: '10.2.0.0/18',
  SHARED_VPC_CIDR_BLOCK: '192.168.0.0/18',
  ONPREMISE_CIDR_BOCK: '192.168.0.0/18',
  VPC_ENV_INFO: [
    { DMZ: { VPC_CIDR_BLOCK: '10.0.0.0/18', TGW_ROUTE: ['10.1.0.0/18'] } },
    { DEV: { VPC_CIDR_BLOCK: '10.1.0.0/18', TGW_ROUTE: ['0.0.0.0/0'] } },
    { SHARED: { VPC_CIDR_BLOCK: '192.168.0.0/18', TGW_ROUTE: ['0.0.0.0/0'] } },
  ],
  CGW_PUBLIC_IP: '11.23.22.0/32',
  BRANCH: 'develop',
};

export function validateEnvVariables() {
  for (let variable in envVars) {
    if (!envVars[variable as keyof typeof envVars]) {
      throw Error(
        //chalk.red(`[app]: Environment variable ${variable} is not defined!`),
        //chalk.chalkStderr(`[app]: Environment variable ${variable} is not defined!`),
        `[app]: Environment variable ${variable} is not defined!`,
      );
    }
  }
}