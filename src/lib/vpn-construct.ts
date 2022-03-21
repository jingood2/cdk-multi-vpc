import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import * as customresource from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { envVars } from '../config';

export interface CdkVpnStackProps {
  vpnIpAddress: string;
  bgpArn: number;
  onPremiseCidrBlock: string;
}

export class VpnConstruct extends cdk.NestedStack {

  public readonly vpnConfig:string = '';

  constructor(scope: Construct, id: string, props: CdkVpnStackProps) {
    super(scope, id );

    // Customer Gateway
    const cg = new ec2.CfnCustomerGateway(this, `customerGateway-${id}`, {
      bgpAsn: props.bgpArn ?? 65000,
      ipAddress: props.vpnIpAddress,
      type: 'ipsec.1',
      tags: [
        { key: 'Name', value: `${envVars.COMPANY_NAME}-${envVars.PROJECT_NAME}-cgw-${id}` },
      ],
    });

    if (envVars.ENABLE_TGW_USE == 'true') {
      const tgwId = StringParameter.fromStringParameterAttributes(this, 'MyValue', {
        parameterName: `/${envVars.PROJECT_NAME}/tgw/id`,
        // 'version' can be specified but is optional.
      }).stringValue;

      // Site to Site VPN
      const vpnConn = new ec2.CfnVPNConnection(this, `VPNConn${id}`, {
        customerGatewayId: cg.ref,
        type: 'ipsec.1',
        staticRoutesOnly: true,
        transitGatewayId: tgwId,
        tags: [
          { key: 'Name', value: `${envVars.COMPANY_NAME}-${envVars.PROJECT_NAME}-vpnconn-${id}` },
        ],
      });

      const sdkCall: customresource.AwsSdkCall = {
        service: 'EC2',
        action: 'describeTransitGatewayAttachments',
        parameters: {
          Filters: [{
            Name: 'resource-id',
            Values: [
              vpnConn.ref,
            ],
          }],
        },
        physicalResourceId: customresource.PhysicalResourceId.of(vpnConn.ref),
      };

      const customResourceGetTgwAttId = new customresource.AwsCustomResource(this, 'custom-resource-get-tgw-attr-id', {
        onCreate: sdkCall,
        onUpdate: sdkCall,
        policy: customresource.AwsCustomResourcePolicy.fromSdkCalls({ resources: ['*'] }),
      });
      customResourceGetTgwAttId.node.addDependency(vpnConn);

      const vpnTransitGatewayAttachmentId = customResourceGetTgwAttId.getResponseField('TransitGatewayAttachments.0.TransitGatewayAttachmentId');

      const tgwRtbId = StringParameter.fromStringParameterName(this, 'TgwRtb', `/${envVars.PROJECT_NAME}/tgwRtb/id`).stringValue;

      // Update TGW Route Table
      new ec2.CfnTransitGatewayRoute(this, 'TGWVPNRoute', {
        transitGatewayAttachmentId: vpnTransitGatewayAttachmentId,
        destinationCidrBlock: props.onPremiseCidrBlock,
        transitGatewayRouteTableId: tgwRtbId,
      });

      // Update TGW Route Table Association
      new ec2.CfnTransitGatewayRouteTableAssociation(this, 'TGWVPNAssociation', {
        transitGatewayAttachmentId: vpnTransitGatewayAttachmentId,
        transitGatewayRouteTableId: tgwRtbId,
      });


      // Download VPN Configuration
      // const vpnDeviceTypeSdkCall: customresource.AwsSdkCall = {
      //   service: 'EC2',
      //   action: 'getVpnConnectionDeviceTypes',
      //   parameters: {
      //   },
      // };

      // const customResourceGetVpnDevice = new customresource.AwsCustomResource(this, 'custom-resource-get-vpn-device', {
      //   onCreate: vpnDeviceTypeSdkCall,
      //   onUpdate: vpnDeviceTypeSdkCall,
      //   policy: customresource.AwsCustomResourcePolicy.fromSdkCalls({ resources: ['*'] }),
      // });
      // const vpnDeviceVendor = customResourceGetVpnDevice.getResponseField('VpnConnectionDeviceTypes.0.Vendor');
      // const vpnDevicePlatform = customResourceGetVpnDevice.getResponseField('VpnConnectionDeviceTypes.0.Platform');
      // const vpnDeviceSoftware = customResourceGetVpnDevice.getResponseField('VpnConnectionDeviceTypes.0.Software');

      const vpnDeviceVendor = 'Openswan';
      const vpnDevicePlatform = 'Openswan';
      const vpnDeviceSoftware = 'Openswan 2.6.38+';

      const vpnConfigSdkCall: customresource.AwsSdkCall = {
        service: 'EC2',
        action: 'getVpnConnectionDeviceSampleConfiguration',
        parameters: {
          VpnConnectionDeviceTypeId: `${vpnDeviceVendor}:${vpnDevicePlatform}:${vpnDeviceSoftware}`,
          VpnConnectionId: vpnConn.ref,
          // InternetKeyExchangeVersion: '',
        },
        physicalResourceId: customresource.PhysicalResourceId.of(vpnConn.ref),
      };

      const customResourceGetVpnConfig = new customresource.AwsCustomResource(this, 'custom-resource-get-vpn-config', {
        onCreate: vpnConfigSdkCall,
        onUpdate: vpnConfigSdkCall,
        policy: customresource.AwsCustomResourcePolicy.fromSdkCalls({ resources: ['*'] }),
      });
      customResourceGetVpnConfig.node.addDependency(vpnConn);

      this.vpnConfig = customResourceGetVpnConfig.getResponseField('VpnConnectionDeviceSampleConfiguration');


    }

    /* const customResourceGetTgwAttId = new customresource.AwsCustomResource(this, 'custom-resource-get-tgw-attr-id', {
      onCreate: sdkCall,
      onUpdate: sdkCall,
      policy: customresource.AwsCustomResourcePolicy.fromSdkCalls({ resources: ['*'] }),
    });
    customResourceGetTgwAttId.node.addDependency(vpnConn);

    const vpnTransitGatewayAttachmentId = customResourceGetTgwAttId.getResponseField('TransitGatewayAttachments.0.TransitGatewayAttachmentId');

    const tgwRtbId = ssm.StringParameter.fromStringParameterName(this, 'TgwRtb', `/${envVars.PROJECT_NAME}/tgwRtb/id`).stringValue;

    // Update TGW Route Table
    new ec2.CfnTransitGatewayRoute(this, 'TGWVPNRoute', {
      transitGatewayAttachmentId: vpnTransitGatewayAttachmentId,
      destinationCidrBlock: props.onPremiseCidrBlock,
      transitGatewayRouteTableId: tgwRtbId,
    });

    // Update TGW Route Table Association
    new ec2.CfnTransitGatewayRouteTableAssociation(this, 'TGWVPNAssociation', {
      transitGatewayAttachmentId: vpnTransitGatewayAttachmentId,
      transitGatewayRouteTableId: tgwRtbId,
    }); */


    /* new CfnVPNConnectionRoute(scope, `VPNConnRoute${id}`, {
      destinationCidrBlock: '172.16.0.0/16',
      vpnConnectionId: vpnConn.ref,
    } );
 */

    //ssm.StringParameter.fromStringParameterName(this, 'TgwRtb', `/${envVars.PROJECT_NAME}/tgwRtb/id`).stringValue;

    /* void aws.ec2transitgateway.getVpnAttachment({
      transitGatewayId: props.tgwId,
      vpnConnectionId: vpnConnection.ref,
    }).then(result => {

      // Update TGW Route Table
      new ec2.CfnTransitGatewayRoute(this, 'TGWVPNRoute', {
        transitGatewayAttachmentId: result.id,
        destinationCidrBlock: props.onPremiseCidrBlock,
        transitGatewayRouteTableId: tgwRtbId,
      });

      // Update TGW Route Table Association
      new ec2.CfnTransitGatewayRouteTableAssociation(this, 'TGWVPNAssociation', {
        transitGatewayAttachmentId: result.id,
        transitGatewayRouteTableId: tgwRtbId,
      });
    }); */

  }
}