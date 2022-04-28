import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { envVars } from '../config';

export interface EndpointConstructProps {
  vpc: ec2.IVpc;
  stage: string;
  associatedVpc: ec2.IVpc[];
}

export class EndpointConstruct extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: EndpointConstructProps) {
    super(scope, id);

    if ( props.stage === 'shared') {
      envVars.INTERFACE_VPC_ENDPOINT_SERVICE.forEach((svc) => {
        let endpointSg = new ec2.SecurityGroup(this, `shared-${svc}-endpoint-sg`, {
          vpc: props.vpc,
          allowAllOutbound: true,
          securityGroupName: `shared-${svc}-endpoint-sg`,
        });

        envVars.VPC_ENV_INFO.forEach((v) => {
          if (v.STAGE === 'dev' || v.STAGE === 'prod') {
            endpointSg.addIngressRule(ec2.Peer.ipv4(v.VPC_CIDR_BLOCK), ec2.Port.tcp(443));
          }
        });

        let interfaceVpcEndpoint = new ec2.InterfaceVpcEndpoint(this, `${svc}Endpoint`, {
          vpc: props.vpc,
          service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.ap-northeast-2.${svc}`),
          securityGroups: [endpointSg],
          privateDnsEnabled: false,
        });

        let zone = new route53.PrivateHostedZone(this, `${svc}HostedZone`, {
          zoneName: `${svc}.ap-northeast-2.amazonaws.com`,
          vpc: props.vpc, // At least one VPC has to be added to a Private Hosted Zone.
        });

        new route53.ARecord(this, `${svc}AliasRecord`, {
          zone,
          target: route53.RecordTarget.fromAlias(new targets.InterfaceVpcEndpointTarget(interfaceVpcEndpoint)),
        });


        props.associatedVpc.forEach((vpc) => {
          zone.addVpc(vpc);
        });

      });
    }

  }
}