import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MyStack } from '../src/main';

test('Snapshot', () => {
  const app = new App();

  const devEnv = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  };
  const stack = new MyStack(app, 'test', { env: devEnv });

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});