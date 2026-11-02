import { App } from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new App();

new PipelineStack(app, 'MultiRepoPipeline', {
  githubOwner: app.node.getContext('githubOwner'),
  env: { region: 'eu-north-1' },
});
