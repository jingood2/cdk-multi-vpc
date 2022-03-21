import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { envVars } from '../config';


export class TgwConstruct extends cdk.NestedStack {

  public readonly tgwId: cdk.CfnOutput;
  public readonly egressRtbId: cdk.CfnOutput;
  public readonly tgwRtbId: cdk.CfnOutput;

  constructor(scope: Construct, id: string ) {
    super(scope, id );

    // from ssm

    const tgw = new ec2.CfnTransitGateway(this, 'TransitGateway', {
      amazonSideAsn: 65000,
      description: `${envVars.PROJECT_NAME} TransitGateway `,
      autoAcceptSharedAttachments: 'enable',
      defaultRouteTableAssociation: 'enable',
      defaultRouteTablePropagation: 'enable',
      dnsSupport: 'enable',
      vpnEcmpSupport: 'enable',
      tags: [{ key: 'Name', value: `${envVars.PROJECT_NAME}-tgw` }],
    });

    // TGW Route Tables
    const egressRtb = new ec2.CfnTransitGatewayRouteTable(this, 'EgressRouteTable', {
      transitGatewayId: tgw.ref,
      tags: [{ key: 'Name', value: `${envVars.PROJECT_NAME}-tgw-egress-rtb` }],
    });
    egressRtb.addDependsOn(tgw);


    const tgwRtb = new ec2.CfnTransitGatewayRouteTable(this, 'TransitRouteTable', {
      transitGatewayId: tgw.ref,
      tags: [{ key: 'Name', value: `${envVars.PROJECT_NAME}-tgw-rtb` }],
    });
    tgwRtb.addDependsOn(tgw);

    // put transitGatewayId on ssm parameter store
    new ssm.StringParameter(this, 'Parameter', {
      description: `${envVars.PROJECT_NAME} TransitGateway Id`,
      parameterName: `/${envVars.PROJECT_NAME}/tgw/id`,
      stringValue: tgw.ref,
      tier: ssm.ParameterTier.ADVANCED,
    });

    new ssm.StringParameter(this, 'TgwRtbParameter', {
      description: `${envVars.PROJECT_NAME} TGW Route Table Id`,
      parameterName: `/${envVars.PROJECT_NAME}/tgwRtb/id`,
      stringValue: tgwRtb.ref,
      tier: ssm.ParameterTier.ADVANCED,
    });

    new ssm.StringParameter(this, 'TgwEgressRtbParameter', {
      description: `${envVars.PROJECT_NAME} TGW Egress Route Table Id`,
      parameterName: `/${envVars.PROJECT_NAME}/egressRtb/id`,
      stringValue: egressRtb.ref,
      tier: ssm.ParameterTier.ADVANCED,
    });

    this.tgwId = new cdk.CfnOutput(this, 'Tgw', {
      value: tgw.ref,
    });
    this.egressRtbId = new cdk.CfnOutput(this, 'EgressRtbId', {
      value: egressRtb.ref,
    });
    this.tgwRtbId = new cdk.CfnOutput(this, 'TgwRtbId', {
      value: tgwRtb.ref,
    });

  }
}