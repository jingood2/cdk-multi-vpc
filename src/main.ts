import { App, Stack, StackProps } from 'aws-cdk-lib';
//import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { envVars, validateEnvVariables } from './config';
//import { EcsCluster } from './lib/ecs-cluster-stack';
//import { EndpointStack } from './lib/endpoint-construct';
import { TgwConstruct } from './lib/tgw-construct';
import { VpcConstruct } from './lib/vpc-construct';
import { VpnConstruct } from './lib/vpn-construct';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);


    const tgwStack = new TgwConstruct(this, 'TgwConstruct');

    // define resources here...
    // 1. VPC
    envVars.VPC_ENV_INFO.forEach((vpc) => {
      new VpcConstruct(this, `${vpc.STAGE}-VPC`, {
        customProps: {
          company: `${envVars.COMPANY_NAME}`,
          project: `${envVars.PROJECT_NAME}`,
          stage: vpc.STAGE,
          tgwCidrBlock: vpc.TGW_ROUTE,
          useNATInstance: true,
        },
        vpcProps: {
          cidr: vpc.VPC_CIDR_BLOCK,
          enableDnsHostnames: true,
          enableDnsSupport: true,
          natGateways: vpc.NGW,
          maxAzs: 2,
          subnetConfiguration: vpc.SUBNET_CONFIG,
        },
      }).addDependency(tgwStack);

    });

    if (envVars.ENABLE_VPN_USE == 'true') {
      new VpnConstruct(this, 'OnPremA', {
      // openswan 설치된 ec2의 eip 입력
        vpnIpAddress: envVars.CGW_PUBLIC_IP,
        bgpArn: 65001,
        onPremiseCidrBlock: envVars.ONPREMISE_CIDR_BOCK,
      }).addDependency(tgwStack);
    }
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

validateEnvVariables();
new MyStack(app, 'multivpc-stack', { env: devEnv });
// new MyStack(app, 'my-stack-prod', { env: prodEnv });

app.synth();