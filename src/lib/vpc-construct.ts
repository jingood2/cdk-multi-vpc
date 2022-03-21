import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
//import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { envVars } from '../config';

export interface CustomProps extends cdk.StackProps {
  company: string;
  project: string;
  stage: string;
  tgwCidrBlock?: string[];
  tgwRtbId?: string;
  useNATInstance?: boolean;
}

export interface VpcStackProps {
  customProps: CustomProps;
  vpcProps: ec2.VpcProps;
}

export class VpcConstruct extends cdk.NestedStack {
  public readonly vpc:ec2.Vpc;

  // 알아서 vpc에서 참조해서 생성?
  get availabilityZones(): string[] {
    return ['ap-northeast-2a', 'ap-northeast-2c'];
  }

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id );

    // 1. VPC
    this.vpc = new ec2.Vpc(this, `${props.customProps.company}-${props.customProps.project}-${props.customProps.stage}-vpc`, {
      cidr: props.vpcProps.cidr || '172.27.0.0/24',
      natGatewayProvider: props.customProps.useNATInstance ? ec2.NatProvider.instance({
        instanceType: new ec2.InstanceType('t2.micro'),
      }) : undefined,
      enableDnsHostnames: props.vpcProps.enableDnsHostnames || true,
      enableDnsSupport: props.vpcProps.enableDnsSupport || true,
      natGateways: props.vpcProps.natGateways ?? 0,
      maxAzs: props.vpcProps.maxAzs || 2,
      subnetConfiguration: props.vpcProps.subnetConfiguration ?? [
        { name: 'pub', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 28 },
        { name: 'pri', subnetType: ec2.SubnetType.PRIVATE_WITH_NAT, cidrMask: 22 },
      ],
    });

    if (envVars.ENABLE_TGW_USE == 'true') {
      const tgwId = ssm.StringParameter.fromStringParameterAttributes(this, 'TGWId', {
        parameterName: `/${envVars.PROJECT_NAME}/tgw/id`,
      }).stringValue;

      const attachment = new ec2.CfnTransitGatewayAttachment(this, `TGWAttachment${props.customProps.stage}`, {
        transitGatewayId: tgwId,
        vpcId: this.vpc.vpcId,
        subnetIds: this.vpc.selectSubnets({ subnetGroupName: 'pri' }).subnetIds,
        tags: [
          { key: 'Name', value: `${props.customProps.company}-${props.customProps.stage}-${props.customProps.project}-tgw-attach` },
        ],
      });

      // Create TgwRoute
      let subnets: ec2.ISubnet[];
      subnets = (props.customProps.stage == 'dmz') ? this.vpc.publicSubnets : this.vpc.isolatedSubnets ;

      // DMZ VPC가 아닌경우, 모든 IsolSubnet의  Route Table에 추가
      for (let subnet of subnets) {
        if (props.customProps.tgwCidrBlock != undefined) {
          for ( let destCidrBlock of props.customProps.tgwCidrBlock ) {
            new ec2.CfnRoute(this, `Route-${destCidrBlock}-${subnet.availabilityZone}`, {
              routeTableId: subnet.routeTable.routeTableId,
              destinationCidrBlock: destCidrBlock,
              transitGatewayId: tgwId,
            }).addDependsOn(attachment);
          }
        }
      };

      const tgwRtbId = ssm.StringParameter.fromStringParameterName(this, 'TgwRtb', `/${envVars.PROJECT_NAME}/tgwRtb/id`).stringValue;

      // ToDo: Add TgwRoute to TgwRtb
      new ec2.CfnTransitGatewayRoute(this, `TGWRoute${props.customProps.stage}`, {
        transitGatewayAttachmentId: attachment.ref,
        destinationCidrBlock: this.vpc.vpcCidrBlock,
        transitGatewayRouteTableId: tgwRtbId,
      }) ;

      if ( props.customProps.stage == 'dmz') {
        new ec2.CfnTransitGatewayRoute(this, `TGWRouteDefault${props.customProps.stage}`, {
          transitGatewayAttachmentId: attachment.ref,
          destinationCidrBlock: '0.0.0.0/0',
          transitGatewayRouteTableId: tgwRtbId,
        }) ;
      }

      new ec2.CfnTransitGatewayRouteTableAssociation(this, `TGWAssoc${props.customProps.stage}`, {
        transitGatewayAttachmentId: attachment.ref,
        transitGatewayRouteTableId: tgwRtbId,

      });

      new ec2.CfnTransitGatewayRouteTablePropagation(this, `TGWPropagation${props.customProps.stage}`, {
        transitGatewayAttachmentId: attachment.ref,
        transitGatewayRouteTableId: tgwRtbId,
      });

      if ( envVars.ENABLE_ZCP_USE == 'true' && props.customProps.stage != 'dmz') {
        let cidr = new ec2.CfnVPCCidrBlock(this, 'AdditionalCidrForZCPPod', {
          vpcId: this.vpc.vpcId,
          cidrBlock: '100.26.0.0/21',
        });
        this.availabilityZones.forEach((az, idx) => {
          let localZoneSubnet = new ec2.PrivateSubnet(this, `ZcpPodSubnet${idx}`, {
            availabilityZone: az,
            vpcId: this.vpc.vpcId,
            cidrBlock: `100.26.${idx * 4}.0/22`,
          });

          cdk.Tags.of(localZoneSubnet).add('Name', `${props.customProps.project}-${props.customProps.stage}-zcp-${String(idx+1).padStart(2, '0')}`);

          localZoneSubnet.node.addDependency(cidr);

          new ec2.CfnRoute(this, `Route-${localZoneSubnet.availabilityZone}`, {
            routeTableId: localZoneSubnet.routeTable.routeTableId,
            destinationCidrBlock: '0.0.0.0/0',
            transitGatewayId: tgwId,
          }).addDependsOn(attachment);
        });
      }
    }

    new ssm.StringParameter(this, 'VpcId', {
      description: `${envVars.PROJECT_NAME} TGW Egress Route Table Id`,
      parameterName: `/${props.customProps.project}/${props.customProps.stage}/vpcid`,
      stringValue: this.vpc.vpcId,
      tier: ssm.ParameterTier.ADVANCED,
    });

    new cdk.CfnOutput(this, `${props.customProps.stage}VpcId`, {
      value: this.vpc.vpcId,
      exportName: `${props.customProps.stage}VpcId`,
    });


    if ( props.customProps.stage === 'shared') {
      envVars.INTERFACE_VPC_ENDPOINT_SERVICE.forEach((svc) => {
        let endpointSg = new ec2.SecurityGroup(this, `shared-${svc}-endpoint-sg`, {
          vpc: this.vpc,
          allowAllOutbound: true,
          securityGroupName: `shared-${svc}-endpoint-sg`,
        });

        envVars.VPC_ENV_INFO.forEach((v) => {
          if (v.STAGE === 'dev' || v.STAGE === 'prod') {
            endpointSg.addIngressRule(ec2.Peer.ipv4(v.VPC_CIDR_BLOCK), ec2.Port.tcp(443));
          }
        });

        let interfaceVpcEndpoint = new ec2.InterfaceVpcEndpoint(this, `${svc}Endpoint`, {
          vpc: this.vpc,
          service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.ap-northeast-2.${svc}`),
          securityGroups: [endpointSg],
          privateDnsEnabled: false,
        });

        let zone = new route53.PrivateHostedZone(this, `${svc}HostedZone`, {
          zoneName: `${svc}.ap-northeast-2.amazonaws.com`,
          vpc: this.vpc, // At least one VPC has to be added to a Private Hosted Zone.
        });

        new route53.ARecord(this, `${svc}AliasRecord`, {
          zone,
          target: route53.RecordTarget.fromAlias(new targets.InterfaceVpcEndpointTarget(interfaceVpcEndpoint)),
        });

      });
    }


    // ToDo: TgwRtbPropagation
    /* if (props.customProps.stage == 'shared') {

      const endpointSg = new ec2.SecurityGroup(this, 'shared-endpoint-sg', {
        vpc: this.vpc,
        allowAllOutbound: true,
        securityGroupName: 'shared-endpoint-sg',
      });


      envVars.VPC_ENV_INFO.forEach((v) => {
        if (v.STAGE === 'dev' || v.STAGE === 'prod') {
          endpointSg.addIngressRule(ec2.Peer.ipv4(v.VPC_CIDR_BLOCK), ec2.Port.tcp(443));
        }
      });

      new ec2.InterfaceVpcEndpoint(this, 'EcrDockerEndpoint', {
        vpc: this.vpc,
        service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        securityGroups: [endpointSg],
        privateDnsEnabled: false,
      });

      new ec2.InterfaceVpcEndpoint(this, 'S3Endpoint', {
        vpc: this.vpc,
        service: new ec2.InterfaceVpcEndpointService('com.amazonaws.ap-northeast-2.s3'),
        securityGroups: [endpointSg],
        privateDnsEnabled: false,
      });
      endpointSg.addIngressRule(ec2.Peer.ipv4('10.1.0.0/18'), ec2.Port.tcp(443));
      endpointSg.addIngressRule(ec2.Peer.ipv4('10.2.0.0/18'), ec2.Port.tcp(443));

      /* const S3Endpoint = this.vpc.addGatewayEndpoint('S3GatewayEndpoint', {
        service: ec2.GatewayVpcEndpointAwsService.S3,
        subnets: [{ subnetGroupName: 'pri' }],
      });

      S3Endpoint.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          resources: [
            '*',
          ],
          actions: [
            's3:*',
          ],
          principals: [
            new iam.AnyPrincipal(),
          ],
        }),
      );
    }
    */


    // INFO: VPC Name
    cdk.Tags.of(this.vpc).add('Name', `${props.customProps.project}-${props.customProps.stage}-vpc`);

    // INFO: VPC Subnet Naming
    const subnetConfigs = props.vpcProps.subnetConfiguration || [
      { name: 'PUB', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 28 },
      { name: 'PRI', subnetType: ec2.SubnetType.PRIVATE_WITH_NAT, cidrMask: 26 },
    ];

    subnetConfigs.forEach(subnetConfig => {
      let selectedSubnets = this.vpc.selectSubnets({
        subnetGroupName: subnetConfig.name,
      });

      selectedSubnets.subnets.forEach((value, index) => {
        cdk.Tags.of(value).add('Name', `${props.customProps.project}-${props.customProps.stage}-${subnetConfig.name}-${String(index+1).padStart(2, '0')}`);
      });

    });

    // CloudZ Tags
    cdk.Tags.of(this).add('cz-project', `${envVars.PROJECT_NAME}` );
    cdk.Tags.of(this).add('cz-org', `${envVars.COMPANY_NAME}`);
    cdk.Tags.of(this).add('cz-stage', props.customProps.stage);
    cdk.Tags.of(this).add('cz-ext1', ' ' );
    cdk.Tags.of(this).add('cz-ext2', ' ' );
    cdk.Tags.of(this).add('cz-ext3', ' ' );

  }
}