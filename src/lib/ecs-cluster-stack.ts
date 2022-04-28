import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';

export interface EcsClusterProps {

}

export class EcsCluster extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props?: EcsClusterProps ) {
    super(scope, id);

    console.log(props);

    //const vpcId = ssm.StringParameter.fromStringParameterName(this, 'dev-vpcid', '/network/dev/vpcid' );


    new ecs.Cluster(this, 'Cluster', {
      clusterName: 'ecs-dev-cluster',
      vpc: ec2.Vpc.fromLookup(this, 'DevVpc', { vpcId: 'vpc-094850f179dd7c228' }),
    });


  }
}