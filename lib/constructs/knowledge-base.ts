import { Construct } from "constructs";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import * as iam from "aws-cdk-lib/aws-iam";
import * as osServerless from "aws-cdk-lib/aws-opensearchserverless";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { KnowledgeBaseDataSource } from "./knowledge-base-data-source";

interface KnowledgeBaseProps {
  embeddingModel: bedrock.FoundationModel;
  collection: osServerless.CfnCollection;
  vectorIndexName: string;
  serviceRole: iam.Role;
  sourceBucket?: s3.Bucket;
  fieldMapping: {
    vectorField: string;
    metadataField: string;
    textField: string;
  };
}

export class KnowledgeBase extends cdk.NestedStack {
  public readonly role: iam.Role;
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  public readonly dataSource: bedrock.CfnDataSource;

  public constructor(scope: Construct, id: string, props: KnowledgeBaseProps) {
    super(scope, id);

    this.role = props.serviceRole;

    const sourceBucket =
      props.sourceBucket ?? new s3.Bucket(this, "source-bucket");

    const grantable = sourceBucket.grantRead(this.role);
    grantable.assertSuccess();

    const knowledgeBaseName = `${cdk.Names.uniqueResourceName(this, {
      maxLength: 64,
    })}-${props.vectorIndexName}`;

    this.knowledgeBase = new bedrock.CfnKnowledgeBase(this, "knowledge-base", {
      name: knowledgeBaseName,
      roleArn: props.serviceRole.roleArn,
      storageConfiguration: {
        opensearchServerlessConfiguration: {
          collectionArn: props.collection.attrArn,
          vectorIndexName: props.vectorIndexName,
          fieldMapping: props.fieldMapping,
        },
        type: "OPENSEARCH_SERVERLESS",
      },
      knowledgeBaseConfiguration: {
        type: "VECTOR",
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: props.embeddingModel.modelArn,
        },
      },
    });

    // TODO add data sources for evaluation

    this.dataSource = new bedrock.CfnDataSource(this, "data-source", {
      name: "demo-example",
      knowledgeBaseId: this.knowledgeBase.ref,
      // Otherwise the deletion fails due to permissions issues
      dataDeletionPolicy: "RETAIN",
      dataSourceConfiguration: {
        type: "S3",
        s3Configuration: {
          bucketArn: sourceBucket.bucketArn,
        },
      },
    });

    this.role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: [props.embeddingModel.modelArn],
      })
    );

    // TODO parsing strategy
  }

  public syncDataSourceAfterCreation() {
    // TODO start sync
  }

  public syncDataSourceOnSchedule() {
    // TODO start sync
  }

  public addDataSource(id: string) {
    // TODO add data sources
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_bedrock.CfnDataSource.html

    const sourceBucket = new s3.Bucket(this, `source-bucket-${id}`, {
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    sourceBucket.grantRead(this.role);
    new KnowledgeBaseDataSource(this, `data-source-${id}`, {
      bucket: sourceBucket,
      knowledgeBase: this.knowledgeBase,
      name: "dummy",
    });
  }
}
