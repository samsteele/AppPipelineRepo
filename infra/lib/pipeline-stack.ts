import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { CfnConnection } from 'aws-cdk-lib/aws-codeconnections';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface PipelineStackProps extends StackProps {
  githubOwner: string;
}

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    // Starts as PENDING. Approve it once in the console:
    // CodePipeline > Settings > Connections > Update pending connection.
    const connection = new CfnConnection(this, 'GitHubConnection', {
      connectionName: 'multi-repo-demo',
      providerType: 'GitHub',
    });

    // Public S3 website. Bucket policies may grant public read; ACLs may not.
    const site = new s3.Bucket(this, 'SiteBucket', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // One source action per repo, tracking `main`. The artifact name becomes
    // $CODEBUILD_SRC_DIR_<repo> inside CodeBuild.
    const source = (repo: string, { fullClone = false } = {}) => {
      const output = new codepipeline.Artifact(repo);
      const action = new actions.CodeStarConnectionsSourceAction({
        actionName: repo,
        connectionArn: connection.attrConnectionArn,
        owner: props.githubOwner,
        repo,
        branch: 'main',
        output,
        // A full git clone, tags included, instead of a zip of one commit.
        codeBuildCloneOutput: fullClone,
      });
      return { action, output };
    };

    const app = source('AppPipelineRepo');
    const repoA = source('TriggerRepoA', { fullClone: true });
    const repoB = source('TriggerRepoB', { fullClone: true });

    const dist = new codepipeline.Artifact('dist');

    const render = new actions.CodeBuildAction({
      actionName: 'Render',
      project: new codebuild.PipelineProject(this, 'Build', {
        environment: { buildImage: codebuild.LinuxBuildImage.STANDARD_7_0 },
      }),
      input: app.output,
      // At most 5 inputs in all. See "More than five sources" in the README.
      extraInputs: [repoA.output, repoB.output],
      outputs: [dist],
    });

    const publish = new actions.S3DeployAction({
      actionName: 'Publish',
      bucket: site,
      input: dist,
      cacheControl: [actions.CacheControl.noCache()],
    });

    new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'multi-repo-demo',
      // Git triggers with branch and tag filters need a V2 pipeline.
      pipelineType: codepipeline.PipelineType.V2,
      stages: [
        { stageName: 'Source', actions: [app.action, repoA.action, repoB.action] },
        { stageName: 'Build', actions: [render] },
        { stageName: 'Deploy', actions: [publish] },
      ],
      // A trigger replaces a source action's default "run on every push to
      // its branch" with the filter given here.
      triggers: [
        onPush(app.action, { branchesIncludes: ['main'] }),
        onPush(repoA.action, { tagsIncludes: ['v*'] }),
        onPush(repoB.action, { tagsIncludes: ['v*'] }),
      ],
    });

    new CfnOutput(this, 'SiteUrl', { value: site.bucketWebsiteUrl });
  }
}

function onPush(
  sourceAction: codepipeline.IAction,
  filter: codepipeline.GitPushFilter,
): codepipeline.TriggerProps {
  return {
    providerType: codepipeline.ProviderType.CODE_STAR_SOURCE_CONNECTION,
    gitConfiguration: { sourceAction, pushFilter: [filter] },
  };
}
